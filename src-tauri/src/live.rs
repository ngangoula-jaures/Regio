//! Le direct : mesure de la connexion montante de l'église (assistant « Diffuser sur Facebook »).
//! Envoie des données sans valeur (zéros) à un service de test de débit public, sans rien d'identifiant.

use std::time::{Duration, Instant};

const UPLOAD_URL: &str = "https://speed.cloudflare.com/__up";

/// Débit montant mesuré, en mégabits par seconde : meilleur de 3 envois de 4 Mo (le 1er sert aussi d'échauffement).
#[tauri::command]
pub async fn upload_test() -> Result<f64, String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(25))
        .user_agent("regio")
        .build()
        .map_err(|e| e.to_string())?;
    let body = vec![0u8; 4 * 1024 * 1024];
    let mut best: f64 = 0.0;
    for _ in 0..3 {
        let t = Instant::now();
        let res = client.post(UPLOAD_URL).body(body.clone()).send().await;
        match res {
            Ok(r) if r.status().is_success() => {
                let secs = t.elapsed().as_secs_f64().max(0.05);
                best = best.max(body.len() as f64 * 8.0 / secs / 1_000_000.0);
            }
            Ok(r) => return Err(format!("HTTP {}", r.status())),
            Err(e) if best == 0.0 => return Err(format!("Pas de connexion à Internet ({e})")),
            Err(_) => break,
        }
    }
    Ok((best * 10.0).round() / 10.0)
}
