// Zone centrale de la régie (maquette v5) : les contenus du moment choisi, EN GRAND ;
// « Ajouter : Verset · PowerPoint · Image · Texte » ouvre la Bible, les images ou le texte ICI, au centre
// (plus d'onglets sur le côté), avec « Retour à « moment » ».

import { useEffect, useMemo, useRef, useState, type DragEvent, type KeyboardEvent } from "react";
import { BookOpen, Check, ChevronLeft, ChevronRight, GripVertical, ImagePlus, Pencil, Plus, Presentation, Search, Trash2, Type, X } from "lucide-react";
import { t } from "../i18n";
import type { Content } from "../shared/content";
import { MiniScreen } from "../components/MiniScreen";
import { OT_COUNT, parseReference, refLabel, searchWords, type Bible, type Passage } from "../bible/bible";
import { kindLabel, uid, type Library, type MediaEntry, type Moment, type PlanItem } from "../app/library";
import { loadImageAsDataUrl } from "../app/images";
import { PRESENTATION_ACCEPT, importErrorKind, importPresentation } from "../shared/storage";
import { inTauri } from "../shared/server";

export type View = "moment" | "bible" | "media" | "text";

export interface Reading {
  book: number;
  chapter: number;
  verse: number;
}

export const verseContent = (bible: Bible, p: Reading, layout: "lower" | "full"): Content => ({
  kind: "verse",
  layout,
  reference: refLabel(bible, p),
  text: bible.books[p.book].chapters[p.chapter - 1][p.verse - 1],
  version: "LSG 1910",
});

type Importing = { name: string; done: number; total: number } | null;

// ---------------------------------------------------------------- Le moment, en grand

