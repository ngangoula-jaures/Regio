// Page chargée par OBS (Browser Source 1920×1080, fond transparent) au-dessus de la caméra.
// Elle écoute les messages de la régie et affiche le contenu avec un fondu enchaîné.

import { useEffect, useRef, useState } from "react";
import OBSWebSocket from "obs-websocket-js";
import { readCustomEvent, type Content } from "../shared/content";

const FADE_MS = 450;

interface Layer {
  id: number;
  content: Content;
  /** "hold" = reste opaque sous le nouveau contenu ; "out" = s'efface (la caméra réapparaît). */
  state: "in" | "hold" | "out";
}

/** Le contenu couvre-t-il tout l'écran (la caméra n'est plus visible) ? */
function covers(c: Content): boolean {
  return c.kind === "image" || c.kind === "slides" || c.kind === "standby" || ((c.kind === "verse" || c.kind === "text") && c.layout === "full");
}

export default function Render() {
  const [layers, setLayers] = useState<Layer[]>([]);
  // Diagnostic visible dans l'image tant que la page n'est pas reliée à OBS.
  const [problem, setProblem] = useState<string | null>("Connexion à OBS…");
  const lastId = useRef(-1);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const port = params.get("port") ?? "4455";
    const password = params.get("password") ?? undefined;
    const ws = new OBSWebSocket();
    let stopped = false;
    let retry: number | undefined;

    const show = (id: number, content: Content) => {
      if (id === lastId.current) return;
      lastId.current = id;
      // Diapo suivante chargée d'avance : le passage à la diapo suivante est instantané.
      if (content.kind === "slides" && content.slides[content.index + 1]) new Image().src = content.slides[content.index + 1];
      // Si le nouveau contenu couvre l'écran, l'ancien reste opaque dessous pendant le fondu
      // (sinon la caméra « clignoterait » entre deux versets). Sinon l'ancien s'efface.
      const leave: Layer["state"] = covers(content) ? "hold" : "out";
      setLayers((prev) => [
        ...prev.filter((l) => l.state === "in").map((l) => ({ ...l, state: leave })),
        { id, content, state: "in" as const },
      ]);
      window.setTimeout(() => setLayers((prev) => prev.filter((l) => l.state === "in")), FADE_MS + 50);
    };

    ws.on("CustomEvent", (event) => {
      const msg = readCustomEvent(event);
      if (!msg) return;
      if (msg.type === "regio.show") show(msg.id, msg.content);
      if (msg.type === "regio.ping") ws.call("BroadcastCustomEvent", { eventData: { type: "regio.hello" } }).catch(() => {});
    });

    const connect = async () => {
      try {
        await ws.connect(`ws://127.0.0.1:${port}`, password || undefined);
        setProblem(null);
        // Demander l'état courant à la régie (utile si OBS recharge la page).
        await ws.call("BroadcastCustomEvent", { eventData: { type: "regio.hello" } });
      } catch (e) {
        setProblem(`Regio : connexion à OBS impossible (ws://127.0.0.1:${port}) — ${e instanceof Error ? e.message : String(e)}`);
        if (!stopped) retry = window.setTimeout(connect, 2000);
      }
    };
    ws.on("ConnectionClosed", () => {
      if (!stopped) retry = window.setTimeout(connect, 2000);
    });
    connect();

    return () => {
      stopped = true;
      window.clearTimeout(retry);
      ws.disconnect();
    };
  }, []);

  return (
    <div className="stage">
      {problem && <div className="diag">{problem}</div>}
      {layers.map((l) => (
        <div key={l.id} className={`layer ${l.state}`} style={{ animationDuration: `${FADE_MS}ms` }}>
          <ContentView content={l.content} />
        </div>
      ))}
    </div>
  );
}

/**
 * Taille de police adaptée à la longueur : un long passage rétrécit pour tenir à l'écran,
 * sans jamais descendre sous `min` (au-delà, il faudra découper en plusieurs écrans).
 */
function fit(text: string, base: number, comfortable: number, min: number): number {
  const len = text.length;
  return len <= comfortable ? base : Math.max(min, Math.round(base * Math.sqrt(comfortable / len)));
}

// Échelle de projection (charte) : 1080 px de haut → verset 6 %, référence 3,5 %, titre 9 %, bandeau 4 %.
const VERSE = 65;
const VERSE_MIN = 43;
const TITLE = 97;
const BAND = 43;
const BAND_MIN = 32;

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

function ContentView({ content }: { content: Content }) {
  switch (content.kind) {
    case "none":
      return null;
    case "verse":
      return content.layout === "full" ? (
        <div className="full">
          <blockquote className="verse-text" style={{ fontSize: fit(content.text, VERSE, 140, VERSE_MIN) }}>
            {content.text}
          </blockquote>
          <div className="ref">
            {content.reference.toUpperCase()} · {content.version.toUpperCase()}
          </div>
        </div>
      ) : (
        <div className="lower">
          <div className="lower-ref">{content.reference.toUpperCase()}</div>
          <div className="lower-body scripture" style={{ fontSize: fit(content.text, BAND, 120, BAND_MIN) }}>
            {content.text}
          </div>
        </div>
      );
    case "text":
      return content.layout === "full" ? (
        <div className="full">
          {content.title && (
            <h1 className="text-title" style={{ fontSize: fit(content.title, TITLE, 26, 64) }}>
              {content.title}
            </h1>
          )}
          {content.body && (
            <p className="text-body" style={{ fontSize: fit(content.body, 54, 120, 38) }}>
              {content.body}
            </p>
          )}
        </div>
      ) : (
        <div className="lower">
          {content.title && <div className="lower-ref">{content.title.toUpperCase()}</div>}
          {content.body && (
            <div className="lower-body" style={{ fontSize: fit(content.body, BAND, 120, BAND_MIN) }}>
              {content.body}
            </div>
          )}
        </div>
      );
    case "image":
      return (
        <div className="image">
          <img src={content.src} alt={content.name} />
        </div>
      );
    case "slides":
      return (
        <div className="image">
          <img src={content.slides[content.index]} alt={content.name} />
        </div>
      );
    case "standby":
      return (
        <div className="full standby">
          <Mark size={190} />
          <h1 className="standby-title">{content.title}</h1>
          {content.subtitle && <p className="standby-sub">{content.subtitle}</p>}
        </div>
      );
  }
}
