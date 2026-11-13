// Caméras de la régie (maquette v5) : EN GRAND, en haut de la zone centrale, toujours visibles.
// On les regarde avant de choisir : un clic met la caméra à l'écran (touches 1 à 6).
// 1–3 caméras : une rangée, nom dessous ; 4 : une rangée de 4 ; 5–6 : deux rangées de 3, nom sur l'image.

import { useCallback } from "react";
import { Plus, Video } from "lucide-react";
import { t } from "../i18n";
import { usePolledImage, type Camera, type Studio } from "../app/useStudio";

export const cameraLabel = (cam: Camera) => (cam.kind === "phone" ? t("sources.phoneN", { n: cam.label }) : cam.label);

function CameraTile(props: { studio: Studio; cam: Camera; n: number; compact: boolean; covered: boolean; onPick: () => void }) {
  const { studio, cam, n, compact, covered } = props;
  const fetcher = useCallback(() => studio.cameraShot(cam.source), [studio.cameraShot, cam.source]); // eslint-disable-line react-hooks/exhaustive-deps
  const shot = usePolledImage(fetcher, 1000);
  const on = studio.mainCamera === cam.source;
  const name = cameraLabel(cam);
  return (
    <button
      type="button"
      className={`cam-tile ${on ? (covered ? "is-ready" : "is-on") : ""}`}
      aria-pressed={on}
      aria-label={`${name} (${t("regie.camKey", { n })})`}
      onClick={props.onPick}
    >
      <span className="cam-tile-view">
        {shot ? <img src={shot} alt="" /> : <Video size={32} strokeWidth={1.5} />}
        {on && <span className={`cam-badge ${covered ? "is-ready" : ""}`}>{covered ? t("regie.camReady") : t("regie.onScreen")}</span>}
        {compact && (
          <span className="cam-over">
            <span className="cam-over-name">{name}</span>
            <kbd>{n}</kbd>
          </span>
        )}
      </span>
      {!compact && (
        <span className="cam-tile-row">
          <span className="cam-tile-name">{name}</span>
          <span className="cam-tile-key">{t("regie.camKey", { n })}</span>
        </span>
      )}
    </button>
  );
}

export function CameraStrip(props: { studio: Studio; cams: Camera[]; covered: boolean; onPick: (cam: Camera) => void; onAdd: () => void }) {
  const { cams, covered } = props;
  const n = cams.length;
  const cols = n <= 3 ? 3 : n === 4 ? 4 : 3;
  const compact = n > 3;
  return (
    <section className="cam-strip" aria-label={t("regie.cameras")}>
      <div className="cam-strip-head">
        <h2>{t("regie.cameras")}</h2>
        <span className="note">{covered ? t("regie.camerasHelpCovered") : t("regie.camerasHelpOn")}</span>
        <span className="spacer" />
        <button type="button" className="ghost-btn" onClick={props.onAdd}>
          <Plus size={16} strokeWidth={2} />
          {t("regie.addCamera")}
        </button>
      </div>
      {n === 0 ? (
        <button type="button" className="cam-empty" onClick={props.onAdd}>
          <Video size={28} strokeWidth={1.5} />
          {t("regie.noCamera")}
        </button>
      ) : (
        <div className={`cam-tiles ${compact ? "is-compact" : ""}`} style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
          {cams.map((c, i) => (
            <CameraTile key={c.source} studio={props.studio} cam={c} n={i + 1} compact={compact} covered={covered} onPick={() => props.onPick(c)} />
          ))}
        </div>
      )}
    </section>
  );
}
