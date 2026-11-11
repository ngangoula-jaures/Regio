// Panneau « Téléphone par QR code » : affiche le QR code à scanner et l'état de la connexion.

import { useEffect, useState } from "react";
import QRCode from "qrcode";

interface BridgeInfo {
  lanIps: string[];
  phonePort: number;
  rooms: Record<string, { phone: boolean; receiver: boolean }>;
}

export function PhoneQr({ cam }: { cam: string }) {
  const [info, setInfo] = useState<BridgeInfo | null>(null);
  const [ip, setIp] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // État du pont (adresse du PC, téléphone connecté ?) rafraîchi toutes les 2 s.
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch("/diffchurch/info");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: BridgeInfo = await res.json();
        if (!alive) return;
        setInfo(data);
        setError(null);
        setIp((cur) => cur ?? data.lanIps[0] ?? null);
      } catch (e) {
        if (alive) setError(`Service téléphone indisponible (${e instanceof Error ? e.message : e})`);
      }
    };
    load();
    const t = window.setInterval(load, 2000);
    return () => {
      alive = false;
      window.clearInterval(t);
    };
  }, []);

  const url = info && ip ? `https://${ip}:${info.phonePort}/phone.html?cam=${encodeURIComponent(cam)}` : null;

  useEffect(() => {
    if (!url) return;
    QRCode.toDataURL(url, { width: 220, margin: 1, color: { dark: "#14121a", light: "#ffffff" } })
      .then(setQr)
      .catch(() => setQr(null));
  }, [url]);

  const room = info?.rooms[cam];

  if (error) return <p className="error small">{error}</p>;
  if (!info) return <p className="muted small">Préparation du QR code…</p>;
  if (!url) return <p className="error small">Adresse Wi-Fi du PC introuvable. Le PC est-il connecté au Wi-Fi ?</p>;

  return (
    <div className="phone-qr">
      {qr && <img src={qr} alt="QR code caméra téléphone" />}
      <div className="phone-qr-text">
        <ol>
          <li>Téléphone sur le <b>même Wi-Fi</b> que ce PC.</li>
          <li>Scannez le QR code avec l'appareil photo.</li>
          <li>
            Première fois seulement : avertissement de sécurité → <b>Paramètres avancés</b> → <b>Continuer vers le site</b>.
          </li>
          <li>Autorisez la caméra et le micro, puis « Démarrer la caméra ».</li>
        </ol>
        <code className="url">{url}</code>
        {info.lanIps.length > 1 && (
          <select value={ip ?? ""} onChange={(e) => setIp(e.target.value)}>
            {info.lanIps.map((a) => (
              <option key={a}>{a}</option>
            ))}
          </select>
        )}
        <div className={`render-status ${room?.phone ? "ok" : "ko"}`}>{room?.phone ? "✓ Téléphone connecté" : "En attente du téléphone…"}</div>
      </div>
    </div>
  );
}
