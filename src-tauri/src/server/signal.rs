//! Signalisation WebRTC : met en relation le téléphone et la page réceptrice dans OBS.
//! La vidéo ne passe PAS ici : elle va directement du téléphone à OBS sur le Wi-Fi.
//!
//! Sécurité :
//! - un téléphone ne peut se connecter qu'avec la clé secrète du QR code (renouvelée à chaque lancement) ;
//! - le rôle « récepteur » n'est accepté que depuis le PC lui-même (serveur local), jamais depuis le Wi-Fi.

use std::{
    collections::HashMap,
    sync::{
        atomic::{AtomicU64, Ordering},
        Arc,
    },
};

use axum::extract::ws::{CloseFrame, Message, Utf8Bytes, WebSocket};
use futures_util::{SinkExt, StreamExt};
use serde::Serialize;
use serde_json::{json, Value};
use tokio::sync::{mpsc, Mutex};

/// Une connexion plus récente a pris la place (même code que src/shared/signal.ts).
const CLOSE_REPLACED: u16 = 4000;
/// Connexion refusée (mauvaise clé ou rôle interdit depuis ce serveur).
const CLOSE_FORBIDDEN: u16 = 4003;
/// Toutes les places de téléphone sont prises : le téléphone réessaie un peu plus tard
/// (la régie prépare une nouvelle place dès que les précédentes sont occupées).
const CLOSE_NO_SLOT: u16 = 4009;

#[derive(Clone, Copy, PartialEq, Eq)]
enum Role {
    Phone,
    Receiver,
}

impl Role {
    fn other(self) -> Role {
        match self {
            Role::Phone => Role::Receiver,
            Role::Receiver => Role::Phone,
        }
    }
}

/// D'où vient la connexion : le PC lui-même, ou le Wi-Fi (téléphone, avec la clé).
pub enum Access {
    Local,
    Phone { key: Arc<str> },
}

struct Peer {
    id: u64,
    /// Identifiant de l'appareil (téléphone) : seul le même appareil peut reprendre sa place.
    device: Option<String>,
    tx: mpsc::UnboundedSender<Message>,
}

#[derive(Default)]
struct Room {
    phone: Option<Peer>,
    receiver: Option<Peer>,
}

impl Room {
    fn slot(&mut self, role: Role) -> &mut Option<Peer> {
        match role {
            Role::Phone => &mut self.phone,
            Role::Receiver => &mut self.receiver,
        }
    }
}

#[derive(Serialize)]
pub struct RoomStatus {
    pub phone: bool,
    pub receiver: bool,
}

#[derive(Clone, Default)]
pub struct Rooms(Arc<Mutex<HashMap<String, Room>>>);

impl Rooms {
    pub async fn status(&self) -> HashMap<String, RoomStatus> {
        self.0
            .lock()
            .await
            .iter()
            .map(|(cam, r)| (cam.clone(), RoomStatus { phone: r.phone.is_some(), receiver: r.receiver.is_some() }))
            .collect()
    }
}

/// Place d'un téléphone. Celle du QR code si elle est libre (ou déjà la sienne : reconnexion) ;
/// sinon la première place libre prête dans OBS. Un téléphone ne chasse JAMAIS un autre téléphone
/// (deux téléphones peuvent avoir scanné le même QR code).
fn phone_room(map: &HashMap<String, Room>, wanted: &str, device: Option<&str>) -> Option<String> {
    let usable = |r: &Room| match &r.phone {
        None => true,
        Some(p) => device.is_some() && p.device.as_deref() == device,
    };
    if map.get(wanted).map_or(true, usable) {
        return Some(wanted.to_string());
    }
    // Reconnexion : cet appareil avait déjà une place ailleurs.
    if let Some((cam, _)) = map.iter().find(|(_, r)| device.is_some() && r.phone.as_ref().and_then(|p| p.device.as_deref()) == device) {
        return Some(cam.clone());
    }
    let mut free: Vec<&String> = map.iter().filter(|(_, r)| r.receiver.is_some() && r.phone.is_none()).map(|(c, _)| c).collect();
    free.sort_by_key(|c| (c.parse::<u32>().unwrap_or(u32::MAX), (*c).clone()));
    free.first().map(|c| (*c).clone())
}

static NEXT_ID: AtomicU64 = AtomicU64::new(1);

fn text(v: Value) -> Message {
    Message::Text(Utf8Bytes::from(v.to_string()))
}

fn close(code: u16, reason: &'static str) -> Message {
    Message::Close(Some(CloseFrame { code, reason: Utf8Bytes::from_static(reason) }))
}

