//! Serveur local de Regio, intégré à l'application.
//!
//! - Serveur LOCAL (127.0.0.1, HTTP) : pages chargées par OBS (`render.html`, `receiver.html`)
//!   et signalisation côté OBS. Inaccessible depuis le réseau.
//! - Serveur TÉLÉPHONE (Wi-Fi, HTTPS) : page caméra `phone.html` et signalisation côté téléphone,
//!   protégée par une clé secrète incluse dans le QR code.
//!
//! En développement (`tauri dev`), les pages sont relayées depuis le serveur Vite ;
//! dans l'application installée, elles sont lues dans l'exécutable.

mod net;
mod signal;
mod tls;

use std::{collections::HashMap, net::SocketAddr, sync::Arc};

use axum::{
    body::Body,
    extract::{State, WebSocketUpgrade},
    http::{header, StatusCode, Uri},
    response::{IntoResponse, Response},
    routing::get,
    Router,
};
use hyper_util::{
    rt::{TokioExecutor, TokioIo},
    server::conn::auto::Builder as ConnBuilder,
    service::TowerToHyperService,
};
use serde::Serialize;
use tauri::{AppHandle, Manager};
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::{TcpListener, TcpStream},
};

use signal::{Access, RoomStatus, Rooms};

/// Ports préférés (le suivant libre est pris si besoin).
const LOCAL_PORT: u16 = 47811;
const PHONE_PORT: u16 = 47812;
/// Serveur Vite utilisé en développement.
const DEV_SERVER: &str = "localhost:1420";

#[derive(Clone)]
pub struct Server {
    app: AppHandle,
    rooms: Rooms,
    key: Arc<str>,
    local_port: u16,
    phone_port: Option<u16>,
    phone_error: Option<String>,
}

/// Ce que l'interface de la régie a besoin de savoir.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerInfo {
    /// Adresse des pages pour OBS, ex. http://127.0.0.1:47811
    pub local_base: String,
    pub phone_port: Option<u16>,
    pub phone_error: Option<String>,
    pub lan_ips: Vec<String>,
    /// Clé secrète du QR code.
    pub key: String,
    pub rooms: HashMap<String, RoomStatus>,
}

impl Server {
    pub async fn info(&self) -> ServerInfo {
        ServerInfo {
            local_base: format!("http://127.0.0.1:{}", self.local_port),
            phone_port: self.phone_port,
            phone_error: self.phone_error.clone(),
            lan_ips: net::lan_ips(),
            key: self.key.to_string(),
            rooms: self.rooms.status().await,
        }
    }
}

/// Démarre les deux serveurs. Une erreur du serveur téléphone n'empêche pas l'application de fonctionner.
pub async fn start(app: AppHandle) -> Result<Server, String> {
    let rooms = Rooms::default();
    let key = random_key();

    let local = bind(SocketAddr::from(([127, 0, 0, 1], LOCAL_PORT))).await?;
    let local_port = local.local_addr().map_err(|e| e.to_string())?.port();

    let (phone_port, phone_error) = match start_phone(&app, rooms.clone(), key.clone()).await {
        Ok(port) => (Some(port), None),
        Err(e) => (None, Some(e)),
    };

    let server = Server { app, rooms, key, local_port, phone_port, phone_error };
    let router = Router::new()
        .route("/regio/signal", get(local_signal))
        .fallback(static_file)
        .with_state(server.clone());
    tauri::async_runtime::spawn(async move {
        let _ = axum::serve(local, router).await;
    });
    Ok(server)
}

async fn start_phone(app: &AppHandle, rooms: Rooms, key: Arc<str>) -> Result<u16, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let tls = tls::server_config(&dir, &net::lan_ips())?;
    let listener = bind(SocketAddr::from(([0, 0, 0, 0], PHONE_PORT))).await?;
    let port = listener.local_addr().map_err(|e| e.to_string())?.port();

    #[derive(Clone)]
    struct PhoneState {
        server_app: AppHandle,
        rooms: Rooms,
        key: Arc<str>,
    }
    let state = PhoneState { server_app: app.clone(), rooms, key };
    let router = Router::new()
        .route(
            "/regio/signal",
            get(|ws: WebSocketUpgrade, State(s): State<PhoneState>| async move {
                ws.on_upgrade(move |socket| signal::handle(socket, s.rooms, Access::Phone { key: s.key }))
            }),
        )
        .route("/regio/info", get(|| async { StatusCode::NOT_FOUND }))
        .fallback(|State(s): State<PhoneState>, uri: Uri| async move { serve_asset(&s.server_app, &uri).await })
        .with_state(state);

    let acceptor = tokio_rustls::TlsAcceptor::from(tls);
    tauri::async_runtime::spawn(async move {
        loop {
            let Ok((tcp, _)) = listener.accept().await else { continue };
            let (acceptor, router) = (acceptor.clone(), router.clone());
            tokio::spawn(async move {
                let Ok(stream) = acceptor.accept(tcp).await else { return };
                let _ = ConnBuilder::new(TokioExecutor::new())
                    .serve_connection_with_upgrades(TokioIo::new(stream), TowerToHyperService::new(router))
                    .await;
            });
        }
    });
    Ok(port)
}

