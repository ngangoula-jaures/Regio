// Écran affiché pendant que Regio prépare son moteur vidéo (application de bureau).

import type { EngineState } from "../shared/engine";
import mark from "../../design/brand/regio-mark-on-dark.svg";

function describe(e: EngineState | null): { title: string; detail?: string; progress?: number } {
  switch (e?.state) {
    case undefined:
    case "preparing":
      return { title: "Préparation du moteur vidéo…" };
    case "downloading":
      return {
        title: "Installation du moteur vidéo",
        detail: "Premier lancement : téléchargement unique, environ 220 Mo. Les fois suivantes, Regio démarre directement.",
        progress: e.progress,
      };
    case "installing":
      return { title: "Installation du moteur vidéo", detail: "Presque terminé…" };
    case "starting":
      return { title: "Démarrage du moteur vidéo…" };
    case "running":
      return { title: "Connexion…" };
    case "error":
      return { title: "Le moteur vidéo n'a pas pu démarrer", detail: e.message };
  }
}

export function Startup({ engine, connectError }: { engine: EngineState | null; connectError: string | null }) {
  const d = describe(engine);
  const failed = engine?.state === "error";
  return (
    <div className="startup">
      <img src={mark} alt="" className="startup-mark" />
      <h2>{d.title}</h2>
      {d.detail && <p className={failed ? "error" : "muted"}>{d.detail}</p>}
      {d.progress !== undefined && (
        <div className="startup-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(d.progress * 100)}>
          <div style={{ width: `${Math.round(d.progress * 100)}%` }} />
          <span>{Math.round(d.progress * 100)} %</span>
        </div>
      )}
      {connectError && !failed && <p className="muted small">Nouvel essai de connexion… ({connectError})</p>}
    </div>
  );
}
