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
    /// Redémarrage voulu (nouvelle qualité du direct) : ce n'est pas un plantage.
    restarting: AtomicBool,
}

impl ObsManager {
    pub fn new() -> Arc<Self> {
        Arc::new(Self { state: Mutex::new(ObsState::Preparing), child: Mutex::new(None), quitting: AtomicBool::new(false), restarting: AtomicBool::new(false) })
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
    /// Redémarre OBS pour appliquer de nouveaux réglages (profil réécrit avant le relancement).
    pub fn restart(&self) {
        self.restarting.store(true, Ordering::SeqCst);
        if let Some(child) = self.child.lock().unwrap().as_mut() {
            let _ = child.kill();
        }
    }

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
            self.install(&app, &base, &root).await?;
        }

        // Un OBS laissé par un Regio fermé de force (ou planté) tournerait encore, caché : il occuperait
        // la caméra et le processeur. On ferme ces restes AVANT d'en lancer un nouveau.
        kill_leftovers(&exe);

        let password = load_or_create_password(&base)?;
        let port = free_port(PREFERRED_PORT).ok_or("aucun port libre pour la connexion à OBS")?;
        let paths = LaunchPaths {
            root: root.clone(),
            data: app.path().app_data_dir().map_err(|e| e.to_string())?.join("data"),
            videos: app.path().video_dir().map(|d| d.join("Regio")).unwrap_or_else(|_| base.join("videos")),
        };
        configure(&paths, port, &password)?;

