// Écran 3 — La régie pendant le culte (maquette v5), trois zones de gauche à droite :
// CHOISIR (déroulé des moments) · VOIR (caméras en grand, toujours visibles, puis les contenus du moment en grand ;
// Bible / Images / Texte s'ouvrent au centre) · DIFFUSER (à l'écran + commandes, toujours au même endroit).
//
// Deux navigations bien séparées (retours de l'utilisateur du 13 novembre) :
// - CHOISIR un moment (clic dans le déroulé, ↑ / ↓) : ses contenus s'ouvrent à droite, RIEN ne change à l'écran ;
// - AFFICHER (clic sur un contenu, Suivant / espace / →, Précédent / ←) : contenu suivant du moment choisi
//   (son 1er contenu si on vient d'en choisir un autre), puis le moment d'après ;
// - pendant une lecture biblique, Suivant / Précédent passent de verset en verset ;
// - une présentation (PowerPoint importé) est UN contenu : Suivant / Précédent passent de diapo en diapo.

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, BookOpen, ChevronDown, ChevronUp, RefreshCw, Video } from "lucide-react";
import { RegioLockup } from "../components/Logo";
import { MiniScreen } from "../components/MiniScreen";
import { longDate, t } from "../i18n";
import type { Content, Layout } from "../shared/content";

const LAYOUT_KEY = "regio.layout";
import { loadBible, refLabel, type Bible } from "../bible/bible";
import { uid, useLibrary } from "../app/library";
import { usePolledImage, type Camera, type Studio } from "../app/useStudio";
import { storeImage } from "../shared/storage";
import { CameraStrip } from "./CameraStrip";
import { TemplateChooser } from "./TemplateChooser";
import { useLive } from "../app/useLive";
import { HealthPanel, LiveBanners, LiveConfirmDialog, LiveEndedDialog, LiveHeader, LiveSetupDialog, LiveStopDialog, SoundMeter } from "./LiveControls";
import { RoomButton } from "./RoomDialog";
import { ContentArea, verseContent, type Reading, type View } from "./ContentArea";

/** Le contenu couvre-t-il tout l'écran (la caméra n'est plus visible dessous) ? */
const covers = (c: Content) =>
  c.kind === "image" || c.kind === "slides" || c.kind === "standby" || ((c.kind === "verse" || c.kind === "text") && c.layout === "full");

type Mode = "items" | "reading";
interface Pos {
  m: number;
  i: number;
  /** Diapo affichée, si le contenu est une présentation. */
  s?: number;
}

