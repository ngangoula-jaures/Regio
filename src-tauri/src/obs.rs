//! OBS embarqué : Regio installe, configure, lance et surveille sa propre copie d'OBS Studio
//! (mode portable). L'utilisateur n'ouvre jamais OBS, et un OBS déjà installé sur le PC n'est pas touché.
//!
//! Cycle : installé ? (sinon téléchargement vérifié + extraction) → configuration → lancement caché
//! → surveillance (relance automatique en cas de plantage) → arrêt à la fermeture de Regio.

use std::{
    fs,
    io::Write,
    net::TcpListener,
    path::{Path, PathBuf},
    process::{Child, Command},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
    time::{Duration, Instant},
};

use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Manager};

/// Version d'OBS embarquée : testée avec Regio, mise à jour seulement après nos tests.
const OBS_VERSION: &str = "33.0.1";
const OBS_URL: &str = "https://github.com/obsproject/obs-studio/releases/download/33.0.1/OBS-Studio-33.0.1-Windows-x64.zip";
const OBS_SHA256: &str = "0d9436451c2d772b33428e3fdae9776f071895c335de17283176306fb72651d3";
/// Numéro interne d'OBS pour 33.0.1 (évite l'écran « Nouveautés » au premier lancement).
const OBS_VERSION_CODE: u32 = (33 << 24) | 1;
/// Port WebSocket préféré : différent du 4455 d'un OBS installé par ailleurs.
const PREFERRED_PORT: u16 = 4466;
/// Au-delà de 5 plantages en 2 minutes, on arrête de relancer et on affiche une erreur.
const MAX_CRASHES: usize = 5;
const CRASH_WINDOW: Duration = Duration::from_secs(120);

/// État visible par l'interface.
#[derive(Clone, Serialize)]
#[serde(tag = "state", rename_all = "camelCase")]
pub enum ObsState {
    Preparing,
    /// Téléchargement : `progress` de 0 à 1.
    Downloading { progress: f32 },
    Installing,
    Starting,
    Running { port: u16, password: String },
    Error { message: String },
}

/// Réglages conservés entre deux lancements (mot de passe généré une fois).
#[derive(Serialize, Deserialize)]
struct Saved {
    password: String,
}

pub struct ObsManager {
    state: Mutex<ObsState>,
    child: Mutex<Option<Child>>,
    quitting: AtomicBool,
}

impl ObsManager {
    pub fn new() -> Arc<Self> {
        Arc::new(Self { state: Mutex::new(ObsState::Preparing), child: Mutex::new(None), quitting: AtomicBool::new(false) })
    }

    pub fn state(&self) -> ObsState {
        self.state.lock().unwrap().clone()
    }

    fn set(&self, s: ObsState) {
        *self.state.lock().unwrap() = s;
    }

    /// Démarre tout le cycle en arrière-plan.
    pub fn start(self: &Arc<Self>, app: AppHandle) {
        let me = self.clone();
        tauri::async_runtime::spawn(async move {
            if let Err(e) = me.run(app).await {
                me.set(ObsState::Error { message: e });
            }
        });
    }

    /// Ferme OBS (à la fermeture de Regio).
    pub fn stop(&self) {
        self.quitting.store(true, Ordering::SeqCst);
        if let Some(mut child) = self.child.lock().unwrap().take() {
            let _ = child.kill();
            let _ = child.wait();
        }
    }

    async fn run(self: &Arc<Self>, app: AppHandle) -> Result<(), String> {
        let base = app.path().app_local_data_dir().map_err(|e| e.to_string())?.join("obs");
        let root = base.join(OBS_VERSION);
        let exe = root.join("bin").join("64bit").join("obs64.exe");

        if !exe.exists() {
            self.download_and_install(&base, &root).await?;
        }

        let password = load_or_create_password(&base)?;
        let port = free_port(PREFERRED_PORT).ok_or("aucun port libre pour la connexion à OBS")?;
        configure(&root, port, &password)?;

        // Surveillance dans un fil dédié : lancement, attente, relance si plantage.
        let me = self.clone();
        std::thread::spawn(move || me.supervise(&exe, port, &password));
        Ok(())
    }

