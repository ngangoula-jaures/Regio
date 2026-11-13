// État central de la régie : moteur vidéo, ce qui est à l'écran, projection, caméras, téléphone.
// Les écrans (Démarrage, Sources du jour, Régie) ne font qu'afficher cet état et appeler ses actions.

import { useCallback, useEffect, useRef, useState } from "react";
import { ObsController, PHONE_QR_PREFIX, type ConnectionSettings, type Monitor } from "../obs/obs";
import { readCustomEvent, type Content } from "../shared/content";
import { getServerInfo, inTauri, type ServerInfo } from "../shared/server";
import { getEngineState, type EngineState } from "../shared/engine";

export type Link = { kind: "off" } | { kind: "connecting" } | { kind: "on" } | { kind: "error"; message: string };
export type Projection = { kind: "monitor"; index: number } | { kind: "window" } | { kind: "none" };

export interface Camera {
  /** Nom de la source dans OBS. */
  source: string;
  /** Nom lisible (« HP TrueVision HD Camera ») ; pour un téléphone : son numéro (« 2 »). */
  label: string;
  kind: "device" | "phone";
}

/** Nombre maximal de téléphones-caméras (chacun décode une vidéo : au-delà, un PC modeste sature). */
export const MAX_PHONES = 4;

const SETTINGS_KEY = "regio.obs";

/** La télé reçoit-elle un format proche du 16:9 de la sortie ? Sinon : bandes noires. */
export const isWide = (m: Monitor) => Math.abs(m.width / m.height - 16 / 9) < 0.08;

export function loadBrowserSettings(): ConnectionSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY) ?? localStorage.getItem("diffchurch.obs");
    if (raw) return { host: "localhost", port: 4455, password: "", ...JSON.parse(raw) };
  } catch {
    /* ignore */
  }
  return { host: "localhost", port: 4455, password: "" };
}