/// Écoute sur le port demandé, ou sur l'un des 10 suivants s'il est déjà pris.
async fn bind(addr: SocketAddr) -> Result<TcpListener, String> {
    let mut last = String::new();
    for offset in 0..10u16 {
        let mut a = addr;
        a.set_port(addr.port() + offset);
        match TcpListener::bind(a).await {
            Ok(l) => return Ok(l),
            Err(e) => last = format!("{a} : {e}"),
        }
    }
    Err(format!("aucun port libre ({last})"))
}

fn random_key() -> Arc<str> {
    let mut bytes = [0u8; 16];
    getrandom::getrandom(&mut bytes).expect("générateur aléatoire indisponible");
    bytes.iter().map(|b| format!("{b:02x}")).collect::<String>().into()
}

async fn local_signal(ws: WebSocketUpgrade, State(s): State<Server>) -> impl IntoResponse {
    ws.on_upgrade(move |socket| signal::handle(socket, s.rooms, Access::Local))
}

async fn static_file(State(s): State<Server>, uri: Uri) -> Response {
    serve_asset(&s.app, &uri).await
}

/// Sert une page ou un fichier de l'interface.
async fn serve_asset(app: &AppHandle, uri: &Uri) -> Response {
    if tauri::is_dev() {
        return dev_proxy(uri).await.unwrap_or_else(|e| {
            (StatusCode::BAD_GATEWAY, format!("Serveur de développement indisponible : {e}")).into_response()
        });
    }
    let path = match uri.path() {
        "/" => "/index.html".to_string(),
        p => p.to_string(),
    };
    match app.asset_resolver().get(path) {
        Some(asset) => Response::builder()
            .header(header::CONTENT_TYPE, asset.mime_type)
            .header(header::CACHE_CONTROL, "no-cache")
            .body(Body::from(asset.bytes))
            .unwrap_or_else(|_| StatusCode::INTERNAL_SERVER_ERROR.into_response()),
        None => StatusCode::NOT_FOUND.into_response(),
    }
}

/// Développement : relaie la requête vers Vite (HTTP/1.0, réponse non découpée).
async fn dev_proxy(uri: &Uri) -> Result<Response, String> {
    let path = uri.path_and_query().map(|p| p.as_str()).unwrap_or("/");
    let mut tcp = TcpStream::connect(DEV_SERVER).await.map_err(|e| e.to_string())?;
    let req = format!("GET {path} HTTP/1.0\r\nHost: {DEV_SERVER}\r\nAccept: */*\r\nConnection: close\r\n\r\n");
    tcp.write_all(req.as_bytes()).await.map_err(|e| e.to_string())?;
    let mut raw = Vec::new();
    tcp.read_to_end(&mut raw).await.map_err(|e| e.to_string())?;

    let split = raw.windows(4).position(|w| w == b"\r\n\r\n").ok_or("réponse invalide")?;
    let head = String::from_utf8_lossy(&raw[..split]);
    let body = raw[split + 4..].to_vec();
    let mut lines = head.lines();
    let status = lines
        .next()
        .and_then(|l| l.split_whitespace().nth(1))
        .and_then(|c| c.parse::<u16>().ok())
        .unwrap_or(502);
    let mut res = Response::builder().status(status);
    for line in lines {
        if let Some((name, value)) = line.split_once(':') {
            let name = name.trim().to_ascii_lowercase();
            if matches!(name.as_str(), "content-type" | "cache-control" | "etag") {
                res = res.header(name, value.trim());
            }
        }
    }
    res.body(Body::from(body)).map_err(|e| e.to_string())
}
