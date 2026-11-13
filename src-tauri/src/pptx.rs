//! Import PowerPoint « fidèle » : PowerPoint (s'il est installé) exporte chaque diapo en image HD,
//! exactement comme elle apparaît dans PowerPoint. Les images rejoignent les médias de Regio
//! (servies à OBS par le serveur local, /media/…). Rien n'est envoyé sur Internet.

use std::{
    fs,
    io::{BufRead, BufReader},
    path::{Path, PathBuf},
    process::{Command, Stdio},
    sync::mpsc,
    time::Duration,
};

use serde::Serialize;
use tauri::{
    ipc::{InvokeBody, Request},
    AppHandle, Emitter,
};

use crate::storage;

const SCRIPT: &str = include_str!("pptx_export.ps1");
/// Sans nouvelle de PowerPoint pendant ce temps (boîte de dialogue invisible, mot de passe…) : abandon.
const SILENCE_LIMIT: Duration = Duration::from_secs(90);
const EXTENSIONS: &[&str] = &["pptx", "ppt", "pptm", "ppsx", "pps", "ppsm", "potx", "odp"];

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Imported {
    /// Nom du fichier sans extension (« Chants du dimanche »).
    pub name: String,
    /// Images des diapos, dans l'ordre (noms de fichiers dans les médias).
    pub slides: Vec<String>,
}

#[derive(Serialize, Clone)]
struct Progress {
    done: usize,
    total: usize,
}

/// Le fichier arrive en octets bruts (pas de chemin : l'interface ne voit que le fichier choisi),
/// son nom dans l'en-tête `x-file-name` (encodé comme une adresse web).
#[tauri::command]
pub async fn import_pptx(app: AppHandle, request: Request<'_>) -> Result<Imported, String> {
    let InvokeBody::Raw(bytes) = request.body() else { return Err("fichier manquant".into()) };
    let file_name = request
        .headers()
        .get("x-file-name")
        .and_then(|v| v.to_str().ok())
        .map(percent_decode)
        .unwrap_or_default();
    let (stem, ext) = match file_name.rsplit_once('.') {
        Some((s, e)) => (s.to_string(), e.to_ascii_lowercase()),
        None => (file_name.clone(), String::new()),
    };
    if !EXTENSIONS.contains(&ext.as_str()) {
        return Err("FORMAT".into());
    }
    let bytes = bytes.clone();
    let media = storage::media_dir(&app)?;
    let progress = move |done, total| {
        let _ = app.emit("pptx-progress", Progress { done, total });
    };
    let slides = tauri::async_runtime::spawn_blocking(move || export(&progress, &bytes, &ext, &media))
        .await
        .map_err(|e| e.to_string())??;
    Ok(Imported { name: stem.trim().to_string(), slides })
}

fn export(progress: &dyn Fn(usize, usize), bytes: &[u8], ext: &str, media: &Path) -> Result<Vec<String>, String> {
    let work = std::env::temp_dir().join(format!("regio-import-{}", storage::random_hex(8)));
    let out = work.join("out");
    fs::create_dir_all(&out).map_err(|e| e.to_string())?;
    let result = run_powerpoint(progress, bytes, ext, &work, &out).and_then(|_| collect(&out, media));
    let _ = fs::remove_dir_all(&work);
    result
}

fn run_powerpoint(progress: &dyn Fn(usize, usize), bytes: &[u8], ext: &str, work: &Path, out: &Path) -> Result<(), String> {
    // Copie locale : PowerPoint l'ouvre sans « mode protégé » (pas de marque « téléchargé d'Internet »).
    let src = work.join(format!("presentation.{ext}"));
    fs::write(&src, bytes).map_err(|e| e.to_string())?;

    let mut cmd = Command::new("powershell.exe");
    cmd.args(["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-EncodedCommand", &encode_command(SCRIPT)])
        .env("REGIO_SRC", &src)
        .env("REGIO_OUT", out)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000); // pas de fenêtre de console
    }
    let mut child = cmd.spawn().map_err(|e| format!("PowerShell indisponible : {e}"))?;

    // Lecture des étapes dans un fil à part, pour pouvoir abandonner si PowerPoint ne répond plus.
    let stdout = child.stdout.take().ok_or("sortie indisponible")?;
    let (tx, rx) = mpsc::channel::<String>();
    std::thread::spawn(move || {
        for line in BufReader::new(stdout).lines().map_while(Result::ok) {
            if tx.send(line).is_err() {
                break;
            }
        }
    });

    let (mut done, mut total, mut error) = (0usize, 0usize, None::<String>);
    loop {
        match rx.recv_timeout(SILENCE_LIMIT) {
            Ok(line) => {
                let line = line.trim();
                if let Some(n) = line.strip_prefix("TOTAL ") {
                    total = n.parse().unwrap_or(0);
                } else if line.starts_with("DONE ") {
                    done += 1;
                } else if line.starts_with("SKIP ") {
                    total = total.saturating_sub(1); // diapo masquée : non importée
                } else if let Some(msg) = line.strip_prefix("ERROR ") {
                    error = Some(msg.to_string());
                    continue;
                } else {
                    continue;
                }
                progress(done, total);
            }
            Err(mpsc::RecvTimeoutError::Disconnected) => break,
            Err(mpsc::RecvTimeoutError::Timeout) => {
                let _ = child.kill();
                let _ = child.wait();
                return Err("TIMEOUT".into());
            }
        }
    }
    let status = child.wait().map_err(|e| e.to_string())?;
    match error {
        Some(e) if e == "NOPOWERPOINT" => Err("NOPOWERPOINT".into()),
        Some(e) => Err(e),
        None if !status.success() => Err(format!("PowerPoint s'est arrêté (code {:?})", status.code())),
        None => Ok(()),
    }
}

