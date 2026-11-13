//! Enregistrement local des données de Regio (moments du culte, contenus, médiathèque) et des images.
//! Tout reste sur le PC, dans le dossier de données de l'application.

use std::{fs, path::PathBuf};

use tauri::{AppHandle, Manager};

/// Noms autorisés : lettres minuscules, chiffres, tirets (jamais de chemin).
fn safe_name(name: &str) -> Result<&str, String> {
    if !name.is_empty() && name.len() <= 64 && name.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-') {
        Ok(name)
    } else {
        Err("nom de données invalide".into())
    }
}

fn data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?.join("data");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

pub fn media_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?.join("media");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

/// Lit un document JSON enregistré (None s'il n'existe pas encore).
#[tauri::command]
pub fn load_data(app: AppHandle, name: String) -> Result<Option<String>, String> {
    let path = data_dir(&app)?.join(format!("{}.json", safe_name(&name)?));
    match fs::read_to_string(&path) {
        Ok(s) => Ok(Some(s)),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

/// Enregistre un document JSON. Écriture dans un fichier temporaire puis renommage :
/// une coupure de courant ne laisse jamais un fichier à moitié écrit.
#[tauri::command]
pub fn save_data(app: AppHandle, name: String, json: String) -> Result<(), String> {
    serde_json::from_str::<serde_json::Value>(&json).map_err(|e| format!("données invalides : {e}"))?;
    let dir = data_dir(&app)?;
    let name = safe_name(&name)?;
    let tmp = dir.join(format!("{name}.json.tmp"));
    fs::write(&tmp, json).map_err(|e| e.to_string())?;
    fs::rename(&tmp, dir.join(format!("{name}.json"))).map_err(|e| e.to_string())
}

/// Enregistre une image importée ; renvoie le nom du fichier (servi par le serveur local sous /media/).
#[tauri::command]
pub fn save_media(app: AppHandle, base64: String, ext: String) -> Result<String, String> {
    let ext = match ext.as_str() {
        "jpg" | "jpeg" => "jpg",
        "png" => "png",
        "webp" => "webp",
        _ => return Err("format d'image non pris en charge".into()),
    };
    let bytes = decode_base64(&base64).ok_or("image illisible")?;
    let file = format!("{}.{ext}", random_hex(12));
    fs::write(media_dir(&app)?.join(&file), bytes).map_err(|e| e.to_string())?;
    Ok(file)
}

/// Identifiant aléatoire en hexadécimal (`n` octets → 2n caractères).
pub fn random_hex(n: usize) -> String {
    let mut id = vec![0u8; n];
    getrandom::getrandom(&mut id).expect("générateur aléatoire indisponible");
    id.iter().map(|b| format!("{b:02x}")).collect()
}

fn decode_base64(s: &str) -> Option<Vec<u8>> {
    const T: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut val = [255u8; 256];
    for (i, c) in T.iter().enumerate() {
        val[*c as usize] = i as u8;
    }
    let mut out = Vec::with_capacity(s.len() * 3 / 4);
    let (mut buf, mut bits) = (0u32, 0u32);
    for c in s.bytes().filter(|c| !c.is_ascii_whitespace() && *c != b'=') {
        let v = val[c as usize];
        if v == 255 {
            return None;
        }
        buf = (buf << 6) | v as u32;
        bits += 6;
        if bits >= 8 {
            bits -= 8;
            out.push((buf >> bits) as u8);
        }
    }
    Some(out)
}
