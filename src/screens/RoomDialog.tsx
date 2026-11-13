// « Télé de la salle » : où s'affiche l'image vue par l'assemblée (votre ordinateur, la télé, une fenêtre d'essai).

import { useState } from "react";
import { Laptop, MonitorPlay, Tv } from "lucide-react";
import { t } from "../i18n";
import type { Studio } from "../app/useStudio";

export function RoomButton({ studio }: { studio: Studio }) {
  const [open, setOpen] = useState(false);
  const p = studio.projection;
  const state = p.kind === "monitor" ? t("regie.roomShown") : p.kind === "window" ? t("regie.roomTest") : t("regie.roomNone");
  const tvs = studio.monitors.filter((m) => !m.primary);
  const choose = async (fn: () => Promise<void>) => {
    setOpen(false);
    await fn().catch(() => {});
  };
  return (
    <div className="menu-wrap">
      <button
        type="button"
        className="room-btn"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          if (!open) studio.refreshMonitors().catch(() => {});
          setOpen(!open);
        }}
      >
        <Tv size={18} strokeWidth={1.75} />
        {t("regie.room")}
        <span className={`room-state ${p.kind === "none" ? "is-warn" : "is-ok"}`}>{state}</span>
      </button>
      {open && (
        <div className="room-dialog" role="dialog" aria-label={t("regie.roomTitle")}>
          <h2>{t("regie.roomTitle")}</h2>
          <div className="room-choices">
            {studio.monitors
              .filter((m) => m.primary)
              .map((m) => (
                <button
                  key={m.index}
                  type="button"
                  className="room-choice"
                  aria-pressed={p.kind === "monitor" && p.index === m.index}
                  onClick={() => choose(() => studio.projectTo({ kind: "monitor", index: m.index }))}
                >
                  <Laptop size={40} strokeWidth={1.25} />
                  <strong>{t("regie.roomComputer")}</strong>
                  <span>{t("regie.roomComputerHelp")}</span>
                </button>
              ))}
            {tvs.map((m, i) => (
              <button
                key={m.index}
                type="button"
                className="room-choice"
                aria-pressed={p.kind === "monitor" && p.index === m.index}
                onClick={() => choose(() => studio.projectTo({ kind: "monitor", index: m.index }))}
              >
                <Tv size={40} strokeWidth={1.25} />
                <strong>{tvs.length > 1 ? t("regie.roomTvN", { n: i + 1 }) : t("regie.roomTv")}</strong>
                <span>{t("regie.roomTvHelp", { width: m.width, height: m.height })}</span>
              </button>
            ))}
          </div>
          <button type="button" className="btn btn-sm" onClick={() => choose(() => studio.projectTo({ kind: "window" }))}>
            <MonitorPlay size={16} strokeWidth={1.75} />
            {t("regie.roomWindow")}
          </button>
          <p className="note">{t("regie.roomHint")}</p>
        </div>
      )}
    </div>
  );
}