    fn supervise(&self, exe: &Path, port: u16, password: &str) {
        let mut crashes: Vec<Instant> = Vec::new();
        while !self.quitting.load(Ordering::SeqCst) {
            self.set(ObsState::Starting);
            let child = Command::new(exe)
                .current_dir(exe.parent().unwrap())
                .args(["--portable", "--minimize-to-tray", "--disable-shutdown-check", "--disable-updater", "--multi"])
                .spawn();
            let child = match child {
                Ok(c) => c,
                Err(e) => {
                    self.set(ObsState::Error { message: format!("Impossible de démarrer le moteur vidéo : {e}") });
                    return;
                }
            };
            *self.child.lock().unwrap() = Some(child);

            // Prêt quand le serveur WebSocket d'OBS répond.
            let started = Instant::now();
            while started.elapsed() < Duration::from_secs(60) && !self.quitting.load(Ordering::SeqCst) {
                if std::net::TcpStream::connect(("127.0.0.1", port)).is_ok() {
                    self.set(ObsState::Running { port, password: password.to_string() });
                    break;
                }
                if self.exited() {
                    break;
                }
                std::thread::sleep(Duration::from_millis(300));
            }

            // Attendre la fin du processus.
            loop {
                if self.quitting.load(Ordering::SeqCst) || self.exited() {
                    break;
                }
                std::thread::sleep(Duration::from_millis(500));
            }
            if self.quitting.load(Ordering::SeqCst) {
                return;
            }

            // Plantage ou fermeture inattendue : relance, sauf si cela se répète trop.
            let now = Instant::now();
            crashes.retain(|t| now.duration_since(*t) < CRASH_WINDOW);
            crashes.push(now);
            if crashes.len() >= MAX_CRASHES {
                self.set(ObsState::Error {
                    message: "Le moteur vidéo s'arrête sans cesse. Redémarrez Regio ; si le problème continue, redémarrez le PC.".into(),
                });
                return;
            }
            std::thread::sleep(Duration::from_secs(2));
        }
    }

    /// Le processus OBS est-il terminé ?
    fn exited(&self) -> bool {
        match self.child.lock().unwrap().as_mut() {
            Some(c) => !matches!(c.try_wait(), Ok(None)),
            None => true,
        }
    }

    async fn download_and_install(&self, base: &Path, root: &Path) -> Result<(), String> {
        fs::create_dir_all(base).map_err(|e| e.to_string())?;
        let zip_path = base.join(format!("OBS-Studio-{OBS_VERSION}.zip"));

        // Téléchargement avec progression et empreinte calculée au fil de l'eau.
        self.set(ObsState::Downloading { progress: 0.0 });
        let res = reqwest::get(OBS_URL).await.map_err(|e| format!("Téléchargement du moteur vidéo impossible : {e}"))?;
        if !res.status().is_success() {
            return Err(format!("Téléchargement du moteur vidéo impossible (HTTP {})", res.status()));
        }
        let total = res.content_length().unwrap_or(0);
        let mut file = fs::File::create(&zip_path).map_err(|e| e.to_string())?;
        let mut hasher = Sha256::new();
        let mut done: u64 = 0;
        let mut stream = res.bytes_stream();
        while let Some(chunk) = stream.next().await {
            let chunk = chunk.map_err(|e| format!("Téléchargement interrompu : {e}"))?;
            hasher.update(&chunk);
            file.write_all(&chunk).map_err(|e| e.to_string())?;
            done += chunk.len() as u64;
            if total > 0 {
                self.set(ObsState::Downloading { progress: done as f32 / total as f32 });
            }
        }
        drop(file);
        let digest = hasher.finalize().iter().map(|b| format!("{b:02x}")).collect::<String>();
        if digest != OBS_SHA256 {
            let _ = fs::remove_file(&zip_path);
            return Err("Le fichier téléchargé est corrompu (empreinte incorrecte). Réessayez.".into());
        }

        // Extraction dans un dossier temporaire, renommé seulement si tout s'est bien passé.
        self.set(ObsState::Installing);
        let tmp = base.join(format!("{OBS_VERSION}.tmp"));
        let _ = fs::remove_dir_all(&tmp);
        let zip_for_task = zip_path.clone();
        let tmp_for_task = tmp.clone();
        tauri::async_runtime::spawn_blocking(move || -> Result<(), String> {
            let f = fs::File::open(&zip_for_task).map_err(|e| e.to_string())?;
            let mut archive = zip::ZipArchive::new(f).map_err(|e| e.to_string())?;
            archive.extract(&tmp_for_task).map_err(|e| e.to_string())
        })
        .await
        .map_err(|e| e.to_string())??;

        // Certaines archives contiennent un dossier racine : on remonte au dossier qui contient bin/.
        let content = find_obs_root(&tmp).ok_or("Archive d'OBS inattendue (dossier bin introuvable)")?;
        let _ = fs::remove_dir_all(root);
        fs::rename(&content, root).map_err(|e| e.to_string())?;
        let _ = fs::remove_dir_all(&tmp);
        let _ = fs::remove_file(&zip_path);
        Ok(())
    }
}

