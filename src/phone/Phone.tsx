// Page ouverte sur le téléphone (via le QR code) : envoie la caméra à OBS en WebRTC.
// Aucune application à installer, pas de filigrane, pas de limite de durée.

import { useEffect, useRef, useState } from "react";
import { Mic, MicOff, Play, RotateCcw, Smartphone, Square, SwitchCamera } from "lucide-react";
import { SignalClient, preferH264, type SignalMessage } from "../shared/signal";
import { t } from "../i18n";

type Quality = "720" | "1080";
type Phase = "idle" | "starting" | "waiting" | "connecting" | "live" | "error";

const BITRATE: Record<Quality, number> = { "720": 3_500_000, "1080": 6_000_000 };

export default function Phone() {
  const cam = new URLSearchParams(location.search).get("cam") ?? "1";
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [quality, setQuality] = useState<Quality>("1080");
  const [facing, setFacing] = useState<"environment" | "user">("environment");
  const [micOn, setMicOn] = useState(true);
  const [signalOk, setSignalOk] = useState(false);
  const [portrait, setPortrait] = useState(false);
  const [stats, setStats] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const pcRef = useRef<PeerConnectionHolder>({ pc: null });
  const signalRef = useRef<SignalClient | null>(null);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  const secure = window.isSecureContext && !!navigator.mediaDevices?.getUserMedia;

  // Libérer caméra, connexion et verrou d'écran en quittant la page.
  useEffect(() => () => stopAll(), []); // eslint-disable-line react-hooks/exhaustive-deps

  // Garder l'écran allumé (sinon le téléphone se met en veille et coupe la caméra).
  useEffect(() => {
    const relock = () => {
      if (document.visibilityState === "visible" && streamRef.current) requestWakeLock();
    };
    document.addEventListener("visibilitychange", relock);
    return () => document.removeEventListener("visibilitychange", relock);
  }, []);

  async function requestWakeLock() {
    try {
      wakeLockRef.current = (await navigator.wakeLock?.request("screen")) ?? null;
    } catch {
      /* pas grave : l'utilisateur peut désactiver la mise en veille */
    }
  }

  /**
   * Plein écran + verrouillage à l'horizontale (comme une appli caméra) : le navigateur envoie alors
   * une image horizontale, même si la rotation automatique est désactivée. Non pris en charge partout
   * (ex. iPhone) : dans ce cas l'avertissement « Tournez le téléphone » prend le relais.
   */
  async function lockLandscape() {
    try {
      if (!document.fullscreenElement) await document.documentElement.requestFullscreen({ navigationUI: "hide" });
      const orientation = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
      await orientation.lock?.("landscape");
    } catch {
      /* non pris en charge */
    }
  }

  function unlockLandscape() {
    try {
      screen.orientation?.unlock?.();
    } catch {
      /* ignore */
    }
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  }

  // Détecte une image en portrait (téléphone tenu verticalement).
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const check = () => setPortrait(v.videoWidth > 0 && v.videoHeight > v.videoWidth);
    v.addEventListener("resize", check);
    v.addEventListener("loadedmetadata", check);
    return () => {
      v.removeEventListener("resize", check);
      v.removeEventListener("loadedmetadata", check);
    };
  }, []);

  // Infos techniques du direct (résolution réellement envoyée, débit, cause d'une baisse de qualité).
  useEffect(() => {
    if (phase !== "live") {
      setStats(null);
      return;
    }
    let lastBytes = 0;
    let lastTime = 0;
    const timer = window.setInterval(async () => {
      const pc = pcRef.current.pc;
      if (!pc) return;
      const report = await pc.getStats();
      report.forEach((r) => {
        if (r.type !== "outbound-rtp" || r.kind !== "video") return;
        const mbps = lastTime ? ((r.bytesSent - lastBytes) * 8) / ((r.timestamp - lastTime) * 1000) : null;
        lastBytes = r.bytesSent;
        lastTime = r.timestamp;
        const limit = { bandwidth: t("phone.limitNetwork"), cpu: t("phone.limitCpu"), other: t("phone.limitOther") }[r.qualityLimitationReason as string];
        setStats(
          `${r.frameWidth ?? "?"}×${r.frameHeight ?? "?"} · ${Math.round(r.framesPerSecond ?? 0)} ${t("phone.fps")}` +
            (mbps === null ? "" : ` · ${mbps.toFixed(1)} Mb/s`) +
            (limit ? ` · ${t("phone.limited", { why: limit })}` : ""),
        );
      });
    }, 2000);
    return () => window.clearInterval(timer);
  }, [phase]);

  async function openCamera(face: "environment" | "user", q: Quality): Promise<MediaStream> {
    const [w, h] = q === "1080" ? [1920, 1080] : [1280, 720];
    return navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: face }, width: { ideal: w }, height: { ideal: h }, frameRate: { ideal: 30 } },
      // Pas de traitement « appel vidéo » : il abîme la musique et les voix de l'église.
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    });
  }

  async function start() {
    setError(null);
    setPhase("starting");
    await lockLandscape(); // avant tout : nécessite le geste de l'utilisateur (le clic)
    try {
      const stream = await openCamera(facing, quality);
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
      await requestWakeLock();
      setPhase("waiting");
      const signal = new SignalClient("phone", cam, onSignal, setSignalOk, () => {
        stopAll();
        setPhase("error");
        setError(t("phone.replaced", { n: cam }));
      });
      signalRef.current = signal;
      signal.start();
    } catch (e) {
      setPhase("error");
      setError(explain(e));
    }
  }

  function stopAll() {
    signalRef.current?.stop();
    signalRef.current = null;
    pcRef.current.pc?.close();
    pcRef.current.pc = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    wakeLockRef.current?.release().catch(() => {});
    wakeLockRef.current = null;
  }

  function stop() {
    stopAll();
    unlockLandscape();
    if (videoRef.current) videoRef.current.srcObject = null;
    setPhase("idle");
  }

  // ---------- WebRTC (le téléphone fait l'offre) ----------

  async function call() {
    const stream = streamRef.current;
    const signal = signalRef.current;
    if (!stream || !signal) return;
    pcRef.current.pc?.close();
    const pc = new RTCPeerConnection(); // réseau local : pas besoin de serveur STUN/TURN
    pcRef.current.pc = pc;
    stream.getTracks().forEach((t) => pc.addTrack(t, stream));
    preferH264(pc);
    pc.onicecandidate = (e) => e.candidate && signal.send({ type: "candidate", candidate: e.candidate.toJSON() });
    pc.onconnectionstatechange = () => {
      if (pcRef.current.pc !== pc) return;
      if (pc.connectionState === "connected") {
        setPhase("live");
        applyBitrate(pc);
      } else if (pc.connectionState === "failed") {
        setPhase("connecting");
        window.setTimeout(() => pcRef.current.pc === pc && call(), 1500); // nouvel essai
      } else if (pc.connectionState === "disconnected") {
        setPhase("connecting");
      }
    };
    setPhase("connecting");
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    signal.send({ type: "offer", sdp: offer.sdp ?? "" });
  }

  function applyBitrate(pc: RTCPeerConnection) {
    for (const sender of pc.getSenders()) {
      if (sender.track?.kind !== "video") continue;
      const params = sender.getParameters();
      if (!params.encodings?.length) params.encodings = [{}];
      params.encodings[0].maxBitrate = BITRATE[quality];
      params.encodings[0].maxFramerate = 30;
      sender.setParameters(params).catch(() => {});
    }
  }

  async function onSignal(msg: SignalMessage) {
    const pc = pcRef.current.pc;
    switch (msg.type) {
      case "peer":
        if (msg.present) await call();
        else {
          pc?.close();
          pcRef.current.pc = null;
          setPhase("waiting");
        }
        break;
      case "answer":
        await pc?.setRemoteDescription({ type: "answer", sdp: msg.sdp }).catch(() => {});
        break;
      case "candidate":
        await pc?.addIceCandidate(msg.candidate).catch(() => {});
        break;
    }
  }

  // ---------- Commandes pendant le direct ----------

  async function switchCamera() {
    const next = facing === "environment" ? "user" : "environment";
    try {
      const fresh = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: next }, width: { ideal: quality === "1080" ? 1920 : 1280 }, height: { ideal: quality === "1080" ? 1080 : 720 }, frameRate: { ideal: 30 } },
      });
      const newTrack = fresh.getVideoTracks()[0];
      const stream = streamRef.current;
      if (!stream) return;
      const old = stream.getVideoTracks()[0];
      await pcRef.current.pc?.getSenders().find((s) => s.track?.kind === "video")?.replaceTrack(newTrack);
      stream.removeTrack(old);
      old.stop();
      stream.addTrack(newTrack);
      if (videoRef.current) videoRef.current.srcObject = stream;
      setFacing(next);
    } catch (e) {
      setError(explain(e));
    }
  }

  function toggleMic() {
    const next = !micOn;
    streamRef.current?.getAudioTracks().forEach((t) => (t.enabled = next));
    setMicOn(next);
  }

  // ---------- Rendu ----------

  // Pendant « starting », on reste sur l'écran d'accueil (bouton désactivé).
  const running = phase === "waiting" || phase === "connecting" || phase === "live";

  return (
    <div className="phone">
      <video ref={videoRef} className={`preview ${facing === "user" ? "mirror" : ""}`} autoPlay playsInline muted />

      {!running && (
        <div className="start">
          <div className="brand">
            <Mark size={30} />
            <span>regio</span>
          </div>
          <div className="start-main">
            <h1>{t("phone.title", { n: cam })}</h1>
            <p className="sub">{t("phone.subtitle")}</p>
            {!secure ? (
              <p className="error">{t("phone.insecure")}</p>
            ) : (
              <>
                <div className="tip">
                  <RotateCcw size={22} strokeWidth={1.75} />
                  <span>{t("phone.rotate")}</span>
                </div>
                <div className="choice" role="radiogroup" aria-label={t("phone.quality")}>
                  <button type="button" role="radio" aria-checked={quality === "720"} className={quality === "720" ? "on" : ""} onClick={() => setQuality("720")}>
                    {t("phone.hd")}
                    <small>{t("phone.hdHelp")}</small>
                  </button>
                  <button type="button" role="radio" aria-checked={quality === "1080"} className={quality === "1080" ? "on" : ""} onClick={() => setQuality("1080")}>
                    {t("phone.fullHd")}
                    <small>{t("phone.fullHdHelp")}</small>
                  </button>
                </div>
                <button type="button" className="go" onClick={start} disabled={phase === "starting"}>
                  <Play size={20} strokeWidth={2.2} fill="currentColor" />
                  {phase === "starting" ? t("phone.starting") : t("phone.start")}
                </button>
              </>
            )}
            {error && <p className="error">{error}</p>}
          </div>
          <p className="foot">{t("phone.sameWifi")}</p>
        </div>
      )}

      {running && (
        <>
          <div className="top">
            <Mark size={26} />
            <div className={`status ${phase}`}>
              {phase === "live" && t("phone.live")}
              {phase === "connecting" && t("phone.connecting")}
              {phase === "waiting" && (signalOk ? t("phone.waiting") : t("phone.searching"))}
            </div>
            <span className="cam-name">{t("phone.title", { n: cam })}</span>
          </div>
          {error && <div className="toast">{error}</div>}
          {portrait && (
            <div className="rotate">
              <Smartphone size={64} strokeWidth={1.25} className="rotate-icon" />
              {t("phone.portraitTitle")}
              <small>{t("phone.portraitHelp")}</small>
            </div>
          )}
          {stats && <div className="stats">{stats}</div>}
          <div className="controls">
            <button type="button" onClick={switchCamera}>
              <SwitchCamera size={20} strokeWidth={1.75} />
              {facing === "environment" ? t("phone.back") : t("phone.front")}
            </button>
            <button type="button" onClick={toggleMic} className={micOn ? "" : "off"}>
              {micOn ? <Mic size={20} strokeWidth={1.75} /> : <MicOff size={20} strokeWidth={1.75} />}
              {micOn ? t("phone.micOn") : t("phone.micOff")}
            </button>
            <button type="button" className="stop" onClick={stop}>
              <Square size={16} strokeWidth={2} fill="currentColor" />
              {t("phone.stop")}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function Mark({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true">
      <rect x="9.5" y="19.5" width="81" height="61" rx="15" fill="none" stroke="#f6f2e8" strokeWidth="7" />
      <path d="M36.5 63 V43" fill="none" stroke="#f6f2e8" strokeWidth="9" strokeLinecap="round" />
      <path d="M36.5 51 C36.5 42 43.5 37 52.5 37" fill="none" stroke="#f6f2e8" strokeWidth="9" strokeLinecap="round" />
      <circle cx="62.5" cy="37" r="6" fill="#e8b44c" />
    </svg>
  );
}

interface PeerConnectionHolder {
  pc: RTCPeerConnection | null;
}

function explain(e: unknown): string {
  const name = (e as { name?: string })?.name;
  if (name === "NotAllowedError") return t("phone.denied");
  if (name === "NotFoundError") return t("phone.noCamera");
  if (name === "NotReadableError") return t("phone.busy");
  return e instanceof Error ? e.message : String(e);
}
