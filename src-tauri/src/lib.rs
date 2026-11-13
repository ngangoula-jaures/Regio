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
        .invoke_handler(tauri::generate_handler![server_info, obs_status, storage::load_data, storage::save_data, storage::save_media, pptx::import_pptx])
        .build(tauri::generate_context!())
        .expect("erreur au lancement de Regio");

    app.run(|handle, event| {
        // Regio se ferme : on ferme aussi le moteur vidéo.
        if let tauri::RunEvent::Exit = event {
            handle.state::<Arc<obs::ObsManager>>().stop();
        }
    });
}
