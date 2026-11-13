mod live;
mod obs;
mod pptx;
mod server;
mod storage;

use std::sync::Arc;

use tauri::Manager;

/// Informations du serveur local pour l'interface (adresse des pages pour OBS, QR code du téléphone).
#[tauri::command]
async fn server_info(server: tauri::State<'_, server::Server>) -> Result<server::ServerInfo, String> {
    Ok(server.info().await)
}

/// État du moteur vidéo embarqué (téléchargement, démarrage, prêt avec port et mot de passe, erreur).
#[tauri::command]
fn obs_status(obs: tauri::State<'_, Arc<obs::ObsManager>>) -> obs::ObsState {
    obs.state()
}

/// Redémarre le moteur vidéo pour appliquer de nouveaux réglages du direct (qualité).
#[tauri::command]
fn restart_engine(obs: tauri::State<'_, Arc<obs::ObsManager>>) {
    obs.restart();
}

/// Dossier des enregistrements (Vidéos\\Regio) et espace libre sur son disque (octets), pour prévenir l'utilisateur.
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct RecordingsInfo {
    path: String,
    free_bytes: Option<u64>,
}

#[tauri::command]
fn recordings_info(app: tauri::AppHandle) -> Result<RecordingsInfo, String> {
    let dir = app.path().video_dir().map_err(|e| e.to_string())?.join("Regio");
    let _ = std::fs::create_dir_all(&dir);
    Ok(RecordingsInfo { path: dir.to_string_lossy().into_owned(), free_bytes: free_space(&dir) })
}

#[cfg(windows)]
fn free_space(dir: &std::path::Path) -> Option<u64> {
    use std::os::windows::process::CommandExt;
    let script = format!("(Get-Item -LiteralPath '{}').PSDrive.Free", dir.to_string_lossy().replace('\'', "''"));
    let out = std::process::Command::new("powershell.exe")
        .args(["-NoProfile", "-NonInteractive", "-Command", &script])
        .creation_flags(0x0800_0000)
        .output()
        .ok()?;
    String::from_utf8_lossy(&out.stdout).trim().parse().ok()
}

#[cfg(not(windows))]
fn free_space(_dir: &std::path::Path) -> Option<u64> {
    None
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let server = tauri::async_runtime::block_on(server::start(app.handle().clone()))?;
            app.manage(server);
            let obs = obs::ObsManager::new();
            obs.start(app.handle().clone());
            app.manage(obs);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![server_info, obs_status, restart_engine, recordings_info, live::upload_test, storage::load_data, storage::save_data, storage::save_media, pptx::import_pptx])
        .build(tauri::generate_context!())
        .expect("erreur au lancement de Regio");

    app.run(|handle, event| {
        // Regio se ferme : on ferme aussi le moteur vidéo.
        if let tauri::RunEvent::Exit = event {
            handle.state::<Arc<obs::ObsManager>>().stop();
        }
    });
}
