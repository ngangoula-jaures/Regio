// Écran 3 — La régie pendant le culte : déroulé, ce qui est à l'écran, « Suivant », Bible / Médias / Texte.

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, ChevronDown, Monitor as MonitorIcon, RefreshCw } from "lucide-react";
import { RegioLockup } from "../components/Logo";
import { longDate, t } from "../i18n";
import type { Content } from "../shared/content";
import { kindLabel, kindOf, samplePlan } from "../app/plan";
import { usePolledImage, type Studio } from "../app/useStudio";
import { ContentPanels } from "./ContentPanels";

function RoomMenu({ studio }: { studio: Studio }) {
  const [open, setOpen] = useState(false);
  const p = studio.projection;
  const label =
    p.kind === "monitor" ? t("regie.roomScreen", { n: p.index + 1 }) : p.kind === "window" ? t("regie.roomWindow") : t("regie.roomNone");
  return (
    <div className="menu-wrap">
      <button
        type="button"
        className={`pill pill-btn ${p.kind === "none" ? "pill-warn" : "pill-ok"}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => {
          if (!open) studio.refreshMonitors().catch(() => {});
          setOpen(!open);
        }}
      >
        {label}
        <ChevronDown size={14} />
      </button>
      {open && (
        <div className="menu" role="menu">
          <div className="menu-title">{t("regie.roomMenu")}</div>
          {studio.monitors.map((m) => (
            <button
              key={m.index}
              type="button"
              role="menuitemradio"
              aria-checked={p.kind === "monitor" && p.index === m.index}
              onClick={() => {
                setOpen(false);
                studio.projectTo({ kind: "monitor", index: m.index });
              }}
            >
              <MonitorIcon size={16} strokeWidth={1.75} />
              {t("regie.roomScreenItem", { n: m.index + 1, width: m.width, height: m.height })} {m.primary ? t("regie.roomPrimary") : ""}
            </button>
          ))}
          <button
            type="button"
            role="menuitemradio"
            aria-checked={p.kind === "window"}
            onClick={() => {
              setOpen(false);
              studio.projectTo({ kind: "window" });
            }}
          >
            <MonitorIcon size={16} strokeWidth={1.75} />
            {t("regie.roomWindowItem")}
          </button>
        </div>
      )}
    </div>
  );
}

export function RegieScreen({ studio }: { studio: Studio }) {
  const [plan] = useState(samplePlan);
  const [idx, setIdx] = useState(0);
  /** Contenu affiché hors déroulé (verset cherché, affiche, texte libre, caméra seule). */
  const [override, setOverride] = useState(false);

  const showPlan = useCallback(
    (i: number) => {
      setIdx(i);
      setOverride(false);
      studio.show(plan[i].content);
    },
    [plan, studio.show], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const showOther = useCallback(
    (c: Content) => {
      setOverride(true);
      studio.show(c);
    },
    [studio.show], // eslint-disable-line react-hooks/exhaustive-deps
  );

  // En entrant dans la régie : le premier élément du déroulé.
  useEffect(() => {
    showPlan(0);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const next = useCallback(() => showPlan(Math.min(idx + 1, plan.length - 1)), [idx, plan.length, showPlan]);
  const cameraOnly = useCallback(() => showOther({ kind: "none" }), [showOther]);

  // Clavier : barre d'espace = Suivant, Échap = caméra seule (sauf pendant la saisie d'un texte).
  const keys = useRef({ next, cameraOnly });
  keys.current = { next, cameraOnly };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.closest("input, textarea, select, [contenteditable]")) return;
      if (e.key === " ") {
        e.preventDefault();
        keys.current.next();
      } else if (e.key === "Escape") {
        e.preventDefault();
        keys.current.cameraOnly();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Mise en page de ce qui est à l'écran.
  const cur = studio.current;
  const canLayout = cur.kind === "verse" || cur.kind === "text";
  const setLayout = (layout: "lower" | "full") => {
    if (cur.kind === "verse" || cur.kind === "text") showOther({ ...cur, layout });
  };
  const k = kindOf(cur);

  const preview = usePolledImage(studio.link.kind === "on" ? studio.outputShot : null, 500);
  const upcoming = plan[idx + 1];

  // Déroulé groupé par moments.
  const groups: Array<{ moment: string; items: Array<{ item: (typeof plan)[number]; i: number }> }> = [];
  plan.forEach((item, i) => {
    const g = groups.at(-1);
    if (g && g.moment === item.moment) g.items.push({ item, i });
    else groups.push({ moment: item.moment, items: [{ item, i }] });
  });

  return (
    <div className="regie">
      <header className="topbar">
        <RegioLockup />
        <span className="topbar-date">{t("common.serviceOf", { date: longDate() })}</span>
        <span className="spacer" />
        <span className={`pill ${studio.link.kind === "on" ? "pill-ok" : "pill-warn"}`}>
          {studio.link.kind === "on" ? t("regie.engineOk") : t("regie.engineLost")}
        </span>
        <RoomMenu studio={studio} />
      </header>

      <div className="regie-body">
        <nav className="plan" aria-label={t("regie.plan")}>
          <div className="plan-head">
            <h2>{t("regie.plan")}</h2>
            <span className="note">{t("regie.progress", { n: idx + 1, total: plan.length })}</span>
          </div>
          {groups.map((g) => (
            <div key={g.moment + g.items[0].i} style={{ display: "contents" }}>
              <div className="plan-moment">{g.moment}</div>
              {g.items.map(({ item, i }) => {
                const isCur = i === idx && !override;
                return (
                  <button
                    key={item.id}
                    type="button"
                    className={`plan-item ${isCur ? "is-current" : ""} ${i < idx ? "is-done" : ""}`}
                    aria-current={isCur ? "step" : undefined}
                    onClick={() => showPlan(i)}
                  >
                    <span className="plan-dot" />
                    <span className="plan-text">
                      <span className="plan-label">{item.label}</span>
                      <span className="plan-kind">{kindLabel(item.content)}</span>
                    </span>
                    {isCur && <span className="plan-badge">{t("regie.onScreen")}</span>}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

        <main className="stage">
          <div className="stage-head">
            <h2>
              {t("regie.output")} <span>· {t("regie.outputHint")}</span>
            </h2>
            <div className="segmented" role="group" aria-label={t("regie.layout")}>
              <button type="button" aria-pressed={k === "camera"} onClick={cameraOnly}>
                {t("regie.cameraOnly")}
              </button>
              <button type="button" aria-pressed={k === "lower"} disabled={!canLayout} onClick={() => setLayout("lower")}>
                {t("regie.lower")}
              </button>
              <button type="button" aria-pressed={k !== "camera" && k !== "lower"} disabled={!canLayout} onClick={() => setLayout("full")}>
                {t("regie.full")}
              </button>
            </div>
          </div>

          <div className="screen">
            {preview ? <img src={preview} alt={t("regie.previewAlt")} /> : <div className="screen-wait">…</div>}
          </div>

          {studio.link.kind === "on" && !studio.renderOnline && (
            <p className="banner banner-error">
              {t("regie.renderLost")}
              <span className="spacer" />
              <button type="button" className="btn btn-sm" onClick={() => studio.reloadDisplay()}>
                <RefreshCw size={15} />
                {t("regie.renderReload")}
              </button>
            </p>
          )}

          <div className="actions">
            <div className="upnext">
              <span className="upnext-tag">{t("regie.then")}</span>
              <span className="upnext-text">
                <span className="upnext-label">{upcoming ? `${upcoming.moment} · ${upcoming.label}` : t("regie.end")}</span>
                <span className="upnext-kind">{upcoming ? kindLabel(upcoming.content) : t("regie.endDetail")}</span>
              </span>
            </div>
            <button type="button" className="btn big-action" onClick={cameraOnly}>
              {t("regie.cameraOnly")}
              <small>{t("regie.escapeKey")}</small>
            </button>
            <button type="button" className="btn btn-primary big-action next-btn" onClick={next} disabled={!upcoming}>
              <span>
                {t("regie.next")}
                <small>{t("regie.nextKey")}</small>
              </span>
              <ArrowRight size={24} strokeWidth={2.2} />
            </button>
          </div>
        </main>

        <ContentPanels onShow={showOther} />
      </div>
    </div>
  );
}