/// Range les images exportées dans les médias (noms aléatoires), dans l'ordre des diapos.
fn collect(out: &Path, media: &Path) -> Result<Vec<String>, String> {
    let mut files: Vec<PathBuf> = fs::read_dir(out)
        .map_err(|e| e.to_string())?
        .filter_map(|e| e.ok().map(|e| e.path()))
        .filter(|p| p.extension().is_some_and(|x| x.eq_ignore_ascii_case("jpg")))
        .collect();
    files.sort();
    if files.is_empty() {
        return Err("EMPTY".into());
    }
    let mut names = Vec::with_capacity(files.len());
    for f in files {
        let name = format!("{}.jpg", storage::random_hex(12));
        let dest = media.join(&name);
        // Même disque en général (renommage instantané) ; sinon copie.
        if fs::rename(&f, &dest).is_err() {
            fs::copy(&f, &dest).map_err(|e| e.to_string())?;
        }
        names.push(name);
    }
    Ok(names)
}

/// `-EncodedCommand` attend le script en UTF-16LE puis base64 : aucun souci d'accents ni de guillemets.
fn encode_command(script: &str) -> String {
    let bytes: Vec<u8> = script.encode_utf16().flat_map(|u| u.to_le_bytes()).collect();
    base64(&bytes)
}

fn base64(bytes: &[u8]) -> String {
    const T: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut s = String::with_capacity(bytes.len().div_ceil(3) * 4);
    for chunk in bytes.chunks(3) {
        let b = [chunk[0], *chunk.get(1).unwrap_or(&0), *chunk.get(2).unwrap_or(&0)];
        let n = (u32::from(b[0]) << 16) | (u32::from(b[1]) << 8) | u32::from(b[2]);
        for i in 0..4 {
            if i <= chunk.len() {
                s.push(T[((n >> (18 - 6 * i)) & 63) as usize] as char);
            } else {
                s.push('=');
            }
        }
    }
    s
}

fn percent_decode(s: &str) -> String {
    let b = s.as_bytes();
    let mut out = Vec::with_capacity(b.len());
    let mut i = 0;
    while i < b.len() {
        if b[i] == b'%' && i + 2 < b.len() {
            if let Ok(v) = u8::from_str_radix(&s[i + 1..i + 3], 16) {
                out.push(v);
                i += 3;
                continue;
            }
        }
        out.push(b[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn base64_standard() {
        assert_eq!(base64(b"Man"), "TWFu");
        assert_eq!(base64(b"Ma"), "TWE=");
        assert_eq!(base64(b"M"), "TQ==");
        assert_eq!(base64(b""), "");
    }

    /// Export réel par PowerPoint (Windows + PowerPoint requis) :
    /// cargo test --lib pptx -- --ignored   (présentation de test : C:\dev\regio-test\Chants test.pptx)
    #[test]
    #[ignore]
    fn export_reel_par_powerpoint() {
        let bytes = fs::read(r"C:\dev\regio-test\Chants test.pptx").expect("présentation de test absente");
        let media = std::env::temp_dir().join("regio-test-media");
        let _ = fs::remove_dir_all(&media);
        fs::create_dir_all(&media).unwrap();
        let steps = std::sync::Mutex::new(Vec::new());
        let slides = export(&|d, t| steps.lock().unwrap().push((d, t)), &bytes, "pptx", &media).expect("export");
        assert_eq!(slides.len(), 3, "4 diapos dont 1 masquée");
        assert_eq!(steps.lock().unwrap().last(), Some(&(3, 3)));
        for s in &slides {
            assert!(media.join(s).metadata().unwrap().len() > 5_000);
        }
    }

    #[test]
    fn nom_de_fichier_decode() {
        assert_eq!(percent_decode("Chants%20de%20No%C3%ABl.pptx"), "Chants de Noël.pptx");
        assert_eq!(percent_decode("100%"), "100%");
    }
}
