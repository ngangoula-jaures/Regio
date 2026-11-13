// Client de signalisation WebRTC (téléphone ↔ page réceptrice dans OBS), avec reconnexion auto.

export const SIGNAL_PATH = "/regio/signal";

/** Code de fermeture envoyé par le serveur quand une connexion plus récente prend la place. */
export const CLOSE_REPLACED = 4000;
/** Code de fermeture : aucune place de téléphone libre pour l'instant (réessayer). */
export const CLOSE_NO_SLOT = 4009;

/** Identifiant de cet appareil, conservé : permet de reprendre SA place après une coupure. */
export function deviceId(): string {
  try {
    let id = localStorage.getItem("regio.device");
    if (!id) {
      id = crypto.randomUUID?.() ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
      localStorage.setItem("regio.device", id);
    }
    return id;
  } catch {
    return `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
  }
}

export type SignalMessage =
  | { type: "peer"; present: boolean }
  | { type: "assigned"; cam: string }
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
    /** Téléphone : aucune place libre (true) / place obtenue (false). */
    private onNoSlot?: (waiting: boolean) => void,
  ) {}

  /** Place réellement attribuée par la régie (un téléphone peut recevoir un autre numéro que celui du QR code). */
  get camera() {
    return this.cam;
  }

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
      // Clé secrète du QR code (exigée par le serveur de l'application pour un téléphone).
      const key = new URLSearchParams(location.search).get("k") ?? undefined;
      const device = this.role === "phone" ? deviceId() : undefined;
      ws.send(JSON.stringify({ type: "join", role: this.role, cam: this.cam, key, device }));
      this.onStatus(true);
    };
    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data) as SignalMessage;
        if (msg.type === "assigned") {
          this.cam = msg.cam; // les reconnexions redemandent cette place
          this.onNoSlot?.(false);
        }
        this.onMessage(msg);
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
      if (e.code === CLOSE_NO_SLOT) this.onNoSlot?.(true);
      if (!this.stopped) this.retry = window.setTimeout(() => this.open(), e.code === CLOSE_NO_SLOT ? 2500 : 1500);
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
