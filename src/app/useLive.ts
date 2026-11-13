// Le direct (Phase 2, Facebook d'abord) : réglages enregistrés, passer en direct / terminer, santé de la connexion.
// La qualité est appliquée par le moteur vidéo au démarrage (profil OBS « Regio » écrit par src-tauri/src/obs.rs) :
// la changer redémarre le moteur (quelques secondes, jamais pendant un direct).

import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { loadDoc, saveDoc } from "../shared/storage";
import { inTauri } from "../shared/server";
import type { Studio } from "./useStudio";

export type Quality = "480" | "720" | "1080";
export type Target = "page" | "profile" | "group";

export interface LiveSettings {
  target: Target;
  /** Clé de stream Facebook (reste sur ce PC). */
  key: string;
  quality: Quality;
  /** Enregistrer aussi le direct sur ce PC (demandé à chaque fois, dernier choix retenu). */
  record: boolean;
}

/** Débit vidéo envoyé par qualité (kb/s), le même que dans obs.rs. */
export const BITRATE: Record<Quality, number> = { "480": 1500, "720": 3000, "1080": 6000 };
/** Débit montant minimal pour chaque qualité (marge de 50 % pour les imprévus), en Mb/s. */
export const NEEDED: Record<Quality, number> = { "480": 2.3, "720": 4.5, "1080": 9 };
/** Taille d'un enregistrement par heure (Go) : même image que le direct + son 160 kb/s. */
export const gbPerHour = (q: Quality) => ((BITRATE[q] + 160) * 3600) / 8 / 1e6;

export type Phase = "unset" | "ready" | "starting" | "live" | "stopping";
export type Health = "good" | "weak" | "cut";

export interface Ended {
  durationMs: number;
  recording: string | null;
}

const DOC = "live";

export function recommendedQuality(mbps: number): Quality {
  return mbps >= NEEDED["720"] ? "720" : "480";
}

export function useLive(studio: Studio) {
  const [settings, setSettings] = useState<LiveSettings | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [phase, setPhase] = useState<Phase>("unset");
  const [durationMs, setDurationMs] = useState(0);
  const [health, setHealth] = useState<Health>("good");
  const [kbps, setKbps] = useState(0);
  const [dropped, setDropped] = useState(0);
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ended, setEnded] = useState<Ended | null>(null);
  const [restarting, setRestarting] = useState(false);
  const last = useRef<{ bytes: number; at: number } | null>(null);
  const startedAt = useRef(0);

  useEffect(() => {
    loadDoc<LiveSettings>(DOC).then((s) => {
      if (s?.key) {
        setSettings(s);
        setPhase("ready");
      }
      setLoaded(true);
    });
  }, []);

  /** Fin de l'assistant : enregistre les réglages ; une nouvelle qualité redémarre le moteur vidéo. */
  const configure = useCallback(
    async (next: LiveSettings) => {
      const qualityChanged = settings?.quality !== next.quality;
      setSettings(next);
      await saveDoc(DOC, next);
      setPhase("ready");
      if (inTauri && qualityChanged && studio.link.kind === "on") {
        setRestarting(true);
        await invoke("restart_engine").catch(() => {});
        window.setTimeout(() => setRestarting(false), 12000);
      }
    },
    [settings, studio.link.kind],
  );

  const setRecord = useCallback(
    (record: boolean) => {
      if (!settings) return;
      const next = { ...settings, record };
      setSettings(next);
      saveDoc(DOC, next).catch(() => {});
    },
    [settings],
  );

  const start = useCallback(async () => {
    if (!settings) return;
    setError(null);
    setEnded(null);
    setPhase("starting");
    setHealth("good");
    last.current = null;
    startedAt.current = Date.now();
    try {
      await studio.controller.setFacebookKey(settings.key);
      await studio.controller.startLive(settings.record);
    } catch (e) {
      setPhase("ready");
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [settings, studio.controller]);

  const stop = useCallback(async () => {
    setPhase("stopping");
    const duration = durationMs;
    const path = await studio.controller.stopLive().catch(() => null);
    setPhase("ready");
    setRecording(false);
    setEnded({ durationMs: duration, recording: path });
  }, [durationMs, studio.controller]);

  // Pendant le direct : état toutes les 2 s (durée, débit, santé, enregistrement).
  useEffect(() => {
    if (phase !== "starting" && phase !== "live") return;
    let alive = true;
    const tick = async () => {
      try {
        const st = await studio.controller.liveStatus();
        if (!alive) return;
        setRecording(st.recording);
        if (phase === "starting") {
          if (st.active) setPhase("live");
          // Facebook refuse la connexion (mauvaise clé, Internet absent) : on n'attend pas indéfiniment.
          else if (Date.now() - startedAt.current > 20000) {
            await studio.controller.stopLive().catch(() => {});
            setPhase("ready");
            setError("refused");
            return;
          }
        } else if (!st.active && !st.reconnecting) {
          // Arrêté hors de Regio (OBS relancé…) : on revient à « prêt ».
          setPhase("ready");
          return;
        }
        setDurationMs(st.durationMs);
        const now = Date.now();
        let rate = kbps;
        if (last.current && now > last.current.at) rate = Math.max(0, ((st.bytes - last.current.bytes) * 8) / (now - last.current.at));
        last.current = { bytes: st.bytes, at: now };
        setKbps(Math.round(rate));
        setDropped(st.totalFrames ? (100 * st.skippedFrames) / st.totalFrames : 0);
        const target = settings ? BITRATE[settings.quality] : 3000;
        setHealth(st.reconnecting ? "cut" : st.congestion > 0.25 || (st.durationMs > 10000 && rate < target * 0.6) ? "weak" : "good");
      } catch {
        /* moteur vidéo indisponible un instant : nouvel essai */
      }
    };
    tick();
    const id = window.setInterval(tick, 2000);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, [phase, settings, studio.controller]); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    loaded,
    settings,
    phase,
    durationMs,
    health,
    kbps,
    dropped,
    recording,
    error,
    clearError: () => setError(null),
    ended,
    clearEnded: () => setEnded(null),
    restarting,
    configure,
    setRecord,
    start,
    stop,
  };
}

export type Live = ReturnType<typeof useLive>;

/** Mesure du débit montant (Mb/s). Navigateur (développement) : valeur simulée. */
export async function uploadTest(): Promise<number> {
  if (inTauri) return invoke<number>("upload_test");
  await new Promise((r) => window.setTimeout(r, 1200));
  return 8.2;
}

/** Dossier des enregistrements et espace libre. */
export async function recordingsInfo(): Promise<{ path: string; freeBytes: number | null }> {
  if (inTauri) return invoke("recordings_info");
  return { path: "Vidéos\\Regio", freeBytes: 120e9 };
}

export const formatDuration = (ms: number) => {
  const s = Math.floor(ms / 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(Math.floor(s / 3600))}:${p(Math.floor(s / 60) % 60)}:${p(s % 60)}`;
};
