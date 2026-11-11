// Page chargée par OBS (Browser Source 1920×1080) : reçoit la caméra du téléphone en WebRTC
// et l'affiche plein cadre. Le son du téléphone passe aussi dans OBS (« reroute_audio »).

import { useEffect, useRef, useState } from "react";
import { SignalClient, preferH264, type SignalMessage } from "../shared/signal";

export default function Receiver() {
  const cam = new URLSearchParams(location.search).get("cam") ?? "1";
  const videoRef = useRef<HTMLVideoElement>(null);
  const [live, setLive] = useState(false);

  useEffect(() => {
    let pc: RTCPeerConnection | null = null;

    const play = async () => {
      const v = videoRef.current;
      if (!v) return;
      try {
        v.muted = false;
        await v.play();
      } catch {
        // Lecture automatique avec son refusée : on lit sans le son plutôt que pas du tout.
        v.muted = true;
        await v.play().catch(() => {});
      }
    };

    const onSignal = async (msg: SignalMessage) => {
      switch (msg.type) {
        case "offer": {
          pc?.close();
          const conn = new RTCPeerConnection();
          pc = conn;
          conn.ontrack = (e) => {
            const v = videoRef.current;
            if (v && v.srcObject !== e.streams[0]) {
              v.srcObject = e.streams[0];
              play();
            }
          };
          conn.onicecandidate = (e) => e.candidate && signal.send({ type: "candidate", candidate: e.candidate.toJSON() });
          conn.onconnectionstatechange = () => {
            if (pc === conn) setLive(conn.connectionState === "connected");
          };
          await conn.setRemoteDescription({ type: "offer", sdp: msg.sdp });
          preferH264(conn);
          const answer = await conn.createAnswer();
          await conn.setLocalDescription(answer);
          signal.send({ type: "answer", sdp: answer.sdp ?? "" });
          break;
        }
        case "candidate":
          await pc?.addIceCandidate(msg.candidate).catch(() => {});
          break;
        case "peer":
          if (!msg.present) {
            pc?.close();
            pc = null;
            setLive(false);
          }
          break;
      }
    };

    const signal = new SignalClient("receiver", cam, onSignal, () => {});
    signal.start();
    return () => {
      signal.stop();
      pc?.close();
    };
  }, [cam]);

  return (
    <div className="receiver">
      <video ref={videoRef} autoPlay playsInline className={live ? "on" : ""} />
      {!live && <div className="waiting">📱 Caméra téléphone n° {cam} — en attente…</div>}
    </div>
  );
}