fn find_obs_root(dir: &Path) -> Option<PathBuf> {
    if dir.join("bin").join("64bit").join("obs64.exe").exists() {
        return Some(dir.to_path_buf());
    }
    fs::read_dir(dir).ok()?.flatten().map(|e| e.path()).filter(|p| p.is_dir()).find_map(|p| find_obs_root(&p))
}

fn load_or_create_password(base: &Path) -> Result<String, String> {
    let path = base.join("regio-obs.json");
    if let Ok(s) = fs::read_to_string(&path) {
        if let Ok(saved) = serde_json::from_str::<Saved>(&s) {
            return Ok(saved.password);
        }
    }
    let mut bytes = [0u8; 18];
    getrandom::getrandom(&mut bytes).map_err(|e| e.to_string())?;
    let password: String = bytes.iter().map(|b| format!("{b:02x}")).collect();
    fs::write(&path, serde_json::to_string(&Saved { password: password.clone() }).unwrap()).map_err(|e| e.to_string())?;
    Ok(password)
}

fn free_port(preferred: u16) -> Option<u16> {
    (preferred..preferred + 20).find(|p| TcpListener::bind(("127.0.0.1", *p)).is_ok())
}

/// Prépare la configuration d'OBS AVANT son lancement : mode portable, WebSocket, pas d'assistant,
/// pas de mise à jour, démarrage réduit dans la zone de notification, fermeture sans confirmation.
fn configure(root: &Path, port: u16, password: &str) -> Result<(), String> {
    let write = |p: PathBuf, content: String| -> Result<(), String> {
        if let Some(dir) = p.parent() {
            fs::create_dir_all(dir).map_err(|e| e.to_string())?;
        }
        fs::write(&p, content).map_err(|e| e.to_string())
    };
    let cfg = root.join("config").join("obs-studio");

    // global.ini et user.ini : créés une seule fois (OBS y enregistre ensuite ses propres réglages).
    let write_once = |p: PathBuf, content: String| -> Result<(), String> { if p.exists() { Ok(()) } else { write(p, content) } };

    write(root.join("portable_mode.txt"), String::new())?;
    write_once(
        cfg.join("global.ini"),
        format!(
            "[General]\r\nEnableAutoUpdates=false\r\nInfoIncrement=-1\r\nLastVersion={OBS_VERSION_CODE}\r\nBrowserHWAccel=true\r\n\r\n[Video]\r\nRenderer=Direct3D 11\r\n"
        ),
    )?;
    write_once(
        cfg.join("user.ini"),
        "[General]\r\nPre19Defaults=false\r\nPre21Defaults=false\r\nPre23Defaults=false\r\nPre24.1Defaults=false\r\n\
         FirstRun=true\r\nConfirmOnExit=false\r\n\r\n[BasicWindow]\r\nSysTrayEnabled=true\r\nSysTrayWhenStarted=true\r\n\
         SysTrayMinimizeToTray=true\r\nPreviewEnabled=false\r\n"
            .to_string(),
    )?;
    // Connexion : réécrite à chaque lancement (le port peut changer s'il est occupé).
    let ws = serde_json::json!({
        "alerts_enabled": false,
        "auth_required": true,
        "first_load": false,
        "server_enabled": true,
        "server_password": password,
        "server_port": port,
    });
    write(cfg.join("plugin_config").join("obs-websocket").join("config.json"), ws.to_string())?;
    Ok(())
}
