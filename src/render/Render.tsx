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
  return c.kind === "image" || c.kind === "standby" || ((c.kind === "verse" || c.kind === "text") && c.layout === "full");
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
      if (msg.type === "diffchurch.show") show(msg.id, msg.content);
      if (msg.type === "diffchurch.ping") ws.call("BroadcastCustomEvent", { eventData: { type: "diffchurch.hello" } }).catch(() => {});
    });

    const connect = async () => {
      try {
        await ws.connect(`ws://127.0.0.1:${port}`, password || undefined);
        setProblem(null);
        // Demander l'état courant à la régie (utile si OBS recharge la page).
        await ws.call("BroadcastCustomEvent", { eventData: { type: "diffchurch.hello" } });
      } catch (e) {
        setProblem(`DiffChurch : connexion à OBS impossible (ws://127.0.0.1:${port}) — ${e instanceof Error ? e.message : String(e)}`);
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

function ContentView({ content }: { content: Content }) {
  switch (content.kind) {
    case "none":
      return null;
    case "verse":
      return content.layout === "full" ? (
        <div className="full">
          <blockquote className="verse-text">{content.text}</blockquote>
          <div className="verse-ref">
            {content.reference} <span className="version">· {content.version}</span>
          </div>
        </div>
      ) : (
        <div className="lower">
          <div className="lower-title">
            {content.reference} <span className="version">· {content.version}</span>
          </div>
          <div className="lower-body">{content.text}</div>
        </div>
      );
    case "text":
      return content.layout === "full" ? (
        <div className="full">
          {content.title && <h1 className="text-title">{content.title}</h1>}
          {content.body && <p className="text-body">{content.body}</p>}
        </div>
      ) : (
        <div className="lower">
          {content.title && <div className="lower-title">{content.title}</div>}
          {content.body && <div className="lower-body">{content.body}</div>}
        </div>
      );
    case "image":
      return (
        <div className="image">
          <img src={content.src} alt={content.name} />
        </div>
      );
    case "standby":
      return (
        <div className="full standby">
          <h1 className="text-title">{content.title}</h1>
          {content.subtitle && <p className="text-body">{content.subtitle}</p>}
        </div>
      );
  }
}
