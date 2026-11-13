// Écran 3 — La régie pendant le culte (maquette v3) :
// déroulé en moments à gauche ; à l'écran + ensuite au centre ; caméras ; onglets à droite.
//
// Navigation (Suivant / Précédent, espace, flèches) selon le dernier clic :
// - sur un moment du déroulé  → moment par moment (le 1er contenu de chacun s'affiche) ;
// - sur un contenu d'un moment → contenu par contenu (puis le moment suivant) ;
// - sur un verset de la Bible  → lecture suivie, verset par verset.

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, BookOpen, RefreshCw } from "lucide-react";
import { RegioLockup } from "../components/Logo";
import { MiniScreen } from "../components/MiniScreen";
import { longDate, t } from "../i18n";
import type { Content } from "../shared/content";
import { loadBible, refLabel, type Bible } from "../bible/bible";
import { uid, useLibrary } from "../app/library";
import { usePolledImage, type Studio } from "../app/useStudio";
import { storeImage } from "../shared/storage";
import { CameraRow } from "./CameraRow";
import { RoomButton } from "./RoomDialog";
import { RightPanel, verseContent, type Reading, type Tab } from "./RightPanel";

type Mode = "moments" | "items" | "reading";
interface Pos {
  m: number;
  i: number;
}

export function RegieScreen({ studio, active = true, onSources }: { studio: Studio; active?: boolean; onSources: () => void }) {
  const { lib, update } = useLibrary();
  const [bible, setBible] = useState<Bible | null>(null);
  useEffect(() => {
    loadBible().then(setBible).catch(() => {});
  }, []);

  const [sel, setSel] = useState(0);
  const [tab, setTab] = useState<Tab>("moment");
  const [live, setLive] = useState<Pos | null>(null);
  const [offPlan, setOffPlan] = useState(false);
  const [mode, setMode] = useState<Mode>("moments");
  const [reading, setReading] = useState<Reading | null>(null);
  const [readLayout, setReadLayout] = useState<"full" | "lower">("full");
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");

  const moments = lib?.moments ?? [];

  // ---------- Afficher ----------
  const showPos = useCallback(
    (p: Pos, m: Mode) => {
      const item = moments[p.m]?.items[p.i];
      setLive(p);
      setSel(p.m);
      setTab("moment");
      setReading(null);
      setOffPlan(false);
      setMode(m);
      studio.show(item ? item.content : { kind: "none" });
    },
    [moments, studio.show], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const showOther = useCallback(
    (c: Content) => {
      setOffPlan(true);
      setReading(null);
      if (mode === "reading") setMode("items");
      studio.show(c);
    },
    [mode, studio.show], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const read = useCallback(
    (r: Reading, layout = readLayout) => {
      if (!bible) return;
      setReading(r);
      setMode("reading");
      setOffPlan(true);
      studio.show(verseContent(bible, r, layout));
    },
    [bible, readLayout, studio.show], // eslint-disable-line react-hooks/exhaustive-deps
  );

  // Au premier affichage : le premier moment.
  const started = useRef(false);
  useEffect(() => {
    if (!lib || started.current) return;
    started.current = true;
    if (lib.moments.length) showPos({ m: 0, i: 0 }, "moments");
  }, [lib, showPos]);

  // ---------- Où mènent Suivant / Précédent ----------
  type Target = { kind: "pos"; pos: Pos } | { kind: "verse"; r: Reading } | null;
  const step = (dir: 1 | -1): Target => {
    if (mode === "reading" && reading && bible) {
      const verses = bible.books[reading.book].chapters[reading.chapter - 1];
      const v = reading.verse + dir;
      return v >= 1 && v <= verses.length ? { kind: "verse", r: { ...reading, verse: v } } : null;
    }
    const base = live ?? { m: sel, i: -1 };
    if (mode === "items") {
      const i = base.i + dir;
      if (i >= 0 && i < (moments[base.m]?.items.length ?? 0)) return { kind: "pos", pos: { m: base.m, i } };
      const m = base.m + dir;
      if (m < 0 || m >= moments.length) return null;
      return { kind: "pos", pos: { m, i: dir > 0 ? 0 : Math.max(0, moments[m].items.length - 1) } };
    }
    const m = base.m + dir;
    return m >= 0 && m < moments.length ? { kind: "pos", pos: { m, i: 0 } } : null;
  };
  const go = (dir: 1 | -1) => {
    const target = step(dir);
    if (!target) {
      if (mode === "reading" && dir > 0) setMode("items"); // fin du chapitre : on reprend le déroulé
      return;
    }
    if (target.kind === "verse") read(target.r);
    else showPos(target.pos, mode === "reading" ? "items" : mode);
  };
  const cameraOnly = () => showOther({ kind: "none" });

  // Clavier : espace, → et ↓ = suivant ; ← et ↑ = précédent ; Échap = caméra (sauf pendant une saisie).
  const keys = useRef({ go, cameraOnly, active });
  keys.current = { go, cameraOnly, active };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!keys.current.active) return;
      if ((e.target as HTMLElement).closest("input, textarea, select, [contenteditable]")) return;
      if ([" ", "ArrowRight", "ArrowDown"].includes(e.key)) {
        e.preventDefault();
        keys.current.go(1);
      } else if (["ArrowLeft", "ArrowUp"].includes(e.key)) {
        e.preventDefault();
        keys.current.go(-1);
      } else if (e.key === "Escape") {
        e.preventDefault();
        keys.current.cameraOnly();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // ---------- Ce qui est à l'écran, ce qui vient ----------
  const cur = studio.current;
  const nextTarget = step(1);
  const upcoming: { content: Content; label: string } | null = !nextTarget
    ? null
    : nextTarget.kind === "verse"
      ? { content: verseContent(bible!, nextTarget.r, readLayout), label: refLabel(bible!, nextTarget.r) }
      : {
          content: moments[nextTarget.pos.m]?.items[nextTarget.pos.i]?.content ?? { kind: "none" },
          label: `${moments[nextTarget.pos.m]?.name} · ${moments[nextTarget.pos.m]?.items[nextTarget.pos.i]?.label ?? t("kinds.camera")}`,
        };
  const curLabel =
    mode === "reading" && reading && bible
      ? refLabel(bible, reading)
      : offPlan || !live
        ? t("regie.offPlan")
        : `${moments[live.m]?.name} · ${moments[live.m]?.items[live.i]?.label ?? t("kinds.camera")}`;
  const nextWord = mode === "reading" ? t("regie.nextVerse") : mode === "items" ? t("regie.nextItem") : t("regie.nextMoment");

  const canLayout = cur.kind === "verse" || cur.kind === "text";
  const setLayout = (layout: "lower" | "full") => {
    if (mode === "reading" && reading) {
      setReadLayout(layout);
      read(reading, layout);
    } else if (cur.kind === "verse" || cur.kind === "text") showOther({ ...cur, layout });
  };

  const preview = usePolledImage(studio.link.kind === "on" ? studio.outputShot : null, 500);
  const mainFetcher = useCallback(() => (studio.mainCamera ? studio.cameraShot(studio.mainCamera) : Promise.reject()), [studio.mainCamera]); // eslint-disable-line react-hooks/exhaustive-deps
  const camera = usePolledImage(studio.mainCamera ? mainFetcher : null, 2000);

  // Le téléphone peut se connecter pendant le culte : on surveille.
  useEffect(() => {
    const id = window.setInterval(() => studio.refreshServer().catch(() => {}), 3000);
    studio.refreshServer().catch(() => {});
    return () => window.clearInterval(id);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!lib) return <div className="startup" />;
  const liveMoment = !offPlan && live ? live.m : -1;

  const addMoment = () => {
    const name = newName.trim() || t("regie.newMomentDefault");
    // Ajouté avant le dernier moment (souvent la bénédiction).
    const at = Math.max(0, lib.moments.length - 1);
    update((l) => ({ ...l, moments: [...l.moments.slice(0, at), { id: uid(), name, items: [] }, ...l.moments.slice(at)] }));
    setAdding(false);
    setNewName("");
    setSel(at);
    setTab("moment");
    if (live && live.m >= at) setLive({ ...live, m: live.m + 1 });
  };

  const deleteMoment = () => {
    const at = sel;
    update((l) => ({ ...l, moments: l.moments.filter((_, i) => i !== at) }));
    setSel(Math.max(0, at - 1));
    if (live) setLive(live.m === at ? null : live.m > at ? { ...live, m: live.m - 1 } : live);
  };

  return (
    <div className="regie">
      <header className="topbar">
        <RegioLockup />
        <span className="topbar-date">{t("common.serviceOf", { date: longDate() })}</span>
        <span className="spacer" />
        {studio.link.kind !== "on" && <span className="pill pill-warn">{t("regie.engineLost")}</span>}
        <RoomButton studio={studio} />
      </header>

      <div className="regie-body">
        <nav className="plan" aria-label={t("regie.plan")}>
          <div className="plan-head" style={{ display: "block" }}>
            <h2>{t("regie.plan")}</h2>
            <p className="note">{t("regie.planHelp")}</p>
          </div>
          {lib.moments.map((m, i) => (
            <button
              key={m.id}
              type="button"
              className={`moment ${i === sel ? "is-selected" : ""} ${i === liveMoment ? "is-live" : ""}`}
              aria-current={i === liveMoment ? "step" : undefined}
              onClick={() => showPos({ m: i, i: 0 }, "moments")}
            >
              <span className="moment-num">{i + 1}</span>
              <span className="plan-text">
                <span className="plan-label">{m.name}</span>
                <span className="plan-kind">{t("regie.contentCount", { n: m.items.length })}</span>
              </span>
              {i === liveMoment && <span className="plan-badge">{t("regie.onScreen")}</span>}
            </button>
          ))}
          {adding ? (
            <form
              className="add-moment"
              onSubmit={(e) => {
                e.preventDefault();
                addMoment();
              }}
            >
              <label htmlFor="new-moment" className="note">
                {t("regie.newMomentLabel")}
              </label>
              <input id="new-moment" className="input" autoFocus value={newName} placeholder={t("regie.newMomentPlaceholder")} onChange={(e) => setNewName(e.target.value)} />
              <div className="row-2">
                <button type="button" className="btn btn-sm" onClick={() => setAdding(false)}>
                  {t("regie.cancel")}
                </button>
                <button type="submit" className="btn btn-sm">
                  {t("regie.add")}
                </button>
              </div>
            </form>
          ) : (
            <button type="button" className="add-moment-btn" onClick={() => setAdding(true)}>
              {t("regie.addMoment")}
            </button>
          )}
        </nav>

        <main className="stage">
          <div className="screens">
            <div className="screen-col screen-col-live">
              <div className="screen-cap">
                <strong>{t("regie.output")}</strong>
                <span>{curLabel}</span>
              </div>
              <div className="screen screen-live">{preview ? <img src={preview} alt={t("regie.previewAlt")} /> : <div className="screen-wait">…</div>}</div>
            </div>
            <div className="screen-col">
              <div className="screen-cap">
                <strong className="muted">{t("regie.upNext")}</strong>
                <span>{upcoming ? upcoming.label : t("regie.end")}</span>
              </div>
              <div className="screen screen-next">{upcoming ? <MiniScreen content={upcoming.content} camera={camera} /> : <MiniScreen content={{ kind: "none" }} camera={camera} />}</div>
              {canLayout && (
                <div className="segmented" style={{ display: "flex" }} role="radiogroup" aria-label={t("regie.layout")}>
                  <button type="button" role="radio" style={{ flex: 1 }} aria-checked={cur.layout === "lower"} aria-pressed={cur.layout === "lower"} onClick={() => setLayout("lower")}>
                    {t("regie.onCamera")}
                  </button>
                  <button type="button" role="radio" style={{ flex: 1 }} aria-checked={cur.layout === "full"} aria-pressed={cur.layout === "full"} onClick={() => setLayout("full")}>
                    {t("regie.fullScreen")}
                  </button>
                </div>
              )}
            </div>
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

          {mode === "reading" && reading && bible && (
            <div className="reading-bar">
              <BookOpen size={20} strokeWidth={1.75} />
              <span>
                <strong>
                  {t("regie.reading", {
                    ref: `${refLabel(bible, reading)} / ${bible.books[reading.book].chapters[reading.chapter - 1].length}`,
                  })}
                </strong>{" "}
                <span className="muted">— {t("regie.readingHelp")}</span>
              </span>
              <span className="spacer" />
              <button type="button" className="btn btn-sm" onClick={() => setMode("items")}>
                {t("regie.stopReading")}
              </button>
            </div>
          )}

          <div className="transport">
            <button type="button" className="btn big-action" onClick={() => go(-1)}>
              <span className="row-icon">
                <ArrowLeft size={22} strokeWidth={2} />
                <span>
                  {t("regie.previous")}
                  <small>{t("regie.previousKeys")}</small>
                </span>
              </span>
            </button>
            <button type="button" className="btn big-action grow-1" onClick={cameraOnly}>
              {t("regie.backToCamera")}
              <small>{t("regie.escapeKey")}</small>
            </button>
            <button type="button" className="btn btn-primary big-action next-btn grow-2" onClick={() => go(1)} disabled={!nextTarget}>
              <span>
                {nextWord}
                <small>{t("regie.nextKeys")}</small>
              </span>
              <ArrowRight size={26} strokeWidth={2.2} />
            </button>
          </div>

          <CameraRow studio={studio} onAdd={onSources} />
        </main>

        <RightPanel
          lib={lib}
          update={update}
          sel={sel}
          tab={tab}
          setTab={setTab}
          liveIndex={!offPlan && live && live.m === sel ? live.i : null}
          camera={camera}
          bible={bible}
          reading={mode === "reading" ? reading : null}
          storeImage={(d) => storeImage(d, studio.server?.localBase ?? "")}
          onShowItem={(i) => showPos({ m: sel, i }, "items")}
          onShowOther={showOther}
          onRead={(r) => read(r)}
          onDeleteMoment={deleteMoment}
        />
      </div>
    </div>
  );
}
