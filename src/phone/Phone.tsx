// Page ouverte sur le téléphone (via le QR code) : envoie la caméra à OBS en WebRTC.
// Aucune application à installer, pas de filigrane, pas de limite de durée.

import { useEffect, useRef, useState } from "react";
import { SignalClient, preferH264, type SignalMessage } from "../shared/signal";

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
    const t = window.setInterval(async () => {
      const pc = pcRef.current.pc;
      if (!pc) return;
      const report = await pc.getStats();
      report.forEach((r) => {
        if (r.type !== "outbound-rtp" || r.kind !== "video") return;
        const mbps = lastTime ? ((r.bytesSent - lastBytes) * 8) / ((r.timestamp - lastTime) * 1000) : null;
        lastBytes = r.bytesSent;
        lastTime = r.timestamp;
        const limit = { bandwidth: "réseau Wi-Fi", cpu: "téléphone trop sollicité", other: "autre" }[r.qualityLimitationReason as string];
        setStats(
          `${r.frameWidth ?? "?"}×${r.frameHeight ?? "?"} · ${Math.round(r.framesPerSecond ?? 0)} i/s` +
            (mbps === null ? "" : ` · ${mbps.toFixed(1)} Mb/s`) +
            (limit ? ` · qualité réduite : ${limit}` : ""),
        );
      });
    }, 2000);
    return () => window.clearInterval(t);
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
        setError(`Un autre appareil a pris la place de la caméra n° ${cam}.`);
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
          <h1>Caméra Regio</h1>
          {!secure ? (
            <p className="error">
              La caméra est bloquée : la page doit être ouverte en <b>https://</b>. Scannez à nouveau le QR code affiché dans la régie.
            </p>
          ) : (
            <>
              <p>Tournez le téléphone à l'horizontale, posez-le sur un support stable, puis démarrez.</p>
              <div className="choice">
                <button className={quality === "720" ? "on" : ""} onClick={() => setQuality("720")}>
                  HD 720p
                  <small>Wi-Fi faible</small>
                </button>
                <button className={quality === "1080" ? "on" : ""} onClick={() => setQuality("1080")}>
                  Full HD 1080p
                  <small>Recommandé</small>
                </button>
              </div>
              <button className="go" onClick={start} disabled={phase === "starting"}>
                {phase === "starting" ? "Ouverture de la caméra…" : "▶ Démarrer la caméra"}
              </button>
            </>
          )}
          {error && <p className="error">{error}</p>}
          <p className="cam-id">Caméra n° {cam}</p>
        </div>
      )}

      {running && (
        <>
          <div className={`status ${phase}`}>
            {phase === "live" && "● EN DIRECT vers la régie"}
            {phase === "connecting" && "Connexion à la régie…"}
            {phase === "waiting" && (signalOk ? "Caméra prête — en attente de la régie" : "Recherche de la régie…")}
          </div>
          {error && <div className="toast">{error}</div>}
          {portrait && (
            <div className="rotate">
              <div className="rotate-icon">📱↻</div>
              Tournez le téléphone à l'horizontale
              <small>L'image est envoyée en vertical : elle aura des bandes noires sur l'écran de l'église.</small>
            </div>
          )}
          {stats && <div className="stats">{stats}</div>}
          <div className="controls">
            <button onClick={switchCamera}>🔄 Caméra {facing === "environment" ? "arrière" : "avant"}</button>
            <button onClick={toggleMic} className={micOn ? "" : "off"}>
              {micOn ? "🎙️ Son activé" : "🔇 Son coupé"}
            </button>
            <button className="stop" onClick={stop}>
              ■ Arrêter
            </button>
          </div>
        </>
      )}
    </div>
  );
}

interface PeerConnectionHolder {
  pc: RTCPeerConnection | null;
}

function explain(e: unknown): string {
  const name = (e as { name?: string })?.name;
  if (name === "NotAllowedError") return "Accès à la caméra refusé. Autorisez la caméra et le micro pour ce site dans le navigateur, puis réessayez.";
  if (name === "NotFoundError") return "Aucune caméra trouvée sur cet appareil.";
  if (name === "NotReadableError") return "La caméra est déjà utilisée par une autre application. Fermez-la et réessayez.";
  return e instanceof Error ? e.message : String(e);
}
