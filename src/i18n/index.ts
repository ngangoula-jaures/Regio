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

function detect(): Lang {
  try {
    const saved = localStorage.getItem("regio.lang");
    if (saved === "fr" || saved === "en") return saved;
  } catch {
    /* ignore */
  }
  return navigator.language?.toLowerCase().startsWith("en") ? "en" : "fr";
}

export const lang: Lang = detect();
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
