// Traduction de l'interface : t("startup.title"), t("regie.progress", { n: 2, total: 9 }).

import { fr, type Messages } from "./fr";
import { en } from "./en";

export type Lang = "fr" | "en";
const ALL: Record<Lang, Messages> = { fr, en };

/** Clés « a.b » de toutes les phrases. */
type Paths<T, P extends string = ""> = {
  [K in keyof T & string]: T[K] extends string ? `${P}${K}` : Paths<T[K], `${P}${K}.`>;
}[keyof T & string];
export type MessageKey = Paths<Messages>;

const LANG_KEY = "regio.lang";

/** Langue choisie par l'utilisateur (null : jamais choisie, 1er lancement). */
export function savedLang(): Lang | null {
  try {
    const saved = localStorage.getItem(LANG_KEY);
    if (saved === "fr" || saved === "en") return saved;
  } catch {
    /* ignore */
  }
  return null;
}

/** Langue de l'ordinateur : seulement une suggestion, jamais imposée. */
export const systemLang: Lang = navigator.language?.toLowerCase().startsWith("en") ? "en" : "fr";

/** Retient la langue choisie ; l'interface se recharge pour l'appliquer partout. */
export function chooseLang(l: Lang) {
  localStorage.setItem(LANG_KEY, l);
  window.location.reload();
}

/** Phrase dans une langue donnée (écran du choix de la langue, qui montre les deux). */
export function tIn(l: Lang, key: MessageKey): string {
  const text = key.split(".").reduce<unknown>((o, k) => (o as Record<string, unknown>)?.[k], ALL[l]);
  return typeof text === "string" ? text : key;
}

export const lang: Lang = savedLang() ?? systemLang;
const messages = ALL[lang];

export function t(key: MessageKey, vars?: Record<string, string | number>): string {
  let text = key.split(".").reduce<unknown>((o, k) => (o as Record<string, unknown>)?.[k], messages);
  if (typeof text !== "string") text = key;
  return vars ? (text as string).replace(/\{(\w+)\}/g, (_, v) => String(vars[v] ?? `{${v}}`)) : (text as string);
}

/** Date lisible dans la langue de l'interface (« dimanche 16 novembre »). */
export function longDate(d = new Date()): string {
  return d.toLocaleDateString(lang === "fr" ? "fr-FR" : "en-GB", { weekday: "long", day: "numeric", month: "long" });
}
