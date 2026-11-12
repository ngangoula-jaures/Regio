mod server;

use tauri::Manager;

/// Informations du serveur local pour l'interface (adresse des pages pour OBS, QR code du téléphone).
#[tauri::command]
async fn server_info(server: tauri::State<'_, server::Server>) -> Result<server::ServerInfo, String> {
    Ok(server.info().await)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let server = tauri::async_runtime::block_on(server::start(app.handle().clone()))?;
            app.manage(server);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![server_info])
        .run(tauri::generate_context!())
        .expect("erreur au lancement de Regio");
}
