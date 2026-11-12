//! Certificat HTTPS auto-signé pour la page du téléphone.
//! Les navigateurs n'autorisent la caméra que sur une page sécurisée (HTTPS).
//! Le certificat est conservé dans le dossier de données de l'application :
//! le téléphone n'accepte l'avertissement de sécurité qu'une seule fois.

use std::{fs, path::Path, sync::Arc};

use rustls::pki_types::{pem::PemObject, CertificateDer, PrivateKeyDer};

const CERT_FILE: &str = "phone-cert.pem";
const KEY_FILE: &str = "phone-key.pem";

pub fn server_config(dir: &Path, lan_ips: &[String]) -> Result<Arc<rustls::ServerConfig>, String> {
    let (cert_pem, key_pem) = load_or_create(dir, lan_ips)?;
    let certs = CertificateDer::pem_slice_iter(cert_pem.as_bytes())
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("certificat illisible : {e}"))?;
    let key = PrivateKeyDer::from_pem_slice(key_pem.as_bytes()).map_err(|e| format!("clé illisible : {e}"))?;

    let mut config = rustls::ServerConfig::builder_with_provider(Arc::new(rustls::crypto::ring::default_provider()))
        .with_safe_default_protocol_versions()
        .map_err(|e| e.to_string())?
        .with_no_client_auth()
        .with_single_cert(certs, key)
        .map_err(|e| e.to_string())?;
    // HTTP/1.1 uniquement : les websockets des navigateurs passent par HTTP/1.1.
    config.alpn_protocols = vec![b"http/1.1".to_vec()];
    Ok(Arc::new(config))
}

fn load_or_create(dir: &Path, lan_ips: &[String]) -> Result<(String, String), String> {
    let (cert_path, key_path) = (dir.join(CERT_FILE), dir.join(KEY_FILE));
    if let (Ok(c), Ok(k)) = (fs::read_to_string(&cert_path), fs::read_to_string(&key_path)) {
        return Ok((c, k));
    }
    let mut names = vec!["localhost".to_string()];
    names.extend(lan_ips.iter().cloned());
    let mut params = rcgen::CertificateParams::new(names).map_err(|e| e.to_string())?;
    params.distinguished_name.push(rcgen::DnType::CommonName, "Regio");
    params.not_after = rcgen::date_time_ymd(2036, 1, 1);
    let key = rcgen::KeyPair::generate().map_err(|e| e.to_string())?;
    let cert = params.self_signed(&key).map_err(|e| e.to_string())?;
    let (c, k) = (cert.pem(), key.serialize_pem());
    fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    fs::write(&cert_path, &c).map_err(|e| e.to_string())?;
    fs::write(&key_path, &k).map_err(|e| e.to_string())?;
    Ok((c, k))
}
