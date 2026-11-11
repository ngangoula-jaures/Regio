// Client de signalisation WebRTC (téléphone ↔ page réceptrice dans OBS), avec reconnexion auto.

export const SIGNAL_PATH = "/diffchurch/signal";

export type SignalMessage =
  | { type: "peer"; present: boolean }
  | { type: "offer"; sdp: string }
  | { type: "answer"; sdp: string }
  | { type: "candidate"; candidate: RTCIceCandidateInit };

export class SignalClient {
  private ws: WebSocket | null = null;
  private stopped = false;
  private retry: number | undefined;

  constructor(
    private role: "phone" | "receiver",
    private cam: string,
    private onMessage: (msg: SignalMessage) => void,
    private onStatus: (connected: boolean) => void,
  ) {}

  start() {
    this.stopped = false;
    this.open();
  }

  stop() {
    this.stopped = true;
    window.clearTimeout(this.retry);
    this.ws?.close();
  }

  send(msg: SignalMessage) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  private open() {
    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${proto}//${location.host}${SIGNAL_PATH}`);
    this.ws = ws;
    ws.onopen = () => {
      ws.send(JSON.stringify({ type: "join", role: this.role, cam: this.cam }));
      this.onStatus(true);
    };
    ws.onmessage = (e) => {
      try {
        this.onMessage(JSON.parse(e.data));
      } catch {
        /* ignore */
      }
    };
    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.onStatus(false);
      if (!this.stopped) this.retry = window.setTimeout(() => this.open(), 1500);
    };
  }
}

/** Met H.264 en premier (encodage matériel du téléphone, décodage léger côté PC). */
export function preferH264(pc: RTCPeerConnection) {
  const caps = RTCRtpReceiver.getCapabilities?.("video");
  if (!caps) return;
  const h264 = caps.codecs.filter((c) => c.mimeType.toLowerCase() === "video/h264");
  const rest = caps.codecs.filter((c) => c.mimeType.toLowerCase() !== "video/h264");
  for (const t of pc.getTransceivers()) {
    if (t.receiver.track?.kind === "video" && t.setCodecPreferences && h264.length) {
      try {
        t.setCodecPreferences([...h264, ...rest]);
      } catch {
        /* codec non pris en charge : on garde l'ordre par défaut */
      }
    }
  }
}
