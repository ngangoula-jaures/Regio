// Écran 1 — Démarrage : Regio vérifie tout seul le moteur vidéo, l'écran de la salle et les caméras.

import { ArrowRight } from "lucide-react";
import { RegioMark } from "../components/Logo";
import { StatusRow, type RowState } from "../components/StatusRow";
import { longDate, t } from "../i18n";
import { inTauri } from "../shared/server";
import { isWide, type Studio } from "../app/useStudio";

function engineRow(s: Studio): { state: RowState; detail: string } {
  if (s.link.kind === "on") return { state: "ok", detail: t("startup.engineReady") };
  const e = s.engine;
  if (e?.state === "error") return { state: "error", detail: t("startup.engineError", { message: e.message }) };
  if (e?.state === "downloading") return { state: "busy", detail: t("startup.engineDownloading", { percent: Math.round(e.progress * 100) }) };
  if (e?.state === "installing") return { state: "busy", detail: t("startup.engineInstalling") };
  if (e?.state === "starting") return { state: "busy", detail: t("startup.engineStarting") };
  if (e?.state === "running" || !inTauri) return { state: "busy", detail: t("startup.engineConnecting") };
  return { state: "busy", detail: t("startup.enginePreparing") };
}

export function StartupScreen({ studio, onNext }: { studio: Studio; onNext: () => void }) {
  const ready = studio.link.kind === "on";
  const engine = engineRow(studio);

  const room = studio.monitors.find((m) => !m.primary);
  const roomRow: { state: RowState; detail: string } = !ready
    ? { state: "idle", detail: t("startup.roomSearching") }
    : room
      ? isWide(room)
        ? { state: "ok", detail: t("startup.roomFound", { n: room.index + 1, width: room.width, height: room.height }) }
        : { state: "warn", detail: t("startup.roomAspect", { n: room.index + 1, width: room.width, height: room.height }) }
      : studio.monitors.length
        ? { state: "warn", detail: t("startup.roomMissing") }
        : { state: "busy", detail: t("startup.roomSearching") };

  const cams = studio.cameras;
  const camRow: { state: RowState; detail: string } = !ready
    ? { state: "idle", detail: t("startup.camerasSearching") }
    : cams === null
      ? { state: "busy", detail: t("startup.camerasSearching") }
      : cams.length
        ? { state: "ok", detail: t("startup.camerasFound", { count: cams.length }) }
        : { state: "warn", detail: t("startup.camerasNone") };

  return (
    <div className="startup">
      <div className="startup-head">
        <RegioMark size={104} title="Regio" />
        <h1>{t("startup.title")}</h1>
        <p className="startup-sub">{t("startup.subtitle")}</p>
      </div>
      <ul className="status-list card">
        <StatusRow state={engine.state} title={t("startup.engine")} detail={engine.detail} />
        <StatusRow state={roomRow.state} title={t("startup.room")} detail={roomRow.detail} />
        <StatusRow state={camRow.state} title={t("startup.cameras")} detail={camRow.detail} />
      </ul>
      <div className="startup-foot">
        <button type="button" className="btn btn-primary btn-lg" onClick={onNext} disabled={!ready || cams === null}>
          {t("startup.next")}
          <ArrowRight size={20} strokeWidth={2.2} />
        </button>
        <span className="startup-date">{t("common.serviceOf", { date: longDate() })}</span>
      </div>
    </div>
  );
}