export function useStudio() {
  const obs = useRef(new ObsController());
  const [link, setLink] = useState<Link>({ kind: "off" });
  const linkRef = useRef(link);
  linkRef.current = link;
  const [engine, setEngine] = useState<EngineState | null>(null);
  const [error, setError] = useState<string | null>(null);

  // ---------- Ce qui est à l'écran ----------
  const [current, setCurrent] = useState<Content>({ kind: "standby", title: "", subtitle: "" });
  const currentRef = useRef<{ id: number; content: Content }>({ id: 0, content: current });
  const [renderOnline, setRenderOnline] = useState(false);

  const show = useCallback(async (content: Content) => {
    const next = { id: currentRef.current.id + 1, content };
    currentRef.current = next;
    setCurrent(content);
    if (linkRef.current.kind !== "on") return;
    try {
      await obs.current.broadcast({ type: "regio.show", id: next.id, content });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  // ---------- Projection dans la salle ----------
  const [monitors, setMonitors] = useState<Monitor[]>([]);
  const [projection, setProjection] = useState<Projection>({ kind: "none" });
  const projectionRef = useRef(projection);
  projectionRef.current = projection;
  const autoProjected = useRef(false);

  const projectTo = useCallback(async (p: Projection) => {
    setProjection(p);
    if (p.kind === "monitor") await obs.current.project(p.index);
    else if (p.kind === "window") await obs.current.projectWindowed();
  }, []);

  const refreshMonitors = useCallback(async () => {
    const list = await obs.current.listMonitors();
    setMonitors(list);
    // Premier écran secondaire trouvé : la projection s'y ouvre toute seule (jamais sur l'écran de l'opérateur).
    if (!autoProjected.current && projectionRef.current.kind === "none") {
      const room = list.find((m) => !m.primary);
      if (room) {
        autoProjected.current = true;
        await projectTo({ kind: "monitor", index: room.index }).catch(() => {});
      }
    }
    return list;
  }, [projectTo]);

  // ---------- Caméras ----------
  const [cameras, setCameras] = useState<Camera[] | null>(null);
  const [mainCamera, setMainCamera] = useState<string | null>(null);
  const mainRef = useRef(mainCamera);
  mainRef.current = mainCamera;

  const detectCameras = useCallback(async () => {
    const devices = await obs.current.listVideoDevices().catch(() => []);
    const found: Camera[] = [];
    for (const d of devices) {
      const source = await obs.current.useVideoDevice(d, false);
      found.push({ source, label: d.name, kind: "device" });
    }
    setCameras(found);
    // Une seule caméra : elle devient la caméra principale sans rien demander.
    if (!mainRef.current && found.length > 0) {
      await obs.current.activateCamera(found[0].source);
      setMainCamera(found[0].source);
    }
    return found;
  }, []);

  const chooseMain = useCallback(async (source: string | null) => {
    if (source) await obs.current.activateCamera(source);
    else await obs.current.deactivateCameras();
    setMainCamera(source);
  }, []);

  /** Caméra dont on garde le son (null : le son suit l'image). */
  const [keptAudio, setKeptAudio] = useState<string | null>(null);
  const keepAudio = useCallback(async (source: string | null) => {
    setKeptAudio(source);
    await obs.current.setKeptAudio(source);
  }, []);

  const cameraShot = useCallback((source: string) => obs.current.sourceShot(source, 480), []);

  // ---------- Téléphone (QR code) ----------
  const [server, setServer] = useState<ServerInfo | null>(null);
  // Plusieurs téléphones : chacun a son numéro (« Téléphone 1 », « Téléphone 2 »…), son QR code et sa
  // réception dans le moteur vidéo. Il y a toujours UN numéro libre prêt pour le téléphone suivant.
  const [phoneIds, setPhoneIds] = useState<string[]>([]);
  const addingPhone = useRef(false);

  const preparing = useRef<Promise<void> | null>(null);
  const preparePhones = useCallback(() => {
    // Un seul passage à la fois (l'écran peut le demander deux fois de suite).
    preparing.current ??= doPreparePhones().finally(() => (preparing.current = null));
    return preparing.current;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const doPreparePhones = async () => {
    const existing = (await obs.current.listCameraSources())
      .filter((c) => c.kind === "phone-qr")
      .map((c) => c.name.slice(PHONE_QR_PREFIX.length).trim())
      .filter((id) => /^\d+$/.test(id));
    const ids = [...new Set(existing.length ? existing : ["1"])].sort((a, b) => Number(a) - Number(b));
    for (const id of ids) await obs.current.usePhoneQr(id, false);
    setPhoneIds(ids);
  };

  useEffect(() => {
    if (!server || phoneIds.length === 0 || addingPhone.current || phoneIds.length >= MAX_PHONES) return;
    if (!phoneIds.every((id) => server.rooms[id]?.phone)) return;
    addingPhone.current = true;
    const next = String(Math.max(...phoneIds.map(Number)) + 1);
    obs.current
      .usePhoneQr(next, false)
      .then(() => setPhoneIds((ids) => [...ids, next]))
      .finally(() => (addingPhone.current = false));
  }, [server, phoneIds]);

  /** Téléphones actuellement connectés. */
  const phoneCams: Camera[] = phoneIds
    .filter((id) => server?.rooms[id]?.phone)
    .map((id) => ({ source: `${PHONE_QR_PREFIX} ${id}`, label: id, kind: "phone" }));
  /** Numéro proposé au prochain téléphone (null : maximum atteint). */
  const freePhone = phoneIds.find((id) => !server?.rooms[id]?.phone) ?? null;

  const refreshServer = useCallback(async () => {
    const info = await getServerInfo();
    setServer(info);
    return info;
  }, []);

  // ---------- Connexion au moteur vidéo ----------
  const connect = useCallback(
    async (target: ConnectionSettings) => {
      setLink({ kind: "connecting" });
      setError(null);
      if (!inTauri) localStorage.setItem(SETTINGS_KEY, JSON.stringify(target));
      try {
        obs.current.localBase = (await getServerInfo()).localBase;
        await obs.current.connect(target);
        await obs.current.ensureSetup();
        setLink({ kind: "on" });
        setRenderOnline(false);
        // Restaure tout après une reconnexion (OBS relancé) : caméra, projection, contenu.
        const main = mainRef.current;
        if (main) await obs.current.activateCamera(main).catch(() => {});
        const p = projectionRef.current;
        if (p.kind !== "none") await projectTo(p).catch(() => {});
        await obs.current.broadcast({ type: "regio.ping" });
        await refreshMonitors().catch(() => {});
      } catch (e) {
        setLink({ kind: "error", message: e instanceof Error ? e.message : String(e) });
      }
    },
    [projectTo, refreshMonitors],
  );

  // Application de bureau : suivre le moteur embarqué et s'y connecter (et reconnecter) seul.
  useEffect(() => {
    if (!inTauri) return;
    let alive = true;
    let lastAttempt = 0;
    const tick = async () => {
      try {
        const e = await getEngineState();
        if (!alive) return;
        setEngine(e);
        const k = linkRef.current.kind;
        if (e.state === "running" && k !== "on" && k !== "connecting" && Date.now() - lastAttempt > 2000) {
          lastAttempt = Date.now();
          await connect({ host: "127.0.0.1", port: e.port, password: e.password });
        }
      } catch {
        /* commande pas encore prête : on réessaie */
      }
      if (alive) window.setTimeout(tick, 700);
    };
    tick();
    return () => {
      alive = false;
    };
  }, [connect]);

  // Page d'affichage : renvoyer le contenu courant quand elle (re)démarre ; détecter une coupure.
  useEffect(() => {
    const ws = obs.current.ws;
    const onEvent = (event: unknown) => {
      if (readCustomEvent(event)?.type === "regio.hello") {
        setRenderOnline(true);
        const { id, content } = currentRef.current;
        obs.current.broadcast({ type: "regio.show", id, content }).catch(() => {});
      }
    };
    const onClose = () => setLink((l) => (l.kind === "on" ? { kind: "error", message: "connexion perdue" } : l));
    ws.on("CustomEvent", onEvent);
    ws.on("ConnectionClosed", onClose);
    return () => {
      ws.off("CustomEvent", onEvent);
      ws.off("ConnectionClosed", onClose);
    };
  }, []);

  const reloadDisplay = useCallback(async () => {
    setRenderOnline(false);
    await obs.current.reloadOverlay();
    window.setTimeout(() => obs.current.broadcast({ type: "regio.ping" }).catch(() => {}), 3000);
  }, []);

  /** Image de ce qui sort réellement (aperçu dans la régie). */
  const outputShot = useCallback(() => obs.current.screenshot(960), []);

  return {
    /** Accès direct au moteur vidéo (le direct, le vumètre). */
    controller: obs.current,
    link,
    engine,
    error,
    clearError: () => setError(null),
    connect,
    current,
    show,
    renderOnline,
    reloadDisplay,
    outputShot,
    monitors,
    refreshMonitors,
    projection,
    projectTo,
    cameras,
    detectCameras,
    mainCamera,
    chooseMain,
    keptAudio,
    keepAudio,
    cameraShot,
    server,
    refreshServer,
    preparePhones,
    phoneCams,
    freePhone,
  };
}

export type Studio = ReturnType<typeof useStudio>;

/** Rafraîchit une image (aperçu, vignette) à intervalle régulier tant que le composant est affiché. */
export function usePolledImage(fetcher: (() => Promise<string>) | null, everyMs: number): string | null {
  const [img, setImg] = useState<string | null>(null);
  useEffect(() => {
    if (!fetcher) return;
    let alive = true;
    let timer: number | undefined;
    const tick = async () => {
      try {
        const v = await fetcher();
        if (alive) setImg(v);
      } catch {
        /* ignore : nouvel essai au prochain tour */
      }
      if (alive) timer = window.setTimeout(tick, everyMs);
    };
    tick();
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [fetcher, everyMs]);
  return img;
}
