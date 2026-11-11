// Contenu affiché par-dessus la caméra. Envoyé de la régie vers la page « render » via OBS.

export type Layout = "full" | "lower";

export type Content =
  | { kind: "none" } // caméra seule
  | { kind: "verse"; layout: Layout; reference: string; text: string; version: string }
  | { kind: "text"; layout: Layout; title: string; body: string }
  | { kind: "image"; src: string; name: string } // src = data URL (Phase 0)
  | { kind: "standby"; title: string; subtitle: string }; // écran d'attente / logo

/** Identifiant de chaque affichage : permet à la page render de lancer un fondu à chaque changement. */
export interface ShowMessage {
  type: "diffchurch.show";
  id: number;
  content: Content;
}

/** Envoyé par la page render quand elle (re)démarre, pour récupérer l'état courant. */
export interface HelloMessage {
  type: "diffchurch.hello";
}

/** Envoyé par la régie pour savoir si la page de sortie est vivante (elle répond « hello »). */
export interface PingMessage {
  type: "diffchurch.ping";
}

export type BusMessage = ShowMessage | HelloMessage | PingMessage;

export function isBusMessage(data: unknown): data is BusMessage {
  if (typeof data !== "object" || data === null) return false;
  const t = (data as { type?: unknown }).type;
  return t === "diffchurch.show" || t === "diffchurch.hello" || t === "diffchurch.ping";
}

/**
 * Extrait notre message d'un événement OBS « CustomEvent ».
 * En pratique obs-websocket-js transmet directement les données envoyées (vérifié sur OBS 33),
 * alors que ses types annoncent { eventData }. On accepte les deux formes.
 */
export function readCustomEvent(event: unknown): BusMessage | null {
  if (isBusMessage(event)) return event;
  const inner = (event as { eventData?: unknown } | null)?.eventData;
  return isBusMessage(inner) ? inner : null;
}
