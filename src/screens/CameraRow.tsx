// Rangée des caméras de la régie : un clic change l'image, à tout moment.

import { useCallback } from "react";
import { Plus, Video } from "lucide-react";
import { t } from "../i18n";
import { PHONE_CAM, usePolledImage, type Camera, type Studio } from "../app/useStudio";

function CameraTile({ studio, cam }: { studio: Studio; cam: Camera }) {
  const fetcher = useCallback(() => studio.cameraShot(cam.source), [studio.cameraShot, cam.source]); // eslint-disable-line react-hooks/exhaustive-deps
  const shot = usePolledImage(fetcher, 1500);
  const on = studio.mainCamera === cam.source;
  return (
    <button type="button" className={`cam-tile ${on ? "is-on" : ""}`} aria-pressed={on} onClick={() => studio.chooseMain(cam.source)}>
      <span className="cam-tile-view">{shot ? <img src={shot} alt="" /> : <Video size={28} strokeWidth={1.5} />}</span>
      <span className="cam-tile-row">
        <span className="cam-tile-name">{cam.kind === "phone" ? t("regie.phone") : cam.label}</span>
        {on && <span className="plan-badge">{t("regie.onScreen")}</span>}
      </span>
    </button>
  );
}

export function CameraRow({ studio, onAdd }: { studio: Studio; onAdd: () => void }) {
  const phoneOn = Boolean(studio.server?.rooms[PHONE_CAM]?.phone);
  const cams: Camera[] = [
    ...(studio.cameras ?? []),
    ...(phoneOn && studio.phoneSource ? [{ source: studio.phoneSource, label: t("regie.phone"), kind: "phone" as const }] : []),
  ];
  return (
    <section className="camera-strip" aria-label={t("regie.cameras")}>
      <h2>
        {t("regie.cameras")} <span>· {t("regie.camerasHelp")}</span>
      </h2>
      <div className="cam-tiles">
        {cams.map((c) => (
          <CameraTile key={c.source} studio={studio} cam={c} />
        ))}
        <button type="button" className="cam-tile cam-add" onClick={onAdd}>
          <Plus size={24} strokeWidth={1.75} />
          {t("regie.addCamera")}
        </button>
      </div>
    </section>
  );
}