function MomentView(props: {
  moment: Moment;
  liveIndex: number | null;
  liveSlide: number;
  camera: string | null;
  big: boolean;
  setBig: (b: boolean) => void;
  onShow: (i: number, slide?: number) => void;
  onOpen: (v: View) => void;
  importing: Importing;
  importError: string | null;
  onImport: (file: File) => void;
  onRename: (name: string) => void;
  onDelete: () => void;
  onRemoveItem: (i: number) => void;
  onMoveItem: (from: number, to: number) => void;
}) {
  const { moment } = props;
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(moment.name);
  const [confirm, setConfirm] = useState(false);
  useEffect(() => {
    setName(moment.name);
    setRenaming(false);
    setConfirm(false);
  }, [moment.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Glisser-déposer : contenu saisi et place où il irait (indice d'insertion entre 0 et n).
  const [drag, setDrag] = useState<number | null>(null);
  const [dropAt, setDropAt] = useState<number | null>(null);
  const endDrag = () => {
    setDrag(null);
    setDropAt(null);
  };
  // Seule la poignée se saisit (un clic un peu tremblé sur une carte doit l'AFFICHER, pas la déplacer) ;
  // l'image qui suit la souris est la carte entière.
  const startDrag = (i: number) => (e: DragEvent<HTMLElement>) => {
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", moment.items[i].id);
    const card = e.currentTarget.closest(".item-card");
    if (card) e.dataTransfer.setDragImage(card, 24, 24);
    setDrag(i);
  };
  const dragProps = (i: number, vertical: boolean) => ({
    onDragOver: (e: DragEvent<HTMLElement>) => {
      if (drag === null) return;
      e.preventDefault();
      const r = e.currentTarget.getBoundingClientRect();
      // Carte : avant / après selon la moitié gauche ou droite ; présentation (pleine largeur) : haut ou bas.
      const before = vertical ? e.clientY < r.top + r.height / 2 : e.clientX < r.left + r.width / 2;
      setDropAt(before ? i : i + 1);
    },
    onDrop: (e: DragEvent) => {
      e.preventDefault();
      if (drag !== null && dropAt !== null) props.onMoveItem(drag, dropAt > drag ? dropAt - 1 : dropAt);
      endDrag();
    },
    onDragEnd: endDrag,
  });
  const dropClass = (i: number) =>
    drag === null ? "" : dropAt === i ? "drop-before" : dropAt === i + 1 && i === moment.items.length - 1 ? "drop-after" : "";

  const gripKeys = (i: number) => (e: KeyboardEvent<HTMLButtonElement>) => {
    const dir = e.key === "ArrowUp" || e.key === "ArrowLeft" ? -1 : e.key === "ArrowDown" || e.key === "ArrowRight" ? 1 : 0;
    if (!dir) return;
    e.preventDefault();
    const to = i + dir;
    props.onMoveItem(i, to);
    // Garder le focus sur la poignée du contenu déplacé (on peut appuyer plusieurs fois).
    const grid = e.currentTarget.closest(".content-grid");
    window.setTimeout(() => grid?.querySelectorAll<HTMLButtonElement>(".item-grip")[Math.min(Math.max(0, to), moment.items.length - 1)]?.focus(), 0);
  };
  const grip = (i: number, label: string) => (
    <button type="button" className="item-grip" data-own-keys draggable onDragStart={startDrag(i)} onDragEnd={endDrag} aria-label={t("regie.moveItem", { name: label })} title={t("regie.moveItem", { name: label })} onKeyDown={gripKeys(i)}>
      <GripVertical size={16} strokeWidth={1.75} />
    </button>
  );
  const remove = (i: number, label: string) => (
    <button type="button" className="icon-btn item-remove" aria-label={t("regie.removeItem", { name: label })} title={t("regie.removeItem", { name: label })} onClick={() => props.onRemoveItem(i)}>
      <X size={15} strokeWidth={2} />
    </button>
  );
  // Clic souris : pas de cadre de focus qui resterait affiché pendant la navigation au clavier.
  const click = (fn: () => void) => (e: { detail: number; currentTarget: HTMLElement }) => {
    fn();
    if (e.detail > 0) e.currentTarget.blur();
  };

  return (
    <div className="view">
      <div className="view-head">
        {renaming ? (
          <form
            className="inline-form"
            onSubmit={(e) => {
              e.preventDefault();
              if (name.trim()) props.onRename(name.trim());
              setRenaming(false);
            }}
          >
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus aria-label={t("regie.rename")} />
            <button type="submit" className="btn btn-sm">
              {t("regie.save")}
            </button>
          </form>
        ) : (
          <div className="view-title">
            <h1>{moment.name}</h1>
            <button type="button" className="icon-btn" aria-label={t("regie.rename")} title={t("regie.rename")} onClick={() => setRenaming(true)}>
              <Pencil size={16} strokeWidth={1.75} />
            </button>
            <button type="button" className="icon-btn" aria-label={t("regie.deleteMoment")} title={t("regie.deleteMoment")} onClick={() => setConfirm(true)}>
              <Trash2 size={16} strokeWidth={1.75} />
            </button>
          </div>
        )}
        <p className="view-sub">{t("regie.momentHelp", { n: moment.items.length })}</p>
        <div className="segmented size-toggle" role="radiogroup" aria-label={t("regie.size")}>
          <button type="button" role="radio" aria-checked={!props.big} aria-pressed={!props.big} onClick={() => props.setBig(false)}>
            {t("regie.sizeNormal")}
          </button>
          <button type="button" role="radio" aria-checked={props.big} aria-pressed={props.big} onClick={() => props.setBig(true)}>
            {t("regie.sizeBig")}
          </button>
        </div>
      </div>

      {confirm && (
        <div className="banner banner-error">
          <span style={{ flex: 1 }}>{t("regie.deleteMomentConfirm", { name: moment.name, n: moment.items.length })}</span>
          <button type="button" className="btn btn-sm" onClick={() => setConfirm(false)}>
            {t("regie.cancel")}
          </button>
          <button type="button" className="btn btn-sm" onClick={props.onDelete}>
            {t("regie.confirmDelete")}
          </button>
        </div>
      )}

      {/* Ajouter au moment : remplace les onglets de droite. */}
      <div className="add-bar">
        <span className="note">{t("regie.addLabel")}</span>
        <button type="button" className="add-btn" onClick={() => props.onOpen("bible")}>
          <BookOpen size={17} strokeWidth={1.75} />
          {t("regie.addVerse")}
        </button>
        {inTauri && (
          <label className="add-btn" aria-disabled={!!props.importing}>
            <Presentation size={17} strokeWidth={1.75} />
            {t("regie.addPpt")}
            <input
              type="file"
              accept={PRESENTATION_ACCEPT}
              disabled={!!props.importing}
              aria-label={t("panels.importPpt", { name: moment.name })}
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) props.onImport(f);
              }}
            />
          </label>
        )}
        <button type="button" className="add-btn" onClick={() => props.onOpen("media")}>
          <ImagePlus size={17} strokeWidth={1.75} />
          {t("regie.addImage")}
        </button>
        <button type="button" className="add-btn" onClick={() => props.onOpen("text")}>
          <Type size={17} strokeWidth={1.75} />
          {t("regie.addText")}
        </button>
      </div>
      {props.importing && (
        <div className="import-progress" role="status">
          <span>
            {props.importing.total
              ? t("panels.importProgress", { name: props.importing.name, done: props.importing.done, total: props.importing.total })
              : t("panels.importStarting", { name: props.importing.name })}
          </span>
          <span className="bar">
            <span style={{ width: `${props.importing.total ? (100 * props.importing.done) / props.importing.total : 4}%` }} />
          </span>
        </div>
      )}
      {props.importError && <p className="banner banner-error">{props.importError}</p>}

      {moment.items.length === 0 && <p className="empty-note">{t("regie.momentEmpty")}</p>}
      {moment.items.length > 1 && <p className="note">{t("regie.reorderHelp")}</p>}

      <div className="content-grid" style={{ ["--card-min" as string]: props.big ? "360px" : "250px", ["--slide-min" as string]: props.big ? "320px" : "210px" }} onDragLeave={(e) => !e.currentTarget.contains(e.relatedTarget as Node) && setDropAt(null)}>
        {moment.items.map((it, i) => {
          const live = props.liveIndex === i;
          const c = it.content;
          if (c.kind === "slides") {
            return (
              <section key={it.id} className={`item-card is-slides ${live ? "is-live" : ""} ${drag === i ? "is-dragging" : ""} ${dropClass(i)}`} {...dragProps(i, true)}>
                <div className="slides-head">
                  {grip(i, it.label)}
                  <Presentation size={20} strokeWidth={1.75} className="muted-icon" />
                  <button type="button" className="item-main slides-title" onClick={click(() => props.onShow(i, 0))} aria-current={live ? "true" : undefined}>
                    <span className="item-label">{it.label}</span>
                    <span className="item-kind">
                      {kindLabel(c)} · {t("regie.slidesHelp")}
                    </span>
                  </button>
                  {live && <span className="plan-badge">{t("regie.onScreenSlide", { n: props.liveSlide + 1 })}</span>}
                  {remove(i, it.label)}
                </div>
                <div className="slide-grid">
                  {c.slides.map((src, k) => {
                    const on = live && props.liveSlide === k;
                    return (
                      <button
                        key={k}
                        type="button"
                        className={`slide-card ${on ? "is-live" : ""}`}
                        data-slide={k}
                        aria-label={t("panels.slideN", { n: k + 1 })}
                        aria-current={on ? "true" : undefined}
                        onClick={click(() => props.onShow(i, k))}
                      >
                        <span className="slide-img">
                          <img src={src} alt="" loading="lazy" />
                        </span>
                        <span className="slide-foot">
                          {t("panels.slideN", { n: k + 1 })}
                          {on && <span className="plan-badge">{t("regie.onScreen")}</span>}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>
            );
          }
          return (
            <div key={it.id} className={`item-card ${live ? "is-live" : ""} ${drag === i ? "is-dragging" : ""} ${dropClass(i)}`} {...dragProps(i, false)}>
              <button type="button" className="item-main" onClick={click(() => props.onShow(i))} aria-current={live ? "true" : undefined}>
                <span className="item-thumb">
                  <MiniScreen content={c} camera={props.camera} />
                  {live && <span className="plan-badge thumb-badge">{t("regie.onScreen")}</span>}
                </span>
                <span className="item-text">
                  <span className="item-label">{it.label}</span>
                  <span className="item-kind">{kindLabel(c)}</span>
                </span>
              </button>
              {grip(i, it.label)}
              {remove(i, it.label)}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Bible

type BibleNav = { kind: "books" } | { kind: "chapters"; book: number } | { kind: "chapter"; book: number; chapter: number } | { kind: "results"; q: string };

function BibleView(props: { bible: Bible | null; reading: Reading | null; selName: string; onRead: (r: Reading) => void; onAdd: (r: Reading) => void }) {
  const { bible, reading } = props;
  const [q, setQ] = useState("");
  const [testament, setTestament] = useState<"ot" | "nt">("nt");
  const [view, setView] = useState<BibleNav>({ kind: "books" });
  const list = useRef<HTMLDivElement>(null);

  // La lecture suivie avance : le verset à l'écran reste visible dans la liste.
  useEffect(() => {
    if (!reading) return;
    setView((v) => (v.kind === "chapter" && v.book === reading.book && v.chapter === reading.chapter ? v : { kind: "chapter", book: reading.book, chapter: reading.chapter }));
    window.setTimeout(() => list.current?.querySelector(`[data-verse="${reading.verse}"]`)?.scrollIntoView({ block: "nearest", behavior: "smooth" }), 30);
  }, [reading?.book, reading?.chapter, reading?.verse]); // eslint-disable-line react-hooks/exhaustive-deps

  const results = useMemo(() => (bible && view.kind === "results" ? searchWords(bible, view.q, 60) : []), [bible, view]);

  if (!bible) return <p className="note">{t("panels.loadingBible")}</p>;

  const submit = () => {
    const p = parseReference(bible, q);
    if (p?.verse) props.onRead({ book: p.book, chapter: p.chapter, verse: p.verse });
    else if (p) setView({ kind: "chapter", book: p.book, chapter: p.chapter });
    else if (q.trim()) setView({ kind: "results", q });
  };
  const books = bible.books.map((b, i) => ({ b, i })).filter(({ i }) => (testament === "ot" ? i < OT_COUNT : i >= OT_COUNT));
  const addBtn = (r: Reading) => (
    <button type="button" className="icon-btn" aria-label={t("panels.addTo", { name: props.selName })} title={t("panels.addTo", { name: props.selName })} onClick={() => props.onAdd(r)}>
      <Plus size={17} strokeWidth={2} />
    </button>
  );

  return (
    <div className="view">
      <div className="view-head">
        <div className="view-title">
          <h1>{t("panels.bible")}</h1>
        </div>
        <p className="view-sub">{bible.name}</p>
      </div>
      <form
        className="search-row"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div className="search" style={{ flex: 1, maxWidth: 560 }}>
          <Search size={18} strokeWidth={1.75} />
          <input id="bible-q" className="input" value={q} placeholder={t("panels.searchPlaceholder")} aria-label={t("panels.search")} onChange={(e) => setQ(e.target.value)} />
        </div>
        <button type="submit" className="btn">
          {t("panels.open")}
        </button>
      </form>

      <nav className="crumbs" aria-label={t("panels.books")}>
        <button type="button" onClick={() => setView({ kind: "books" })}>
          {t("panels.books")}
        </button>
        {(view.kind === "chapters" || view.kind === "chapter") && (
          <>
            <ChevronRight size={14} />
            <button type="button" onClick={() => setView({ kind: "chapters", book: view.book })}>
              {bible.books[view.book].name}
            </button>
          </>
        )}
        {view.kind === "chapter" && (
          <>
            <ChevronRight size={14} />
            <strong>{t("panels.chapter", { n: view.chapter })}</strong>
          </>
        )}
      </nav>

      {view.kind === "books" && (
        <>
          <div className="segmented" style={{ display: "inline-flex", alignSelf: "start" }}>
            <button type="button" aria-pressed={testament === "ot"} onClick={() => setTestament("ot")}>
              {t("panels.oldTestament")}
            </button>
            <button type="button" aria-pressed={testament === "nt"} onClick={() => setTestament("nt")}>
              {t("panels.newTestament")}
            </button>
          </div>
          <div className="book-grid">
            {books.map(({ b, i }) => (
              <button key={b.code} type="button" onClick={() => setView({ kind: "chapters", book: i })}>
                {b.name}
              </button>
            ))}
          </div>
        </>
      )}

      {view.kind === "chapters" && (
        <div className="chapter-grid">
          {bible.books[view.book].chapters.map((_, c) => (
            <button key={c} type="button" onClick={() => setView({ kind: "chapter", book: view.book, chapter: c + 1 })}>
              {c + 1}
            </button>
          ))}
        </div>
      )}

      {view.kind === "chapter" && (
        <div className="verse-list" ref={list}>
          <p className="note">{t("panels.readHelp", { name: props.selName })}</p>
          {bible.books[view.book].chapters[view.chapter - 1].map((text, v) => {
            const r = { book: view.book, chapter: view.chapter, verse: v + 1 };
            const on = reading?.book === r.book && reading.chapter === r.chapter && reading.verse === r.verse;
            return (
              <div key={v} className={`verse-row ${on ? "is-live" : ""}`} data-verse={v + 1}>
                <button type="button" className="verse-main" onClick={() => props.onRead(r)}>
                  <span className="verse-num">{v + 1}</span>
                  <span className="verse-text">{text}</span>
                </button>
                {addBtn(r)}
              </div>
            );
          })}
        </div>
      )}

      {view.kind === "results" && (
        <div className="verse-list">
          <p className="note">{results.length ? t("panels.results", { n: results.length, q: view.q }) : t("panels.noResults")}</p>
          {results.map((r) => (
            <div key={`${r.book}-${r.chapter}-${r.verse}`} className="verse-row">
              <button type="button" className="verse-main" onClick={() => props.onRead({ book: r.book, chapter: r.chapter, verse: r.verse! })}>
                <span className="verse-num wide">{refLabel(bible, r)}</span>
                <span className="verse-text">{r.text}</span>
              </button>
              {addBtn({ book: r.book, chapter: r.chapter, verse: r.verse! })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- Images

function MediaView(props: { media: MediaEntry[]; selName: string; store: (dataUrl: string) => Promise<string>; onAddMedia: (m: MediaEntry[]) => void; onRemove: (id: string) => void; onShow: (c: Content) => void; onAddTo: (c: Content, label: string) => void }) {
  const [busy, setBusy] = useState(false);
  const add = async (files: FileList | null) => {
    if (!files) return;
    setBusy(true);
    const added: MediaEntry[] = [];
    for (const f of Array.from(files)) {
      try {
        const src = await props.store(await loadImageAsDataUrl(f));
        added.push({ id: uid(), name: f.name.replace(/\.[^.]+$/, ""), src });
      } catch {
        /* fichier illisible : ignoré */
      }
    }
    props.onAddMedia(added);
    setBusy(false);
  };
  return (
    <div className="view">
      <div className="view-head">
        <div className="view-title">
          <h1>{t("panels.imagesTitle")}</h1>
        </div>
        <p className="view-sub">{t("panels.importHelp")}</p>
      </div>
      <div className="media-grid">
        {props.media.map((m) => {
          const content: Content = { kind: "image", src: m.src, name: m.name };
          return (
            <div key={m.id} className="media-card">
              <button type="button" className="media-show" onClick={() => props.onShow(content)} aria-label={`${t("panels.show")} : ${m.name}`}>
                <MiniScreen content={content} />
              </button>
              <div className="media-row">
                <span className="item-label" style={{ flex: 1 }}>
                  {m.name}
                </span>
                <button type="button" className="icon-btn" aria-label={t("panels.removeMedia", { name: m.name })} onClick={() => props.onRemove(m.id)}>
                  <Trash2 size={15} strokeWidth={1.75} />
                </button>
              </div>
              <div className="row-2">
                <button type="button" className="btn btn-sm" onClick={() => props.onShow(content)}>
                  {t("panels.show")}
                </button>
                <button type="button" className="btn btn-sm" onClick={() => props.onAddTo(content, m.name)}>
                  {t("panels.addTo", { name: props.selName })}
                </button>
              </div>
            </div>
          );
        })}
        <label className="file-drop media-import" aria-busy={busy}>
          <ImagePlus size={26} strokeWidth={1.6} />
          {t("panels.importImages")}
          <input type="file" accept="image/*" multiple onChange={(e) => add(e.target.files)} />
        </label>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Texte

function TextView(props: { selName: string; onShow: (c: Content) => void; onAdd: (c: Content, label: string) => void }) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [layout, setLayout] = useState<"full" | "lower">("full");
  const content = (): Content => ({ kind: "text", layout, title: title || t("panels.textTitlePlaceholder"), body: body || t("panels.textBodyPlaceholder") });
  return (
    <div className="view">
      <div className="view-head">
        <div className="view-title">
          <h1>{t("panels.textNew")}</h1>
        </div>
      </div>
      <div className="text-editor">
        <div className="text-form">
          <div className="field">
            <label htmlFor="ttitle">{t("panels.textTitle")}</label>
            <input id="ttitle" className="input" value={title} placeholder={t("panels.textTitlePlaceholder")} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="tbody">{t("panels.textBody")}</label>
            <textarea id="tbody" className="input" value={body} placeholder={t("panels.textBodyPlaceholder")} onChange={(e) => setBody(e.target.value)} />
          </div>
          <div className="segmented" style={{ display: "flex" }} role="radiogroup" aria-label={t("regie.layout")}>
            <button type="button" role="radio" style={{ flex: 1 }} aria-checked={layout === "lower"} aria-pressed={layout === "lower"} onClick={() => setLayout("lower")}>
              {t("regie.onCamera")}
            </button>
            <button type="button" role="radio" style={{ flex: 1 }} aria-checked={layout === "full"} aria-pressed={layout === "full"} onClick={() => setLayout("full")}>
              {t("regie.fullScreen")}
            </button>
          </div>
          <div className="row-2">
            <button type="button" className="btn" onClick={() => props.onShow(content())}>
              {t("panels.showNow")}
            </button>
            <button type="button" className="btn" onClick={() => props.onAdd(content(), title || t("panels.textTitlePlaceholder"))}>
              {t("panels.addTo", { name: props.selName })}
            </button>
          </div>
        </div>
        <div>
          <p className="field-label">{t("panels.preview")}</p>
          <div className="text-preview">
            <MiniScreen content={content()} />
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- La zone complète

export function ContentArea(props: {
  view: View;
  setView: (v: View) => void;
  lib: Library;
  update: (fn: (l: Library) => Library) => void;
  sel: number;
  liveIndex: number | null;
  liveSlide: number;
  localBase: string;
  camera: string | null;
  bible: Bible | null;
  reading: Reading | null;
  storeImage: (dataUrl: string) => Promise<string>;
  onShowItem: (i: number, slide?: number) => void;
  onShowOther: (c: Content) => void;
  onRead: (r: Reading) => void;
  onDeleteMoment: () => void;
  onMoveItem: (from: number, to: number) => void;
  onRemoveItem: (i: number) => void;
}) {
  const { lib, update, sel, view } = props;
  const moment = lib.moments[sel];
  const [big, setBig] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [importing, setImporting] = useState<Importing>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    scroller.current?.scrollTo({ top: 0 });
  }, [view]);

  const addToMoment = (m: number, content: Content, label: string) => {
    const item: PlanItem = { id: uid(), label, content };
    update((l) => ({ ...l, moments: l.moments.map((x, i) => (i === m ? { ...x, items: [...x.items, item] } : x)) }));
    setToast(t("panels.added", { name: lib.moments[m]?.name ?? "" }));
    window.setTimeout(() => setToast(null), 1800);
  };

  /** PowerPoint → UN contenu « présentation » ajouté au moment choisi. */
  const importPpt = async (file: File) => {
    const m = sel;
    const name = file.name.replace(/\.[^.]+$/, "");
    setImportError(null);
    setImporting({ name, done: 0, total: 0 });
    try {
      const r = await importPresentation(file, props.localBase, (done, total) => setImporting({ name, done, total }));
      addToMoment(m, { kind: "slides", name: r.name, slides: r.slides, index: 0 }, r.name);
    } catch (e) {
      const kind = importErrorKind(e);
      setImportError(kind === "OTHER" ? t("panels.importFailed", { message: String(e instanceof Error ? e.message : e) }) : t(`panels.importError${kind}`));
    } finally {
      setImporting(null);
    }
  };

  return (
    <div className="center-scroll" ref={scroller}>
      {view !== "moment" && (
        <button type="button" className="back-btn" onClick={() => props.setView("moment")}>
          <ChevronLeft size={18} strokeWidth={2} />
          {t("regie.backTo", { name: moment?.name ?? "" })}
        </button>
      )}
      {toast && (
        <p className="toast" role="status">
          <Check size={16} strokeWidth={2.2} />
          {toast}
        </p>
      )}
      {view === "moment" && moment && (
        <MomentView
          moment={moment}
          liveIndex={props.liveIndex}
          liveSlide={props.liveSlide}
          camera={props.camera}
          big={big}
          setBig={setBig}
          onShow={props.onShowItem}
          onOpen={props.setView}
          importing={importing}
          importError={importError}
          onImport={importPpt}
          onRename={(name) => update((l) => ({ ...l, moments: l.moments.map((x, i) => (i === sel ? { ...x, name } : x)) }))}
          onDelete={props.onDeleteMoment}
          onRemoveItem={props.onRemoveItem}
          onMoveItem={props.onMoveItem}
        />
      )}
      {/* Bible, Images et Texte restent montés : on retrouve son chapitre ou sa saisie en revenant. */}
      <div hidden={view !== "bible"}>
        <BibleView
          bible={props.bible}
          reading={props.reading}
          selName={moment?.name ?? ""}
          onRead={props.onRead}
          onAdd={(r: Passage & { verse: number }) => props.bible && addToMoment(sel, verseContent(props.bible, r, "full"), refLabel(props.bible, r))}
        />
      </div>
      <div hidden={view !== "media"}>
        <MediaView
          media={lib.media}
          selName={moment?.name ?? ""}
          store={props.storeImage}
          onAddMedia={(m) => update((l) => ({ ...l, media: [...l.media, ...m] }))}
          onRemove={(id) => update((l) => ({ ...l, media: l.media.filter((x) => x.id !== id) }))}
          onShow={props.onShowOther}
          onAddTo={(c, label) => addToMoment(sel, c, label)}
        />
      </div>
      <div hidden={view !== "text"}>
        <TextView selName={moment?.name ?? ""} onShow={props.onShowOther} onAdd={(c, label) => addToMoment(sel, c, label)} />
      </div>
    </div>
  );
}
