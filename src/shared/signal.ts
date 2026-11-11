// Client de signalisation WebRTC (téléphone ↔ page réceptrice dans OBS), avec reconnexion auto.

export const SIGNAL_PATH = "/diffchurch/signal";

/** Code de fermeture envoyé par le serveur quand une connexion plus récente prend la place. */
export const CLOSE_REPLACED = 4000;

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
    private onReplaced?: () => void,
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
    ws.onclose = (e) => {
      if (this.ws !== ws) return;
      this.onStatus(false);
      // Remplacé par une connexion plus récente (ex. source téléphone dupliquée dans OBS) :
      // ne pas se reconnecter, sinon les deux se remplaceraient en boucle.
      if (e.code === CLOSE_REPLACED) {
        this.stopped = true;
        this.onReplaced?.();
        return;
      }
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
