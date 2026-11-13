// Panneau de droite de la régie : l'onglet du moment sélectionné, la Bible, les médias, le texte.

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronRight, GripVertical, ImagePlus, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { t } from "../i18n";
import type { Content } from "../shared/content";
import { MiniScreen } from "../components/MiniScreen";
import { OT_COUNT, parseReference, refLabel, searchWords, type Bible, type Passage } from "../bible/bible";
import { kindLabel, uid, type Library, type MediaEntry, type Moment, type PlanItem } from "../app/library";
import { loadImageAsDataUrl } from "../app/images";

export type Tab = "moment" | "bible" | "media" | "text";

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

// ---------------------------------------------------------------- Onglet du moment

function MomentTab(props: {
  moment: Moment;
  liveIndex: number | null;
  camera: string | null;
  onShow: (i: number) => void;
  onRename: (name: string) => void;
  onDelete: () => void;
  onRemoveItem: (i: number) => void;
  onMoveItem: (from: number, to: number) => void;
}) {
  const { moment } = props;
  // Glisser-déposer : contenu saisi, et place où il irait (indice d'insertion entre 0 et n).
  const [drag, setDrag] = useState<number | null>(null);
  const [dropAt, setDropAt] = useState<number | null>(null);
  const endDrag = () => {
    setDrag(null);
    setDropAt(null);
  };
  const drop = () => {
    if (drag !== null && dropAt !== null) props.onMoveItem(drag, dropAt > drag ? dropAt - 1 : dropAt);
    endDrag();
  };
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(moment.name);
  const [confirm, setConfirm] = useState(false);
  useEffect(() => {
    setName(moment.name);
    setRenaming(false);
    setConfirm(false);
  }, [moment.id]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="tab-body">
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
        <div className="moment-head">
          <div>
            <h2>{moment.name}</h2>
            <p className="note">{t("regie.momentHelp")}</p>
          </div>
          <button type="button" className="icon-btn" aria-label={t("regie.rename")} title={t("regie.rename")} onClick={() => setRenaming(true)}>
            <Pencil size={16} strokeWidth={1.75} />
          </button>
          <button type="button" className="icon-btn" aria-label={t("regie.deleteMoment")} title={t("regie.deleteMoment")} onClick={() => setConfirm(true)}>
            <Trash2 size={16} strokeWidth={1.75} />
          </button>
        </div>
      )}
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
      {moment.items.length === 0 && <p className="empty-note">{t("regie.momentEmpty", { name: moment.name })}</p>}
      {moment.items.length > 1 && <p className="note">{t("regie.reorderHelp")}</p>}
      <div className="item-list" onDragLeave={(e) => !e.currentTarget.contains(e.relatedTarget as Node) && setDropAt(null)}>
        {moment.items.map((it, i) => (
          <div
            key={it.id}
            className={`item-card ${props.liveIndex === i ? "is-live" : ""} ${drag === i ? "is-dragging" : ""} ${dropAt === i && drag !== null ? "drop-before" : ""} ${dropAt === i + 1 && drag !== null && i === moment.items.length - 1 ? "drop-after" : ""}`}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.effectAllowed = "move";
              e.dataTransfer.setData("text/plain", it.id);
              setDrag(i);
            }}
            onDragOver={(e) => {
              if (drag === null) return;
              e.preventDefault();
              const r = e.currentTarget.getBoundingClientRect();
              setDropAt(e.clientY < r.top + r.height / 2 ? i : i + 1);
            }}
            onDrop={(e) => {
              e.preventDefault();
              drop();
            }}
            onDragEnd={endDrag}
          >
            <button
              type="button"
              className="item-grip"
              data-own-keys
              aria-label={t("regie.moveItem", { name: it.label })}
              title={t("regie.moveItem", { name: it.label })}
              onKeyDown={(e) => {
                if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
                e.preventDefault();
                const to = i + (e.key === "ArrowDown" ? 1 : -1);
                props.onMoveItem(i, to);
                // Garder le focus sur la poignée du contenu déplacé.
                const list = e.currentTarget.closest(".item-list");
                window.setTimeout(() => (list?.querySelectorAll<HTMLButtonElement>(".item-grip")[Math.min(Math.max(0, to), moment.items.length - 1)])?.focus(), 0);
              }}
            >
              <GripVertical size={16} strokeWidth={1.75} />
            </button>
            <button type="button" className="item-main" onClick={() => props.onShow(i)} aria-current={props.liveIndex === i ? "true" : undefined}>
              <span className="item-thumb">
                <MiniScreen content={it.content} camera={props.camera} />
              </span>
              <span className="item-text">
                <span className="item-label">{it.label}</span>
                <span className="item-kind">{kindLabel(it.content)}</span>
              </span>
              {props.liveIndex === i && <span className="plan-badge">{t("regie.onScreen")}</span>}
            </button>
            <button type="button" className="icon-btn" aria-label={t("regie.removeItem", { name: it.label })} title={t("regie.removeItem", { name: it.label })} onClick={() => props.onRemoveItem(i)}>
              <X size={15} strokeWidth={2} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Bible

type BibleView = { kind: "books" } | { kind: "chapters"; book: number } | { kind: "chapter"; book: number; chapter: number } | { kind: "results"; q: string };

function BibleTab(props: { bible: Bible | null; reading: Reading | null; selName: string; onRead: (r: Reading) => void; onAdd: (r: Reading) => void }) {
  const { bible, reading } = props;
  const [q, setQ] = useState("");
  const [testament, setTestament] = useState<"ot" | "nt">("nt");
  const [view, setView] = useState<BibleView>({ kind: "books" });
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

  return (
    <div className="tab-body">
      <form
        className="search-row"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div className="search" style={{ flex: 1 }}>
          <Search size={18} strokeWidth={1.75} />
          <input id="bible-q" className="input" value={q} placeholder={t("panels.searchPlaceholder")} aria-label={t("panels.search")} onChange={(e) => setQ(e.target.value)} />
        </div>
        <button type="submit" className="btn btn-sm">
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
        <span className="spacer" />
        <span className="note">{bible.name}</span>
      </nav>

      {view.kind === "books" && (
        <>
          <div className="segmented" style={{ display: "flex" }}>
            <button type="button" style={{ flex: 1 }} aria-pressed={testament === "ot"} onClick={() => setTestament("ot")}>
              {t("panels.oldTestament")}
            </button>
            <button type="button" style={{ flex: 1 }} aria-pressed={testament === "nt"} onClick={() => setTestament("nt")}>
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
          <p className="note">{t("panels.readHelp")}</p>
          {bible.books[view.book].chapters[view.chapter - 1].map((text, v) => {
            const r = { book: view.book, chapter: view.chapter, verse: v + 1 };
            const on = reading?.book === r.book && reading.chapter === r.chapter && reading.verse === r.verse;
            return (
              <div key={v} className={`verse-row ${on ? "is-live" : ""}`} data-verse={v + 1}>
                <button type="button" className="verse-main" onClick={() => props.onRead(r)}>
                  <span className="verse-num">{v + 1}</span>
                  <span className="verse-text">{text}</span>
                </button>
                <button type="button" className="icon-btn" aria-label={t("panels.addTo", { name: props.selName })} title={t("panels.addTo", { name: props.selName })} onClick={() => props.onAdd(r)}>
                  <Plus size={16} strokeWidth={2} />
                </button>
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
                <span className="verse-num" style={{ width: "auto", minWidth: 0 }}>
                  {refLabel(bible, r)}
                </span>
                <span className="verse-text">{r.text}</span>
              </button>
              <button type="button" className="icon-btn" aria-label={t("panels.addTo", { name: props.selName })} onClick={() => props.onAdd({ book: r.book, chapter: r.chapter, verse: r.verse! })}>
                <Plus size={16} strokeWidth={2} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- Médias

function MediaTab(props: { media: MediaEntry[]; selName: string; store: (dataUrl: string) => Promise<string>; onAddMedia: (m: MediaEntry[]) => void; onRemove: (id: string) => void; onShow: (c: Content) => void; onAddTo: (c: Content, label: string) => void }) {
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
    <div className="tab-body">
      <label className="file-drop" aria-busy={busy}>
        <ImagePlus size={18} strokeWidth={1.75} />
        {t("panels.importImages")}
        <input type="file" accept="image/*" multiple onChange={(e) => add(e.target.files)} />
      </label>
      <p className="note">{t("panels.importHelp")}</p>
      {props.media.length === 0 && <p className="empty-note">{t("panels.noMedia")}</p>}
      {props.media.map((m) => {
        const content: Content = { kind: "image", src: m.src, name: m.name };
        return (
          <div key={m.id} className="media-card">
            <MiniScreen content={content} />
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
    </div>
  );
}

// ---------------------------------------------------------------- Texte

function TextTab(props: { moments: Moment[]; sel: number; onShow: (c: Content) => void; onAddToMoment: (m: number, c: Content, label: string) => void }) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [layout, setLayout] = useState<"full" | "lower">("full");
  const [target, setTarget] = useState(props.sel);
  useEffect(() => setTarget(props.sel), [props.sel]);
  const content = (): Content => ({ kind: "text", layout, title: title || t("panels.textTitlePlaceholder"), body: body || t("panels.textBodyPlaceholder") });
  return (
    <div className="tab-body">
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
      <button type="button" className="btn" onClick={() => props.onShow(content())}>
        {t("panels.showNow")}
      </button>
      <div className="inline-form">
        <label htmlFor="ttarget" className="note" style={{ whiteSpace: "nowrap" }}>
          {t("panels.addToShort")}
        </label>
        <select id="ttarget" className="input" value={target} onChange={(e) => setTarget(Number(e.target.value))}>
          {props.moments.map((m, i) => (
            <option key={m.id} value={i}>
              {m.name}
            </option>
          ))}
        </select>
        <button type="button" className="btn btn-sm" onClick={() => props.onAddToMoment(target, content(), title || t("panels.textTitlePlaceholder"))}>
          {t("regie.add")}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Panneau complet

export function RightPanel(props: {
  lib: Library;
  update: (fn: (l: Library) => Library) => void;
  sel: number;
  tab: Tab;
  setTab: (t: Tab) => void;
  liveIndex: number | null;
  camera: string | null;
  bible: Bible | null;
  reading: Reading | null;
  storeImage: (dataUrl: string) => Promise<string>;
  onShowItem: (i: number) => void;
  onShowOther: (c: Content) => void;
  onRead: (r: Reading) => void;
  onDeleteMoment: () => void;
  onMoveItem: (from: number, to: number) => void;
  onRemoveItem: (i: number) => void;
}) {
  const { lib, update, sel } = props;
  const moment = lib.moments[sel];
  const [toast, setToast] = useState<string | null>(null);

  const addToMoment = (m: number, content: Content, label: string) => {
    const item: PlanItem = { id: uid(), label, content };
    update((l) => ({ ...l, moments: l.moments.map((x, i) => (i === m ? { ...x, items: [...x.items, item] } : x)) }));
    setToast(t("panels.added", { name: lib.moments[m]?.name ?? "" }));
    window.setTimeout(() => setToast(null), 1800);
  };

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: "moment", label: moment?.name ?? "—" },
    { id: "bible", label: t("panels.bible") },
    { id: "media", label: t("panels.media") },
    { id: "text", label: t("panels.text") },
  ];

  return (
    <aside className="panels">
      <div className="segmented panel-tabs" role="tablist">
        {tabs.map((x) => (
          <button key={x.id} type="button" role="tab" aria-selected={props.tab === x.id} onClick={() => props.setTab(x.id)} className={x.id === "moment" ? "tab-moment" : undefined}>
            <span className="tab-label">{x.label}</span>
          </button>
        ))}
      </div>
      {toast && (
        <p className="toast" role="status">
          <Check size={16} strokeWidth={2.2} />
          {toast}
        </p>
      )}
      {props.tab === "moment" && moment && (
        <MomentTab
          moment={moment}
          liveIndex={props.liveIndex}
          camera={props.camera}
          onShow={props.onShowItem}
          onRename={(name) => update((l) => ({ ...l, moments: l.moments.map((x, i) => (i === sel ? { ...x, name } : x)) }))}
          onDelete={props.onDeleteMoment}
          onRemoveItem={props.onRemoveItem}
          onMoveItem={props.onMoveItem}
        />
      )}
      {/* Bible, Médias et Texte restent montés : on retrouve son chapitre ou sa saisie en revenant. */}
      <div hidden={props.tab !== "bible"}>
        <BibleTab
          bible={props.bible}
          reading={props.reading}
          selName={moment?.name ?? ""}
          onRead={props.onRead}
          onAdd={(r: Passage & { verse: number }) => props.bible && addToMoment(sel, verseContent(props.bible, r, "full"), refLabel(props.bible, r))}
        />
      </div>
      <div hidden={props.tab !== "media"}>
        <MediaTab
          media={lib.media}
          selName={moment?.name ?? ""}
          store={props.storeImage}
          onAddMedia={(m) => update((l) => ({ ...l, media: [...l.media, ...m] }))}
          onRemove={(id) => update((l) => ({ ...l, media: l.media.filter((x) => x.id !== id) }))}
          onShow={props.onShowOther}
          onAddTo={(c, label) => addToMoment(sel, c, label)}
        />
      </div>
      <div hidden={props.tab !== "text"}>
        <TextTab moments={lib.moments} sel={sel} onShow={props.onShowOther} onAddToMoment={addToMoment} />
      </div>
    </aside>
  );
}
