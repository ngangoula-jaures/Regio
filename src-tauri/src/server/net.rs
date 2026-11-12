//! Adresses du PC sur le réseau local (pour le QR code du téléphone).

use std::net::IpAddr;

/// Cartes réseau virtuelles à ignorer : le téléphone ne peut pas les joindre.
const VIRTUAL: &[&str] = &["vethernet", "virtualbox", "vmware", "wsl", "loopback", "hyper-v", "docker", "tailscale", "zerotier"];

/// Adresses IPv4 privées des cartes réseau réelles (Wi-Fi, Ethernet), Wi-Fi en premier.
pub fn lan_ips() -> Vec<String> {
    let Ok(ifaces) = local_ip_address::list_afinet_netifas() else {
        return Vec::new();
    };
    let mut found: Vec<(bool, String)> = ifaces
        .into_iter()
        .filter_map(|(name, ip)| {
            let IpAddr::V4(v4) = ip else { return None };
            let lower = name.to_lowercase();
            if !v4.is_private() || v4.is_loopback() || v4.is_link_local() || VIRTUAL.iter().any(|v| lower.contains(v)) {
                return None;
            }
            let wifi = lower.contains("wi-fi") || lower.contains("wifi") || lower.contains("wlan") || lower.contains("sans fil");
            Some((wifi, v4.to_string()))
        })
        .collect();
    found.sort_by(|a, b| b.0.cmp(&a.0));
    found.dedup_by(|a, b| a.1 == b.1);
    found.into_iter().map(|(_, ip)| ip).collect()
}
