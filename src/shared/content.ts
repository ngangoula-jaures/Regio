// Contenu affiché par-dessus la caméra. Envoyé de la régie vers la page « render » via OBS.

export type Layout = "full" | "lower";

export type Content =
  | { kind: "none" } // caméra seule
  | { kind: "verse"; layout: Layout; reference: string; text: string; version: string }
  | { kind: "text"; layout: Layout; title: string; body: string }
  | { kind: "image"; src: string; name: string } // src = adresse de l'image (médias)
  // Présentation importée (PowerPoint) : une image par diapo ; `index` = diapo affichée.
  | { kind: "slides"; name: string; slides: string[]; index: number; source?: "pdf" }
  | { kind: "standby"; title: string; subtitle: string }; // écran d'attente / logo

/** Identifiant de chaque affichage : permet à la page render de lancer un fondu à chaque changement. */
export interface ShowMessage {
  type: "regio.show";
  id: number;
  content: Content;
}

/** Envoyé par la page render quand elle (re)démarre, pour récupérer l'état courant. */
export interface HelloMessage {
  type: "regio.hello";
}

/** Envoyé par la régie pour savoir si la page de sortie est vivante (elle répond « hello »). */
export interface PingMessage {
  type: "regio.ping";
}

/** Mode répétition : ce que la télé de la salle affiche à la place de la régie (l'écran d'attente). */
export interface HoldMessage {
  type: "regio.hold";
  id: number;
  content: Content;
}

export type BusMessage = ShowMessage | HelloMessage | PingMessage | HoldMessage;

export function isBusMessage(data: unknown): data is BusMessage {
  if (typeof data !== "object" || data === null) return false;
  const t = (data as { type?: unknown }).type;
  return t === "regio.show" || t === "regio.hello" || t === "regio.ping" || t === "regio.hold";
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
