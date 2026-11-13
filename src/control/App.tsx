// Régie — prototype Phase 0.
// Objectif : valider la chaîne caméra → OBS → projecteur HDMI avec des fondus sans écran noir.

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ObsController,
  type CameraSource,
  type ConnectionSettings,
  type Monitor,
  type VideoDevice,
} from "../obs/obs";
import { readCustomEvent, type Content, type Layout } from "../shared/content";
import { SAMPLE_VERSES } from "../shared/bible-sample";
import { loadImageAsDataUrl } from "./images";
import { PhoneQr } from "./PhoneQr";
import { getServerInfo, inTauri } from "../shared/server";
import { getEngineState, type EngineState } from "../shared/engine";
import { Startup } from "./Startup";
import "./App.css";

const SETTINGS_KEY = "regio.obs";

function loadSettings(): ConnectionSettings {
  try {
    // Reprend aussi les réglages enregistrés sous l'ancien nom du projet.
    const raw = localStorage.getItem(SETTINGS_KEY) ?? localStorage.getItem("diffchurch.obs");
    if (raw) return { host: "localhost", port: 4455, password: "", ...JSON.parse(raw) };
  } catch {
    /* ignore */
  }
  return { host: "localhost", port: 4455, password: "" };
}

type Status = { kind: "off" } | { kind: "connecting" } | { kind: "on"; label: string } | { kind: "error"; message: string };

interface ImageItem {
  name: string;
  src: string;
}

