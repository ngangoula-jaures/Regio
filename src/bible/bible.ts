// Bible Louis Segond 1910 (domaine public), intégrée à l'application : fonctionne hors ligne.
// Fichier construit par scripts/build_bible.py → public/bible/lsg1910.json.

export interface Book {
  code: string;
  name: string;
  chapters: string[][];
}
export interface Bible {
  id: string;
  name: string;
  books: Book[];
}
export interface Passage {
  book: number;
  chapter: number;
  verse?: number;
}

let cache: Promise<Bible> | null = null;
export function loadBible(): Promise<Bible> {
  cache ??= fetch("/bible/lsg1910.json").then((r) => {
    if (!r.ok) throw new Error(`Bible introuvable (HTTP ${r.status})`);
    return r.json();
  });
  return cache;
}

/** Les 39 premiers livres forment l'Ancien Testament. */
export const OT_COUNT = 39;

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** Abréviations courantes en plus des débuts de noms (« jn », « ps », « mt »…). */
const ALIASES: Record<string, string> = {
  gn: "GEN", ex: "EXO", lv: "LEV", nb: "NUM", dt: "DEU", jos: "JOS", jg: "JDG", rt: "RUT", esd: "EZR", ne: "NEH",
  est: "EST", jb: "JOB", ps: "PSA", psaume: "PSA", pr: "PRO", qo: "ECC", ec: "ECC", ct: "SOL", cantique: "SOL",
  es: "ISA", is: "ISA", isaie: "ISA", jr: "JER", lm: "LAM", ez: "EZE", dn: "DAN", os: "HOS", jl: "JOE", am: "AMO",
  ab: "OBA", jon: "JON", mi: "MIC", na: "NAH", ha: "HAB", so: "ZEP", ag: "HAG", za: "ZEC", ml: "MAL",
  mt: "MAT", mc: "MAR", lc: "LUK", jn: "JOH", ac: "ACT", rm: "ROM", co: "1CO", ga: "GAL", ep: "EPH", ph: "PHI",
  phil: "PHI", col: "COL", th: "1TH", tm: "1TI", tt: "TIT", phm: "PHM", he: "HEB", heb: "HEB", jc: "JAM",
  jac: "JAM", pi: "1PE", jd: "JUD", ap: "REV", apoc: "REV",
};

/** Abréviations des livres numérotés : « 1jn » → 1 Jean, « 2 co » → 2 Corinthiens, « 1 s » → 1 Samuel… */
const NUMBERED: Record<string, string> = {
  jn: "JO", jean: "JO", pi: "PE", p: "PE", pe: "PE", co: "CO", cor: "CO", th: "TH", thes: "TH", tm: "TI", tim: "TI",
  s: "SA", sa: "SA", sam: "SA", r: "KI", rs: "KI", ch: "CH", chr: "CH",
};

function findBook(bible: Bible, query: string): number {
  const q = norm(query);
  if (!q) return -1;
  const m = q.match(/^([123])\s*(.*)$/);
  const num = m ? m[1] : "";
  const rest = (m ? m[2] : q).replace(/\s+/g, "");
  if (num && NUMBERED[rest]) {
    const i = bible.books.findIndex((b) => b.code === num + NUMBERED[rest]);
    if (i >= 0) return i;
  }
  const alias = ALIASES[rest];
  if (alias) {
    const code = num && /^[123]/.test(alias) ? num + alias.slice(1) : alias;
    const i = bible.books.findIndex((b) => b.code === code);
    if (i >= 0) return i;
  }
  return bible.books.findIndex((b) => {
    const n = norm(b.name);
    const bm = n.match(/^([123]) (.*)$/);
    const bNum = bm ? bm[1] : "";
    const bName = (bm ? bm[2] : n).replace(/\s+/g, "");
    return bNum === num && rest.length > 0 && bName.startsWith(rest);
  });
}

/** « Jean 3 16 », « jn 3:16 », « 1 Jean 2 », « Psaume 23 » → passage ; null si ce n'est pas une référence. */
export function parseReference(bible: Bible, input: string): Passage | null {
  const q = norm(input);
  const m = q.match(/^((?:[123]\s*)?[a-z][a-z ]*?)\s*(\d+)?(?:\s+(\d+))?(?:\s+\d+)?$/);
  if (!m) return null;
  const book = findBook(bible, m[1]);
  if (book < 0) return null;
  const chapters = bible.books[book].chapters;
  const chapter = m[2] ? Math.min(Math.max(1, Number(m[2])), chapters.length) : 1;
  const verse = m[3] ? Math.min(Math.max(1, Number(m[3])), chapters[chapter - 1].length) : undefined;
  return { book, chapter, verse };
}

/** Recherche par mots (tous les mots doivent être présents), limitée à `limit` résultats. */
export function searchWords(bible: Bible, input: string, limit = 40): Array<Passage & { text: string }> {
  const words = norm(input).split(" ").filter((w) => w.length > 1);
  if (words.length === 0) return [];
  const out: Array<Passage & { text: string }> = [];
  bible.books.forEach((b, bi) =>
    b.chapters.forEach((verses, ci) =>
      verses.forEach((t, vi) => {
        if (out.length >= limit) return;
        const n = norm(t);
        if (words.every((w) => n.includes(w))) out.push({ book: bi, chapter: ci + 1, verse: vi + 1, text: t });
      }),
    ),
  );
  return out;
}

export function refLabel(bible: Bible, p: Passage): string {
  return `${bible.books[p.book].name} ${p.chapter}${p.verse ? ":" + p.verse : ""}`;
}

export function verseText(bible: Bible, p: Required<Passage>): string {
  return bible.books[p.book].chapters[p.chapter - 1]?.[p.verse - 1] ?? "";
}