export function RegieScreen({ studio, active = true, onSources }: { studio: Studio; active?: boolean; onSources: () => void }) {
  // ---------- Le direct ----------
  const stream = useLive(studio);
  const [liveDlg, setLiveDlg] = useState<null | "setup" | "confirm" | "stop">(null);
  const [healthOpen, setHealthOpen] = useState(false);
  const [fbStep, setFbStep] = useState(false);
  const keysOn = active && !liveDlg && !stream.ended;

  const { lib, update, fresh, start } = useLibrary();
  const [bible, setBible] = useState<Bible | null>(null);
  useEffect(() => {
    loadBible().then(setBible).catch(() => {});
  }, []);

  const [sel, setSel] = useState(0);
  const [view, setView] = useState<View>("moment");
  const [live, setLive] = useState<Pos | null>(null);
  const [offPlan, setOffPlan] = useState(false);
  const [mode, setMode] = useState<Mode>("items");
  const [reading, setReading] = useState<Reading | null>(null);
  // Mise en page des versets et textes, choisie À L'AVANCE (même quand une caméra est à l'écran) :
  // tout verset ou texte affiché ensuite (déroulé, Bible, Texte) apparaît ainsi. Retenue d'un culte à l'autre.
  const [layoutMode, setLayoutMode] = useState<Layout>(() => (localStorage.getItem(LAYOUT_KEY) === "lower" ? "lower" : "full"));
  useEffect(() => localStorage.setItem(LAYOUT_KEY, layoutMode), [layoutMode]);
  const withLayout = (c: Content): Content => (c.kind === "verse" || c.kind === "text" ? { ...c, layout: layoutMode } : c);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");

  const moments = lib?.moments ?? [];
  /** Contenu à cette position (pour une présentation : la bonne diapo). */
  const contentAt = (p: Pos): Content | null => {
    const c = moments[p.m]?.items[p.i]?.content;
    return !c ? null : c.kind === "slides" ? { ...c, index: Math.min(p.s ?? 0, c.slides.length - 1) } : withLayout(c);
  };
  const slideCount = (p: Pos | null) => {
    const c = p ? moments[p.m]?.items[p.i]?.content : null;
    return c?.kind === "slides" ? c.slides.length : 0;
  };
  /** Libellé d'une position : « Louange · Chants · 3/24 ». */
  const posLabel = (p: Pos) => {
    const n = slideCount(p);
    return `${moments[p.m]?.name} · ${moments[p.m]?.items[p.i]?.label ?? t("kinds.camera")}${n ? ` · ${(p.s ?? 0) + 1}/${n}` : ""}`;
  };

  // ---------- Afficher ----------
  const showPos = useCallback(
    (p: Pos, m: Mode) => {
      const content = contentAt(p);
      setLive(p);
      setSel(p.m);
      setView("moment");
      setReading(null);
      setOffPlan(false);
      setMode(m);
      studio.show(content ?? { kind: "none" });
    },
    [moments, studio.show, layoutMode], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const showOther = useCallback(
    (c: Content) => {
      setOffPlan(true);
      setReading(null);
      if (mode === "reading") setMode("items");
      studio.show(withLayout(c));
    },
    [mode, studio.show, layoutMode], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const read = useCallback(
    (r: Reading, layout = layoutMode) => {
      if (!bible) return;
      setReading(r);
      setMode("reading");
      setOffPlan(true);
      studio.show(verseContent(bible, r, layout));
    },
    [bible, layoutMode, studio.show], // eslint-disable-line react-hooks/exhaustive-deps
  );

  // Au premier affichage : le premier moment.
  const started = useRef(false);
  useEffect(() => {
    if (!lib || started.current) return;
    started.current = true;
    if (lib.moments.length) showPos({ m: 0, i: 0 }, "items");
  }, [lib, showPos]);

  // ---------- Où mènent Suivant / Précédent ----------
  type Target = { kind: "pos"; pos: Pos } | { kind: "verse"; r: Reading } | null;
  const step = (dir: 1 | -1): Target => {
    if (mode === "reading" && reading && bible) {
      const verses = bible.books[reading.book].chapters[reading.chapter - 1];
      const v = reading.verse + dir;
      return v >= 1 && v <= verses.length ? { kind: "verse", r: { ...reading, verse: v } } : null;
    }
    const len = (m: number) => moments[m]?.items.length ?? 0;
    // Moment choisi différent de celui à l'écran : Suivant affiche son 1er contenu.
    if (dir > 0 && (!live || live.m !== sel)) return len(sel) > 0 ? { kind: "pos", pos: { m: sel, i: 0 } } : null;
    if (!live) return null;
    // Présentation à l'écran : diapo suivante / précédente.
    const n = slideCount(live);
    const s = (live.s ?? 0) + dir;
    if (n && s >= 0 && s < n) return { kind: "pos", pos: { ...live, s } };
    // En reculant dans une présentation, on arrive sur sa dernière diapo.
    const at = (m: number, i: number): Pos => ({ m, i, s: dir < 0 ? Math.max(0, slideCount({ m, i }) - 1) : 0 });
    // ← → restent DANS le moment (exigence de l'utilisateur) : on ne passe jamais au moment voisin par là.
    const i = live.i + dir;
    if (i >= 0 && i < len(live.m)) return { kind: "pos", pos: at(live.m, i) };
    return null;
  };
  /** Prochain moment non vide après le moment choisi (pour « Suivant » en fin de moment). */
  const nextFilled = (() => {
    for (let m = sel + 1; m < moments.length; m++) if ((moments[m]?.items.length ?? 0) > 0) return m;
    return null;
  })();
  /**
   * Suivant / Précédent. `toNextMoment` (bouton Suivant, barre d'espace) : en fin de moment, CHOISIT le moment
   * suivant (comme ↓, sans rien afficher) ; l'appui d'après l'affiche. Les flèches ← → ne quittent jamais le moment.
   */
  const go = (dir: 1 | -1, toNextMoment = false) => {
    const target = step(dir);
    if (!target) {
      if (mode === "reading" && dir > 0) setMode("items"); // fin du chapitre : on reprend le programme
      else if (dir > 0 && toNextMoment && nextFilled !== null) {
        setSel(nextFilled);
        setView("moment");
      }
      return;
    }
    if (target.kind === "verse") read(target.r);
    else showPos(target.pos, "items");
  };
  /** Choisir un moment sans rien afficher (↑ / ↓ ou clic dans le déroulé). */
  const moveSel = (dir: 1 | -1) => {
    setSel((v) => Math.min(Math.max(0, v + dir), Math.max(0, moments.length - 1)));
    setView("moment");
  };
  const cameraOnly = () => showOther({ kind: "none" });

  // ---------- Caméras ----------
  // Seulement les caméras du PC qu'on a choisi d'utiliser (+ les téléphones connectés).
  const cams: Camera[] = [...studio.activeCameras, ...studio.phoneCams];
  const covered = covers(studio.current);
  // La caméra dont on gardait le son a disparu (téléphone déconnecté) : le son suit de nouveau l'image.
  const camKeys = cams.map((c) => c.source).join("|");
  useEffect(() => {
    if (studio.keptAudio && !cams.some((c) => c.source === studio.keptAudio)) studio.keepAudio(null).catch(() => {});
  }, [camKeys, studio.keptAudio]); // eslint-disable-line react-hooks/exhaustive-deps
  /** Un clic (ou touche 1 à 6) met la caméra à l'écran : un bandeau reste par-dessus, un plein écran s'efface. */
  const pickCamera = (cam: Camera) => {
    studio.chooseMain(cam.source).catch(() => {});
    if (covers(studio.current)) cameraOnly();
  };

  // Clavier : espace / → = suivant ; ← = précédent ; ↑ / ↓ = choisir le moment ; Échap = caméra.
  const keys = useRef({ go, moveSel, cameraOnly, active, cams, pickCamera });
  keys.current = { go, moveSel, cameraOnly, active: keysOn, cams, pickCamera };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!keys.current.active) return;
      if ((e.target as HTMLElement).closest("input, textarea, select, [contenteditable], [data-own-keys]")) return;
      if (e.key === " " || e.key === "ArrowRight") {
        e.preventDefault();
        keys.current.go(1, e.key === " ");
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        keys.current.go(-1);
      } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        keys.current.moveSel(e.key === "ArrowDown" ? 1 : -1);
      } else if (/^[1-6]$/.test(e.key) && !e.ctrlKey && !e.altKey && !e.metaKey) {
        const cam = keys.current.cams[Number(e.key) - 1];
        if (cam) {
          e.preventDefault();
          keys.current.pickCamera(cam);
        }
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
  // Fin du moment : « Suivant » choisira le moment suivant ; on montre déjà son 1er contenu.
  const nextMomentStep = !nextTarget && mode !== "reading" && nextFilled !== null;
  const upcoming: { content: Content; label: string } | null = !nextTarget
    ? nextMomentStep
      ? { content: contentAt({ m: nextFilled!, i: 0, s: 0 }) ?? { kind: "none" }, label: posLabel({ m: nextFilled!, i: 0, s: 0 }) }
      : null
    : nextTarget.kind === "verse"
      ? { content: verseContent(bible!, nextTarget.r, layoutMode), label: refLabel(bible!, nextTarget.r) }
      : { content: contentAt(nextTarget.pos) ?? { kind: "none" }, label: posLabel(nextTarget.pos) };
  const curLabel =
    mode === "reading" && reading && bible
      ? refLabel(bible, reading)
      : offPlan || !live
        ? t("regie.offPlan")
        : posLabel(live);
  const nextWord =
    nextMomentStep
      ? t("regie.nextMomentGo")
      : mode === "reading"
      ? t("regie.nextVerse")
      : !live || live.m !== sel
        ? t("regie.showMoment", { name: moments[sel]?.name ?? "" })
        : !offPlan && (live.s ?? 0) < slideCount(live) - 1
          ? t(moments[live.m]?.items[live.i]?.content.kind === "slides" && (moments[live.m].items[live.i].content as { source?: string }).source === "pdf" ? "regie.nextPage" : "regie.nextSlide")
          : t("regie.nextItem");

  /** Choisir la mise en page : pour la suite, et tout de suite si un verset ou un texte est à l'écran
   *  (sans quitter le déroulé ni la lecture suivie). */
  const setLayout = (layout: Layout) => {
    setLayoutMode(layout);
    if (cur.kind === "verse" || cur.kind === "text") studio.show({ ...cur, layout });
  };

  const preview = usePolledImage(studio.link.kind === "on" ? studio.outputShot : null, 500);
  const mainFetcher = useCallback(() => (studio.mainCamera ? studio.cameraShot(studio.mainCamera) : Promise.reject()), [studio.mainCamera]); // eslint-disable-line react-hooks/exhaustive-deps
  const camera = usePolledImage(studio.mainCamera ? mainFetcher : null, 2000);

  // Le téléphone peut se connecter pendant le culte : on surveille.
  useEffect(() => {
    const id = window.setInterval(() => studio.refreshServer().catch(() => {}), 3000);
    studio.refreshServer().catch(() => {});
    studio.preparePhones().catch(() => {});
    return () => window.clearInterval(id);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!lib) return fresh ? <TemplateChooser onChoose={start} /> : <div className="startup" />;
  const liveMoment = !offPlan && live ? live.m : -1;

  const addMoment = () => {
    const name = newName.trim() || t("regie.newMomentDefault");
    // Ajouté avant le dernier moment (souvent la bénédiction).
    const at = Math.max(0, lib.moments.length - 1);
    update((l) => ({ ...l, moments: [...l.moments.slice(0, at), { id: uid(), name, items: [] }, ...l.moments.slice(at)] }));
    setAdding(false);
    setNewName("");
    setSel(at);
    setView("moment");
    if (live && live.m >= at) setLive({ ...live, m: live.m + 1 });
  };

  /** Déplacer un contenu dans le moment choisi ; le contenu à l'écran reste repéré. */
  const moveItem = (from: number, to: number) => {
    const m = sel;
    if (from === to || to < 0 || to >= (lib.moments[m]?.items.length ?? 0)) return;
    update((l) => ({
      ...l,
      moments: l.moments.map((x, i) => {
        if (i !== m) return x;
        const items = [...x.items];
        const [it] = items.splice(from, 1);
        items.splice(to, 0, it);
        return { ...x, items };
      }),
    }));
    if (live && live.m === m) {
      const i = live.i === from ? to : live.i > from && live.i <= to ? live.i - 1 : live.i < from && live.i >= to ? live.i + 1 : live.i;
      setLive({ ...live, i });
    }
  };

  /** Contenu modifié (texte, écran d'attente) : enregistré, et mis à jour tout de suite s'il est à l'écran. */
  const editItem = (idx: number, content: Content, label: string) => {
    const m = sel;
    update((l) => ({ ...l, moments: l.moments.map((x, i) => (i === m ? { ...x, items: x.items.map((it, j) => (j === idx ? { ...it, content, label } : it)) } : x)) }));
    if (!offPlan && live && live.m === m && live.i === idx) studio.show(withLayout(content));
  };

  const removeItem = (idx: number) => {
    const m = sel;
    update((l) => ({ ...l, moments: l.moments.map((x, i) => (i === m ? { ...x, items: x.items.filter((_, j) => j !== idx) } : x)) }));
    if (live && live.m === m && live.i >= idx) setLive(live.i === idx ? null : { ...live, i: live.i - 1 });
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
        <LiveHeader
          live={stream}
          onSetup={() => setLiveDlg("setup")}
          onConfirm={() => setLiveDlg("confirm")}
          onStop={() => setLiveDlg("stop")}
          healthOpen={healthOpen}
          toggleHealth={() => setHealthOpen((o) => !o)}
        />
      </header>

      <div className="regie-body">
        {/* ============ 1. CHOISIR : le déroulé ============ */}
        <nav className="plan" aria-label={t("regie.plan")}>
          <div className="plan-head">
            <div className="plan-title">
              <h2>{t("regie.plan")}</h2>
              <button type="button" className="icon-btn" aria-label={t("regie.prevMoment")} title={t("regie.prevMoment")} onClick={() => moveSel(-1)}>
                <ChevronUp size={16} strokeWidth={2} />
              </button>
              <button type="button" className="icon-btn" aria-label={t("regie.nextMomentSel")} title={t("regie.nextMomentSel")} onClick={() => moveSel(1)}>
                <ChevronDown size={16} strokeWidth={2} />
              </button>
            </div>
            <p className="note">{t("regie.planHelp")}</p>
          </div>
          {lib.moments.map((m, i) => (
            <button
              key={m.id}
              type="button"
              className={`moment ${i === sel ? "is-selected" : ""} ${i === liveMoment ? "is-live" : ""}`}
              aria-current={i === liveMoment ? "step" : undefined}
              onClick={() => {
                setSel(i);
                setView("moment");
              }}
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

        {/* ============ 2. VOIR : caméras en grand (fixes), puis les contenus ============ */}
        <div className="center">
          <CameraStrip studio={studio} cams={cams} covered={covered} onPick={pickCamera} onAdd={onSources} />
          <ContentArea
            view={view}
            setView={setView}
            lib={lib}
            update={update}
            sel={sel}
            liveIndex={!offPlan && live && live.m === sel ? live.i : null}
            liveSlide={live?.s ?? 0}
            layout={layoutMode}
            localBase={studio.server?.localBase ?? ""}
            camera={camera}
            bible={bible}
            reading={mode === "reading" ? reading : null}
            storeImage={(d) => storeImage(d, studio.server?.localBase ?? "")}
            onShowItem={(i, s) => showPos({ m: sel, i, s }, "items")}
            onShowOther={showOther}
            onRead={(r) => read(r)}
            onDeleteMoment={deleteMoment}
            onMoveItem={moveItem}
            onRemoveItem={removeItem}
            onEditItem={editItem}
          />
        </div>

        {/* ============ 3. DIFFUSER : à l'écran + commandes, toujours au même endroit ============ */}
        <aside className="output" aria-label={t("regie.output")}>
          <LiveBanners live={stream} fbStep={fbStep} onFbDone={() => setFbStep(false)} />
          <div className="output-live">
            <div className="screen-cap">
              <strong>{t("regie.output")}</strong>
              <span>{curLabel}</span>
            </div>
            <div className="screen screen-live">{preview ? <img src={preview} alt={t("regie.previewAlt")} /> : <div className="screen-wait">…</div>}</div>
          </div>

          <SoundMeter studio={studio} />

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
              <BookOpen size={18} strokeWidth={1.75} />
              <span className="reading-text">
                <strong>
                  {t("regie.reading", {
                    ref: `${refLabel(bible, reading)} / ${bible.books[reading.book].chapters[reading.chapter - 1].length}`,
                  })}
                </strong>
                <span className="muted">{t("regie.readingHelp")}</span>
              </span>
              <button type="button" className="btn btn-sm" onClick={() => setMode("items")}>
                {t("regie.stopReading")}
              </button>
            </div>
          )}

          {/* Les commandes : les éléments les plus visibles de l'écran. */}
          <div className="controls">
            <button type="button" className="btn btn-primary next-btn" onClick={() => go(1, true)} disabled={!nextTarget && !nextMomentStep}>
              <span>
                {nextWord}
                <small>{nextMomentStep ? t("regie.nextMomentKeys") : t("regie.nextKeys")}</small>
              </span>
              <ArrowRight size={28} strokeWidth={2.2} />
            </button>
            <div className="controls-row">
              <button type="button" className="btn ctl-btn" onClick={() => go(-1)}>
                <ArrowLeft size={22} strokeWidth={2} />
                <span>
                  {t("regie.previous")}
                  <small>{t("regie.previousKeys")}</small>
                </span>
              </button>
              <button type="button" className="btn ctl-btn" onClick={cameraOnly}>
                <Video size={22} strokeWidth={1.9} />
                <span>
                  {t("regie.cameraOnly")}
                  <small>{t("regie.escapeKey")}</small>
                </span>
              </button>
            </div>
            <p className="layout-cap">{t("regie.layoutCaption")}</p>
            <div className="segmented layout-toggle" role="radiogroup" aria-label={t("regie.layoutCaption")}>
              <button type="button" role="radio" aria-checked={layoutMode === "lower"} aria-pressed={layoutMode === "lower"} onClick={() => setLayout("lower")}>
                {t("regie.onCamera")}
              </button>
              <button type="button" role="radio" aria-checked={layoutMode === "full"} aria-pressed={layoutMode === "full"} onClick={() => setLayout("full")}>
                {t("regie.fullScreen")}
              </button>
            </div>
          </div>

          <div className="output-next">
            <div className="screen-cap">
              <strong className="muted">{t("regie.upNext")}</strong>
            </div>
            <div className="next-row">
              <div className="screen screen-next">
                <MiniScreen content={upcoming ? upcoming.content : { kind: "none" }} camera={camera} />
              </div>
              <span className="next-label">{upcoming ? upcoming.label : t("regie.end")}</span>
            </div>
          </div>
        </aside>
      </div>

      {healthOpen && stream.phase === "live" && <HealthPanel live={stream} onClose={() => setHealthOpen(false)} />}
      {liveDlg === "setup" && (
        <LiveSetupDialog
          initial={stream.settings}
          onClose={() => setLiveDlg(null)}
          onDone={(s) => {
            setLiveDlg(null);
            stream.configure(s);
          }}
        />
      )}
      {liveDlg === "confirm" && stream.settings && (
        <LiveConfirmDialog
          live={stream}
          onClose={() => setLiveDlg(null)}
          onGo={() => {
            setLiveDlg(null);
            setFbStep(true);
            stream.start();
          }}
        />
      )}
      {liveDlg === "stop" && (
        <LiveStopDialog
          live={stream}
          onClose={() => setLiveDlg(null)}
          onStop={() => {
            setLiveDlg(null);
            setHealthOpen(false);
            setFbStep(false);
            stream.stop();
          }}
        />
      )}
      {stream.ended && <LiveEndedDialog live={stream} onClose={stream.clearEnded} />}
    </div>
  );
}