        // Surveillance dans un fil dédié : lancement, attente, relance si plantage.
        let me = self.clone();
        std::thread::spawn(move || me.supervise(&exe, &paths, port, &password));
        Ok(())
    }

    fn supervise(&self, exe: &Path, paths: &LaunchPaths, port: u16, password: &str) {
        let mut crashes: Vec<Instant> = Vec::new();
        while !self.quitting.load(Ordering::SeqCst) {
            self.set(ObsState::Starting);
            // Réglages réécrits à CHAQUE lancement : un changement de qualité du direct s'applique au redémarrage.
            if let Err(e) = configure(paths, port, password) {
                self.set(ObsState::Error { message: format!("Configuration du moteur vidéo impossible : {e}") });
                return;
            }
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

            if self.restarting.swap(false, Ordering::SeqCst) {
                std::thread::sleep(Duration::from_millis(800));
                continue;
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

    /// Installe OBS : depuis l'archive livrée avec l'installeur de Regio (hors ligne) si elle est là,
    /// sinon en la téléchargeant. Dans les deux cas, l'empreinte SHA-256 est vérifiée.
    async fn install(&self, app: &AppHandle, base: &Path, root: &Path) -> Result<(), String> {
        fs::create_dir_all(base).map_err(|e| e.to_string())?;
        if let Some(bundled) = bundled_zip(app) {
            self.set(ObsState::Installing);
            let check = bundled.clone();
            let ok = tauri::async_runtime::spawn_blocking(move || sha256_file(&check)).await.map_err(|e| e.to_string())?;
            if ok.as_deref() == Ok(OBS_SHA256) {
                // Une fois OBS en place, l'archive livrée ne sert plus : on libère 224 Mo (si on a le droit).
                return self.extract(&bundled, base, root, true).await;
            }
            // Archive livrée abîmée : on se rabat sur le téléchargement.
        }
        self.download_and_install(base, root).await
    }

    async fn download_and_install(&self, base: &Path, root: &Path) -> Result<(), String> {
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

        self.extract(&zip_path, base, root, true).await
    }

    /// Extraction dans un dossier temporaire, renommé seulement si tout s'est bien passé.
    async fn extract(&self, zip_path: &Path, base: &Path, root: &Path, delete_zip: bool) -> Result<(), String> {
        self.set(ObsState::Installing);
        let tmp = base.join(format!("{OBS_VERSION}.tmp"));
        let _ = fs::remove_dir_all(&tmp);
        let zip_for_task = zip_path.to_path_buf();
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
        if delete_zip {
            let _ = fs::remove_file(zip_path);
        }
        Ok(())
    }
}

/// Archive d'OBS livrée avec l'installeur (`resources/obs/…zip`, voir scripts/fetch-installer-deps.sh).
fn bundled_zip(app: &AppHandle) -> Option<PathBuf> {
    let p = app.path().resource_dir().ok()?.join("resources").join("obs").join(format!("OBS-Studio-{OBS_VERSION}-Windows-x64.zip"));
    p.exists().then_some(p)
}

fn sha256_file(path: &Path) -> Result<String, String> {
    let mut f = fs::File::open(path).map_err(|e| e.to_string())?;
    let mut hasher = Sha256::new();
    std::io::copy(&mut f, &mut hasher).map_err(|e| e.to_string())?;
    Ok(hasher.finalize().iter().map(|b| format!("{b:02x}")).collect())
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

/// Ferme les OBS lancés depuis NOTRE copie (même chemin d'exécutable) : un OBS installé
/// par ailleurs par l'utilisateur n'est jamais touché.
#[cfg(windows)]
fn kill_leftovers(exe: &Path) {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    let path = exe.to_string_lossy().replace('\'', "''");
    let script = format!(
        "Get-Process obs64 -ErrorAction SilentlyContinue | Where-Object {{ $_.Path -eq '{path}' }} | Stop-Process -Force -ErrorAction SilentlyContinue"
    );
    let _ = Command::new("powershell.exe")
        .args(["-NoProfile", "-NonInteractive", "-Command", &script])
        .creation_flags(CREATE_NO_WINDOW)
        .status();
}

#[cfg(not(windows))]
fn kill_leftovers(_exe: &Path) {}

fn free_port(preferred: u16) -> Option<u16> {
    (preferred..preferred + 20).find(|p| TcpListener::bind(("127.0.0.1", *p)).is_ok())
}

/// Prépare la configuration d'OBS AVANT son lancement : mode portable, WebSocket, pas d'assistant,
/// pas de mise à jour, démarrage réduit dans la zone de notification, fermeture sans confirmation.
/// Dossiers utiles au lancement d'OBS.
struct LaunchPaths {
    root: PathBuf,
    /// Données de Regio (réglages du direct : `live.json`).
    data: PathBuf,
    /// Où les cultes sont enregistrés (Vidéos\Regio).
    videos: PathBuf,
}

fn configure(paths: &LaunchPaths, port: u16, password: &str) -> Result<(), String> {
    let root = paths.root.as_path();
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
    write_live_profile(&cfg, paths)
}

// ---------------------------------------------------------------- Le direct : profil OBS « Regio »

/// Qualité du direct choisie dans Regio (`data/live.json`, écrit par l'interface).
#[derive(Deserialize, Default)]
struct LiveDoc {
    quality: Option<String>,
}

/// Profil OBS « Regio », réécrit avant chaque lancement d'OBS (mode avancé) :
/// - direct redimensionné selon la qualité (480p / 720p / 1080p), débit constant, débit dynamique si Internet faiblit,
///   reconnexion automatique ;
/// - enregistrement (seulement si l'utilisateur le demande) = la MÊME image que le direct, sans 2e encodage :
///   léger pour le disque (~1,4 Go/h en 720p) et le processeur ; Vidéos\Regio, MP4 « hybride » (lisible après une coupure) ;
/// - encodage matériel selon la carte graphique (indispensable sur un PC modeste).
fn write_live_profile(cfg: &Path, paths: &LaunchPaths) -> Result<(), String> {
    let quality = fs::read_to_string(paths.data.join("live.json"))
        .ok()
        .and_then(|s| serde_json::from_str::<LiveDoc>(&s).ok())
        .and_then(|d| d.quality)
        .unwrap_or_else(|| "720".into());
    let (w, h, kbps) = match quality.as_str() {
        "480" => (854, 480, 1500),
        "1080" => (1920, 1080, 6000),
        _ => (1280, 720, 3000),
    };
    let enc = encoder(&paths.root);
    let software = enc == "obs_x264";
    let _ = fs::create_dir_all(&paths.videos);
    let videos = paths.videos.to_string_lossy().replace('\\', "/");

    let dir = cfg.join("basic").join("profiles").join("Regio");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let ini = format!(
        "[General]\r\nName=Regio\r\n\r\n\
         [Output]\r\nMode=Advanced\r\nFilenameFormatting=Culte %CCYY-%MM-%DD %hh-%mm\r\nReconnect=true\r\nRetryDelay=2\r\n\
         MaxRetries=60\r\nDynamicBitrate=true\r\nDelayEnable=false\r\nLowLatencyEnable=false\r\n\r\n\
         [AdvOut]\r\nApplyServiceSettings=true\r\nEncoder={enc}\r\nUseRescale={rescale}\r\nRescaleRes={w}x{h}\r\nTrackIndex=1\r\n\
         RecType=Standard\r\nRecFilePath={videos}\r\nRecFormat2=hybrid_mp4\r\nRecUseRescale=false\r\nRecTracks=1\r\n\
         RecEncoder={rec_enc}\r\nAudioEncoder=ffmpeg_aac\r\nRecAudioEncoder=ffmpeg_aac\r\nTrack1Bitrate=160\r\n\r\n\
         [Video]\r\nBaseCX=1920\r\nBaseCY=1080\r\nOutputCX=1920\r\nOutputCY=1080\r\nFPSType=0\r\nFPSCommon=30\r\n\
         ScaleType=bicubic\r\nColorFormat=NV12\r\nColorSpace=709\r\nColorRange=Partial\r\n\r\n\
         [Audio]\r\nSampleRate=48000\r\nChannelSetup=Stereo\r\n",
        rescale = w != 1920,
        // « none » = l'enregistrement réutilise l'encodage du direct (fichiers légers, choix de l'utilisateur).
        rec_enc = "none",
    );
    fs::write(dir.join("basic.ini"), ini).map_err(|e| e.to_string())?;
    let mut stream = serde_json::json!({ "rate_control": "CBR", "bitrate": kbps, "keyint_sec": 2 });
    if software {
        stream["preset"] = "veryfast".into();
        stream["profile"] = "main".into();
    }
    fs::write(dir.join("streamEncoder.json"), stream.to_string()).map_err(|e| e.to_string())?;

    // OBS ouvre ce profil au démarrage.
    set_ini(&cfg.join("user.ini"), "Basic", &[("Profile", "Regio"), ("ProfileDir", "Regio")])
}

/// Encodeur vidéo : choix forcé (`regio-encoder.txt` à côté d'OBS) ou d'après la carte graphique.
fn encoder(root: &Path) -> String {
    if let Ok(forced) = fs::read_to_string(root.join("regio-encoder.txt")) {
        let forced = forced.trim().to_string();
        if !forced.is_empty() {
            return forced;
        }
    }
    static DETECTED: std::sync::OnceLock<String> = std::sync::OnceLock::new();
    DETECTED.get_or_init(|| encoder_for(&graphics_cards())).clone()
}

/// NVIDIA (NVENC) d'abord, puis Intel (QuickSync), puis AMD (AMF) ; sinon encodage logiciel x264.
fn encoder_for(cards: &str) -> String {
    let c = cards.to_ascii_lowercase();
    if c.contains("nvidia") {
        "obs_nvenc_h264_tex"
    } else if c.contains("intel") {
        "obs_qsv11_v2"
    } else if c.contains("amd") || c.contains("radeon") {
        "h264_texture_amf"
    } else {
        "obs_x264"
    }
    .into()
}

#[cfg(windows)]
fn graphics_cards() -> String {
    use std::os::windows::process::CommandExt;
    Command::new("powershell.exe")
        .args(["-NoProfile", "-NonInteractive", "-Command", "(Get-CimInstance Win32_VideoController).Name -join ';'"])
        .creation_flags(0x0800_0000)
        .output()
        .map(|o| String::from_utf8_lossy(&o.stdout).into_owned())
        .unwrap_or_default()
}

#[cfg(not(windows))]
fn graphics_cards() -> String {
    String::new()
}

/// Remplace (ou ajoute) des clés dans une section d'un fichier INI, en gardant tout le reste.
fn set_ini(path: &Path, section: &str, pairs: &[(&str, &str)]) -> Result<(), String> {
    let text = fs::read_to_string(path).unwrap_or_default();
    let text = text.trim_start_matches('\u{feff}');
    let mut out: Vec<String> = Vec::new();
    let mut in_section = false;
    let mut done = vec![false; pairs.len()];
    let flush = |out: &mut Vec<String>, done: &mut Vec<bool>| {
        for (k, (key, val)) in pairs.iter().enumerate() {
            if !done[k] {
                out.push(format!("{key}={val}"));
                done[k] = true;
            }
        }
    };
    let mut seen = false;
    for line in text.lines() {
        let t = line.trim();
        if t.starts_with('[') && t.ends_with(']') {
            if in_section {
                // Fin de la section : ajouter les clés absentes avant la suivante (ligne vide conservée après).
                let blank = out.last().is_some_and(|l| l.trim().is_empty());
                if blank {
                    out.pop();
                }
                flush(&mut out, &mut done);
                if blank {
                    out.push(String::new());
                }
            }
            in_section = &t[1..t.len() - 1] == section;
            seen |= in_section;
            out.push(line.to_string());
            continue;
        }
        if in_section {
            if let Some((k, _)) = t.split_once('=') {
                if let Some(i) = pairs.iter().position(|(key, _)| *key == k.trim()) {
                    out.push(format!("{}={}", pairs[i].0, pairs[i].1));
                    done[i] = true;
                    continue;
                }
            }
        }
        out.push(line.to_string());
    }
    if in_section {
        flush(&mut out, &mut done);
    } else if !seen {
        if out.last().is_some_and(|l| !l.trim().is_empty()) {
            out.push(String::new());
        }
        out.push(format!("[{section}]"));
        flush(&mut out, &mut done);
    }
    fs::write(path, out.join("\r\n") + "\r\n").map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn encodeur_selon_la_carte() {
        assert_eq!(encoder_for("Intel(R) UHD Graphics"), "obs_qsv11_v2");
        assert_eq!(encoder_for("Intel(R) UHD Graphics;NVIDIA GeForce RTX 3050"), "obs_nvenc_h264_tex");
        assert_eq!(encoder_for("AMD Radeon(TM) Graphics"), "h264_texture_amf");
        assert_eq!(encoder_for("Microsoft Basic Display Adapter"), "obs_x264");
    }

    #[test]
    fn ini_cles_remplacees_ou_ajoutees() {
        let dir = std::env::temp_dir().join(format!("regio-ini-{}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        let p = dir.join("user.ini");
        fs::write(&p, "\u{feff}[General]\r\nA=1\r\n\r\n[Basic]\r\nProfile=Sans nom\r\nSceneCollection=X\r\n\r\n[Z]\r\nB=2\r\n").unwrap();
        set_ini(&p, "Basic", &[("Profile", "Regio"), ("ProfileDir", "Regio")]).unwrap();
        let t = fs::read_to_string(&p).unwrap();
        assert!(t.contains("[Basic]\r\nProfile=Regio\r\nSceneCollection=X\r\nProfileDir=Regio\r\n\r\n[Z]"), "{t}");
        assert!(t.contains("[General]\r\nA=1") && t.contains("B=2"));
        let q = dir.join("vide.ini");
        set_ini(&q, "Basic", &[("Profile", "Regio")]).unwrap();
        assert_eq!(fs::read_to_string(&q).unwrap(), "[Basic]\r\nProfile=Regio\r\n");
        let _ = fs::remove_dir_all(&dir);
    }
}