export default function App() {
  const obs = useRef(new ObsController());
  const [settings, setSettings] = useState<ConnectionSettings>(loadSettings);
  const [status, setStatus] = useState<Status>({ kind: "off" });
  const [notice, setNotice] = useState<string | null>(null);

  const [cameras, setCameras] = useState<CameraSource[]>([]);
  const [activeCamera, setActiveCamera] = useState<string | null>(null);
  const [devices, setDevices] = useState<VideoDevice[] | null>(null);
  const [monitors, setMonitors] = useState<Monitor[]>([]);
  const [preview, setPreview] = useState<string | null>(null);
  const [renderOnline, setRenderOnline] = useState(false);

  const [layout, setLayout] = useState<Layout>("lower");
  const [current, setCurrent] = useState<Content>({ kind: "none" });
  const currentRef = useRef<{ id: number; content: Content }>({ id: 0, content: { kind: "none" } });
  const [images, setImages] = useState<ImageItem[]>([]);
  const [freeTitle, setFreeTitle] = useState("Annonce");
  const [freeBody, setFreeBody] = useState("Réunion de prière mercredi à 18h30");

  const connected = status.kind === "on";

  const fail = (e: unknown) => setNotice(e instanceof Error ? e.message : String(e));

  // ---------- Envoi du contenu ----------

  const show = useCallback(async (content: Content) => {
    const next = { id: currentRef.current.id + 1, content };
    currentRef.current = next;
    setCurrent(content);
    try {
      await obs.current.broadcast({ type: "regio.show", id: next.id, content });
    } catch (e) {
      fail(e);
    }
  }, []);

  // ---------- Connexion ----------

  const refreshSources = useCallback(async () => {
    const [cams, mons] = await Promise.all([obs.current.listCameraSources(), obs.current.listMonitors()]);
    setCameras(cams);
    setMonitors(mons);
  }, []);

  // Dernière projection ouverte : rouverte automatiquement si OBS redémarre (jamais de salle sans image).
  const projectorRef = useRef<{ kind: "monitor"; index: number } | { kind: "window" } | null>(null);

  const connect = async (target: ConnectionSettings = settings) => {
    setStatus({ kind: "connecting" });
    setNotice(null);
    if (!inTauri) localStorage.setItem(SETTINGS_KEY, JSON.stringify(target));
    try {
      obs.current.localBase = (await getServerInfo()).localBase;
      const label = await obs.current.connect(target);
      await obs.current.ensureSetup();
      setStatus({ kind: "on", label });
      await refreshSources();
      const proj = projectorRef.current;
      if (proj) await (proj.kind === "monitor" ? obs.current.project(proj.index) : obs.current.projectWindowed()).catch(() => {});
      // La page de sortie répondra « hello » si elle est bien chargée dans OBS.
      setRenderOnline(false);
      await obs.current.broadcast({ type: "regio.ping" });
    } catch (e) {
      setStatus({ kind: "error", message: e instanceof Error ? e.message : String(e) });
    }
  };

  // Application de bureau : suivre le moteur vidéo embarqué et s'y connecter automatiquement.
  const [engine, setEngine] = useState<EngineState | null>(null);
  const statusRef = useRef(status);
  statusRef.current = status;
  useEffect(() => {
    if (!inTauri) return;
    let alive = true;
    let lastAttempt = 0;
    const tick = async () => {
      try {
        const e = await getEngineState();
        if (!alive) return;
        setEngine(e);
        const st = statusRef.current.kind;
        if (e.state === "running" && st !== "on" && st !== "connecting" && Date.now() - lastAttempt > 2000) {
          lastAttempt = Date.now();
          await connect({ host: "127.0.0.1", port: e.port, password: e.password });
        }
      } catch {
        /* commande indisponible : on réessaie */
      }
      if (alive) window.setTimeout(tick, 700);
    };
    tick();
    return () => {
      alive = false;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Répondre à la page de sortie quand elle (re)démarre, et détecter la déconnexion.
  useEffect(() => {
    const ws = obs.current.ws;
    const onEvent = (event: unknown) => {
      if (readCustomEvent(event)?.type === "regio.hello") {
        setRenderOnline(true);
        const { id, content } = currentRef.current;
        obs.current.broadcast({ type: "regio.show", id, content }).catch(() => {});
      }
    };
    const onClose = () => setStatus((s) => (s.kind === "on" ? { kind: "error", message: "Connexion à OBS perdue." } : s));
    ws.on("CustomEvent", onEvent);
    ws.on("ConnectionClosed", onClose);
    return () => {
      ws.off("CustomEvent", onEvent);
      ws.off("ConnectionClosed", onClose);
    };
  }, []);

  // Aperçu de la sortie (~2 images/s).
  useEffect(() => {
    if (!connected) return;
    let alive = true;
    const tick = async () => {
      try {
        const img = await obs.current.screenshot(640);
        if (alive) setPreview(img);
      } catch {
        /* ignore */
      }
      if (alive) window.setTimeout(tick, 500);
    };
    tick();
    return () => {
      alive = false;
    };
  }, [connected]);

  // Échap = revenir à la caméra seule (réflexe d'urgence).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && connected) show({ kind: "none" });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [connected, show]);

  // ---------- Actions caméra / écran ----------

  const run = async (fn: () => Promise<unknown>) => {
    setNotice(null);
    try {
      await fn();
    } catch (e) {
      fail(e);
    }
  };

  const detectDevices = () => run(async () => setDevices(await obs.current.listVideoDevices()));

  const useDevice = (d: VideoDevice) =>
    run(async () => {
      setActiveCamera(await obs.current.useVideoDevice(d));
      await refreshSources();
    });

  const [showQr, setShowQr] = useState(false);
  const usePhoneQr = () =>
    run(async () => {
      setActiveCamera(await obs.current.usePhoneQr("1"));
      setShowQr(true);
      await refreshSources();
    });

  const useSource = (name: string) =>
    run(async () => {
      await obs.current.activateCamera(name);
      setActiveCamera(name);
    });

  const importImages = async (files: FileList | null) => {
    if (!files) return;
    const loaded: ImageItem[] = [];
    for (const f of Array.from(files)) {
      try {
        loaded.push({ name: f.name, src: await loadImageAsDataUrl(f) });
      } catch (e) {
        fail(e);
      }
    }
    setImages((prev) => [...prev, ...loaded]);
  };

  // ---------- Rendu ----------

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          Regio <span>Régie · prototype</span>
        </div>
        <StatusPill status={status} />
      </header>

      {notice && (
        <div className="notice" onClick={() => setNotice(null)}>
          ⚠️ {notice} <small>(cliquer pour fermer)</small>
        </div>
      )}

      {!connected ? (
        inTauri ? (
          <Startup engine={engine} connectError={status.kind === "error" ? status.message : null} />
        ) : (
          <ConnectPanel settings={settings} onChange={setSettings} onConnect={() => connect()} status={status} />
        )
      ) : (
        <main className="grid">
          {/* ---- Colonne gauche : matériel ---- */}
          <section className="col">
            <div className="card">
              <h2>📷 Caméra</h2>
              {cameras.length === 0 && <p className="muted">Aucune caméra pour l'instant.</p>}
              <div className="list">
                {cameras.map((c) => (
                  <button key={c.name} className={`row ${activeCamera === c.name ? "active" : ""}`} onClick={() => useSource(c.name)}>
                    {c.kind === "phone-qr" ? "📱" : "🎥"} {c.name.replace(/^Regio - /, "")}
                  </button>
                ))}
              </div>
              <div className="actions">
                <button onClick={detectDevices}>Détecter les caméras USB / HDMI</button>
                <button onClick={usePhoneQr}>📱 Téléphone (QR code)</button>
              </div>
              {showQr && (
                <div className="sub">
                  <PhoneQr cam="1" />
                  <button className="secondary" onClick={() => setShowQr(false)}>
                    Masquer le QR code
                  </button>
                </div>
              )}
              {devices && (
                <div className="list sub">
                  {devices.length === 0 && <p className="muted">Aucun périphérique détecté.</p>}
                  {devices.map((d) => (
                    <button key={d.id} className="row" onClick={() => useDevice(d)}>
                      ➕ {d.name}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="card">
              <h2>🖥️ Écran de projection</h2>
              <div className="list">
                {monitors.map((m) => (
                  <button key={m.index} className="row" onClick={() => run(() => {
                      projectorRef.current = { kind: "monitor", index: m.index };
                      return obs.current.project(m.index);
                    })}>
                    Projeter sur {m.label}
                  </button>
                ))}
              </div>
              <div className="actions">
                <button onClick={() => run(() => {
                    projectorRef.current = { kind: "window" };
                    return obs.current.projectWindowed();
                  })}>Tester dans une fenêtre</button>
                <button onClick={() => run(refreshSources)}>↻ Actualiser</button>
              </div>
              <p className="muted small">Branchez le projecteur en HDMI et choisissez « Étendre » (Windows + P).</p>
            </div>
          </section>

          {/* ---- Colonne centrale : sortie ---- */}
          <section className="col center">
            <div className="card">
              <h2>Sortie (ce que voient l'église et le direct)</h2>
              <div className="preview">{preview ? <img src={preview} alt="Aperçu de la sortie" /> : <div className="muted">Aperçu…</div>}</div>
              <div className="now">
                En ce moment : <b>{describe(current)}</b>
              </div>
              <div className={`render-status ${renderOnline ? "ok" : "ko"}`}>
                {renderOnline ? "✓ Page d'affichage chargée dans OBS" : "⚠ La page d'affichage ne répond pas dans OBS"}
                <button
                  onClick={() =>
                    run(async () => {
                      setRenderOnline(false);
                      await obs.current.ensureSetup();
                      await obs.current.reloadOverlay();
                      setNotice(null);
                      window.setTimeout(() => obs.current.broadcast({ type: "regio.ping" }).catch(() => {}), 3000);
                    })
                  }
                >
                  ↻ Recharger
                </button>
              </div>
              {!renderOnline && <OverlayUrl obs={obs.current} />}
              <button className="big camera-only" onClick={() => show({ kind: "none" })}>
                📷 Caméra seule <small>(Échap)</small>
              </button>
            </div>
          </section>

          {/* ---- Colonne droite : contenu ---- */}
          <section className="col">
            <div className="card">
              <h2>Affichage</h2>
              <div className="segmented">
                <button className={layout === "lower" ? "on" : ""} onClick={() => setLayout("lower")}>
                  Bandeau (caméra visible)
                </button>
                <button className={layout === "full" ? "on" : ""} onClick={() => setLayout("full")}>
                  Plein écran
                </button>
              </div>
            </div>

            <div className="card">
              <h2>📖 Versets (exemple LSG 1910)</h2>
              <div className="list">
                {SAMPLE_VERSES.map((v) => (
                  <button key={v.reference} className="row" onClick={() => show({ kind: "verse", layout, ...v })}>
                    <b>{v.reference}</b> <span className="muted">{v.text.slice(0, 48)}…</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="card">
              <h2>✏️ Texte libre</h2>
              <input value={freeTitle} onChange={(e) => setFreeTitle(e.target.value)} placeholder="Titre" />
              <textarea value={freeBody} onChange={(e) => setFreeBody(e.target.value)} placeholder="Texte" rows={3} />
              <button onClick={() => show({ kind: "text", layout, title: freeTitle, body: freeBody })}>Afficher</button>
            </div>

            <div className="card">
              <h2>🖼️ Affiches</h2>
              <label className="file">
                Importer des images…
                <input type="file" accept="image/*" multiple onChange={(e) => importImages(e.target.files)} />
              </label>
              <div className="thumbs">
                {images.map((img, i) => (
                  <button key={i} className="thumb" title={img.name} onClick={() => show({ kind: "image", src: img.src, name: img.name })}>
                    <img src={img.src} alt={img.name} />
                  </button>
                ))}
              </div>
            </div>

            <div className="card">
              <button onClick={() => show({ kind: "standby", title: "Bienvenue", subtitle: "Le culte va bientôt commencer" })}>⏳ Écran d'attente</button>
            </div>
          </section>
        </main>
      )}
    </div>
  );
}

function OverlayUrl({ obs }: { obs: ObsController }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    obs.overlayUrl().then(setUrl).catch(() => {});
  }, [obs]);
  return (
    <p className="muted small">
      Adresse chargée par OBS : <code>{url.replace(/password=[^&]*/, "password=•••")}</code>
    </p>
  );
}

function describe(c: Content): string {
  switch (c.kind) {
    case "none":
      return "Caméra seule";
    case "verse":
      return `${c.reference} (${c.layout === "full" ? "plein écran" : "bandeau"})`;
    case "text":
      return `Texte « ${c.title} »`;
    case "image":
      return `Affiche ${c.name}`;
    case "standby":
      return "Écran d'attente";
  }
}

function StatusPill({ status }: { status: Status }) {
  const map = {
    off: ["Déconnecté", "grey"],
    connecting: ["Connexion…", "orange"],
    on: ["Connecté", "green"],
    error: ["Erreur", "red"],
  } as const;
  const [label, color] = map[status.kind];
  return (
    <div className={`pill ${color}`} title={status.kind === "on" ? status.label : undefined}>
      ● {label}
    </div>
  );
}

function ConnectPanel(props: { settings: ConnectionSettings; onChange: (s: ConnectionSettings) => void; onConnect: () => void; status: Status }) {
  const { settings, onChange, onConnect, status } = props;
  return (
    <div className="connect card">
      <h2>Connexion au moteur vidéo (OBS)</h2>
      <ol className="help">
        <li>
          Installez et ouvrez <b>OBS Studio</b> (gratuit, obsproject.com).
        </li>
        <li>
          Dans OBS : menu <b>Outils → Paramètres du serveur WebSocket</b> → cochez <b>Activer le serveur WebSocket</b>.
        </li>
        <li>
          Cliquez sur <b>Afficher les informations de connexion</b> et copiez le mot de passe ci-dessous.
        </li>
      </ol>
      <div className="form">
        <label>
          Adresse
          <input value={settings.host} onChange={(e) => onChange({ ...settings, host: e.target.value })} />
        </label>
        <label>
          Port
          <input type="number" value={settings.port} onChange={(e) => onChange({ ...settings, port: Number(e.target.value) })} />
        </label>
        <label>
          Mot de passe
          <input type="password" value={settings.password} onChange={(e) => onChange({ ...settings, password: e.target.value })} />
        </label>
      </div>
      {status.kind === "error" && <p className="error">Impossible de se connecter : {status.message}</p>}
      <button className="big" onClick={onConnect} disabled={status.kind === "connecting"}>
        {status.kind === "connecting" ? "Connexion…" : "Se connecter et préparer OBS"}
      </button>
    </div>
  );
}