pub async fn handle(socket: WebSocket, rooms: Rooms, access: Access) {
    let id = NEXT_ID.fetch_add(1, Ordering::Relaxed);
    let (mut sink, mut stream) = socket.split();
    let (tx, mut rx) = mpsc::unbounded_channel::<Message>();

    // Tâche d'écriture : tout ce qui est destiné à ce client passe par `tx`.
    let writer = tokio::spawn(async move {
        while let Some(msg) = rx.recv().await {
            let closing = matches!(msg, Message::Close(_));
            if sink.send(msg).await.is_err() || closing {
                break;
            }
        }
    });

    let mut joined: Option<(String, Role)> = None;

    while let Some(Ok(msg)) = stream.next().await {
        let raw = match msg {
            Message::Text(t) => t,
            Message::Close(_) => break,
            _ => continue,
        };
        let Ok(v) = serde_json::from_str::<Value>(raw.as_str()) else { continue };

        if v["type"] == "join" {
            let role = match v["role"].as_str() {
                Some("phone") => Role::Phone,
                Some("receiver") => Role::Receiver,
                _ => continue,
            };
            let allowed = match (&access, role) {
                (Access::Local, Role::Receiver) => true,
                (Access::Phone { key }, Role::Phone) => v["key"].as_str() == Some(&**key),
                _ => false,
            };
            if !allowed {
                let _ = tx.send(close(CLOSE_FORBIDDEN, "refusé"));
                break;
            }
            let wanted = v["cam"].as_str().unwrap_or("1").chars().take(32).collect::<String>();
            let device = v["device"].as_str().map(|d| d.chars().take(64).collect::<String>());
            let mut map = rooms.0.lock().await;
            let Some(cam) = (match role {
                Role::Receiver => Some(wanted),
                Role::Phone => phone_room(&map, &wanted, device.as_deref()),
            }) else {
                let _ = tx.send(close(CLOSE_NO_SLOT, "pas de place"));
                break;
            };
            let room = map.entry(cam.clone()).or_default();
            if let Some(old) = room.slot(role).replace(Peer { id, device, tx: tx.clone() }) {
                let _ = old.tx.send(close(CLOSE_REPLACED, "remplacé"));
            }
            if role == Role::Phone {
                let _ = tx.send(text(json!({ "type": "assigned", "cam": cam })));
            }
            let other_present = room.slot(role.other()).is_some();
            let _ = tx.send(text(json!({ "type": "peer", "present": other_present })));
            if let Some(other) = room.slot(role.other()) {
                let _ = other.tx.send(text(json!({ "type": "peer", "present": true })));
            }
            joined = Some((cam, role));
            continue;
        }

        // offer / answer / candidate : relayés tels quels à l'autre côté.
        if let Some((cam, role)) = &joined {
            let mut map = rooms.0.lock().await;
            if let Some(other) = map.get_mut(cam).and_then(|r| r.slot(role.other()).as_ref()) {
                let _ = other.tx.send(Message::Text(raw));
            }
        }
    }

    // Départ : libérer la place (si on ne l'a pas déjà perdue) et prévenir l'autre côté.
    if let Some((cam, role)) = joined {
        let mut map = rooms.0.lock().await;
        if let Some(room) = map.get_mut(&cam) {
            if room.slot(role).as_ref().map(|p| p.id) == Some(id) {
                *room.slot(role) = None;
                if let Some(other) = room.slot(role.other()) {
                    let _ = other.tx.send(text(json!({ "type": "peer", "present": false })));
                }
            }
        }
    }
    drop(tx);
    let _ = writer.await;
}

#[cfg(test)]
mod tests {
    use super::*;

    fn peer(device: Option<&str>) -> Option<Peer> {
        let (tx, _rx) = mpsc::unbounded_channel();
        Some(Peer { id: 0, device: device.map(String::from), tx })
    }

    fn rooms(spec: &[(&str, Option<&str>, bool)]) -> HashMap<String, Room> {
        spec.iter()
            .map(|(cam, phone, receiver)| {
                let room = Room { phone: phone.and_then(|d| peer(Some(d))), receiver: if *receiver { peer(None) } else { None } };
                (cam.to_string(), room)
            })
            .collect()
    }

    #[test]
    fn place_du_qr_code_si_libre() {
        let m = rooms(&[("1", None, true), ("2", None, true)]);
        assert_eq!(phone_room(&m, "1", Some("a")).as_deref(), Some("1"));
    }

    #[test]
    fn meme_qr_code_ne_chasse_pas_le_premier() {
        let m = rooms(&[("1", Some("a"), true), ("2", None, true)]);
        assert_eq!(phone_room(&m, "1", Some("b")).as_deref(), Some("2"));
    }

    #[test]
    fn reconnexion_reprend_sa_place() {
        let m = rooms(&[("1", Some("b"), true), ("2", Some("a"), true)]);
        assert_eq!(phone_room(&m, "1", Some("a")).as_deref(), Some("2"));
        assert_eq!(phone_room(&m, "2", Some("a")).as_deref(), Some("2"));
    }

    #[test]
    fn pas_de_place_prete() {
        // Place 2 pas encore prête dans OBS (aucun récepteur) : attendre.
        let m = rooms(&[("1", Some("a"), true), ("2", None, false)]);
        assert_eq!(phone_room(&m, "1", Some("b")), None);
        // Sans identifiant d'appareil, on ne prend jamais la place d'un autre.
        let m = rooms(&[("1", Some("a"), true)]);
        assert_eq!(phone_room(&m, "1", None), None);
    }

    #[test]
    fn premiere_place_libre_par_numero() {
        let m = rooms(&[("1", Some("a"), true), ("10", None, true), ("3", None, true)]);
        assert_eq!(phone_room(&m, "1", Some("b")).as_deref(), Some("3"));
    }
}
