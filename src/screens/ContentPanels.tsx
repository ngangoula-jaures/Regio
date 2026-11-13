// Panneaux de droite de la régie : Bible, Médias, Texte. Chaque action affiche directement à l'écran.

import { useMemo, useState } from "react";
import { BookOpen, Hourglass, ImagePlus, Images, Search, Type } from "lucide-react";
import { t } from "../i18n";
import { SAMPLE_VERSES } from "../shared/bible-sample";
import type { Content } from "../shared/content";
import { loadImageAsDataUrl } from "../app/images";
import { standby } from "../app/plan";

type Tab = "bible" | "media" | "text";

/** Minuscules sans accents ni ponctuation : « Jean 3:16 » et « jean 3 16 » se ressemblent. */
const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

function BiblePanel({ onShow }: { onShow: (c: Content) => void }) {
  const [q, setQ] = useState("");
  const results = useMemo(() => {
    const n = norm(q);
    if (!n) return SAMPLE_VERSES;
    return SAMPLE_VERSES.filter((v) => norm(v.reference).startsWith(n) || norm(v.reference).includes(n) || norm(v.text).includes(n));
  }, [q]);
  return (
    <>
      <div className="field">
        <label htmlFor="passage">{t("panels.passage")}</label>
        <div className="search">
          <Search size={18} strokeWidth={1.75} />
          <input id="passage" className="input" value={q} placeholder={t("panels.passagePlaceholder")} onChange={(e) => setQ(e.target.value)} />
        </div>
        <span className="note">{t("panels.passageHelp")}</span>
      </div>
      {results.length === 0 && <p className="note">{t("panels.noResult")}</p>}
      {results.map((v) => (
        <div key={v.reference} className="verse">
          <div className="verse-ref">
            {v.reference} · {v.version}
          </div>
          <div className="verse-text">{v.text}</div>
          <div className="verse-actions">
            <button type="button" className="btn btn-sm" onClick={() => onShow({ kind: "verse", layout: "lower", reference: v.reference, text: v.text, version: v.version })}>
              {t("panels.asLower")}
            </button>
            <button type="button" className="btn btn-sm" onClick={() => onShow({ kind: "verse", layout: "full", reference: v.reference, text: v.text, version: v.version })}>
              {t("panels.asFull")}
            </button>
          </div>
        </div>
      ))}
    </>
  );
}

interface Media {
  name: string;
  src: string;
}

function MediaPanel({ media, setMedia, onShow }: { media: Media[]; setMedia: (m: Media[]) => void; onShow: (c: Content) => void }) {
  const add = async (files: FileList | null) => {
    if (!files) return;
    const loaded: Media[] = [];
    for (const f of Array.from(files)) {
      try {
        loaded.push({ name: f.name, src: await loadImageAsDataUrl(f) });
      } catch {
        /* fichier illisible : ignoré */
      }
    }
    setMedia([...media, ...loaded]);
  };
  return (
    <>
      <label className="file-drop">
        <ImagePlus size={18} strokeWidth={1.75} />
        {t("panels.importImages")}
        <input type="file" accept="image/*" multiple onChange={(e) => add(e.target.files)} />
      </label>
      <p className="note">{t("panels.importHelp")}</p>
      {media.length === 0 ? (
        <p className="note">{t("panels.noMedia")}</p>
      ) : (
        <div className="media-grid">
          {media.map((m, i) => (
            <button key={i} type="button" className="media-thumb" title={m.name} aria-label={m.name} onClick={() => onShow({ kind: "image", src: m.src, name: m.name })}>
              <img src={m.src} alt="" />
            </button>
          ))}
        </div>
      )}
    </>
  );
}

function TextPanel({ onShow }: { onShow: (c: Content) => void }) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const send = (layout: "lower" | "full") =>
    onShow({ kind: "text", layout, title: title || t("panels.textTitlePlaceholder"), body: body || t("panels.textBodyPlaceholder") });
  return (
    <>
      <div className="field">
        <label htmlFor="ttitle">{t("panels.textTitle")}</label>
        <input id="ttitle" className="input" value={title} placeholder={t("panels.textTitlePlaceholder")} onChange={(e) => setTitle(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="tbody">{t("panels.textBody")}</label>
        <textarea id="tbody" className="input" value={body} placeholder={t("panels.textBodyPlaceholder")} onChange={(e) => setBody(e.target.value)} />
      </div>
      <div className="row-2">
        <button type="button" className="btn btn-sm" onClick={() => send("lower")}>
          {t("panels.asLower")}
        </button>
        <button type="button" className="btn btn-sm" onClick={() => send("full")}>
          {t("panels.asFull")}
        </button>
      </div>
      <button type="button" className="btn btn-sm" onClick={() => onShow(standby())}>
        <Hourglass size={16} strokeWidth={1.75} />
        {t("panels.standby")}
      </button>
    </>
  );
}

export function ContentPanels({ onShow }: { onShow: (c: Content) => void }) {
  const [tab, setTab] = useState<Tab>("bible");
  const [media, setMedia] = useState<Media[]>([]);
  const tabs: Array<{ id: Tab; label: string; icon: React.ReactNode }> = [
    { id: "bible", label: t("panels.bible"), icon: <BookOpen size={16} strokeWidth={1.75} /> },
    { id: "media", label: t("panels.media"), icon: <Images size={16} strokeWidth={1.75} /> },
    { id: "text", label: t("panels.text"), icon: <Type size={16} strokeWidth={1.75} /> },
  ];
  return (
    <aside className="panels" aria-label={t("panels.bible")}>
      <div className="segmented panel-tabs" role="tablist">
        {tabs.map((x) => (
          <button key={x.id} type="button" role="tab" aria-selected={tab === x.id} onClick={() => setTab(x.id)}>
            {x.icon}
            {x.label}
          </button>
        ))}
      </div>
      {tab === "bible" && <BiblePanel onShow={onShow} />}
      {tab === "media" && <MediaPanel media={media} setMedia={setMedia} onShow={onShow} />}
      {tab === "text" && <TextPanel onShow={onShow} />}
    </aside>
  );
}
