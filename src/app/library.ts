// Les moments du culte (« compartiments ») et leurs contenus, propres à chaque église,
// plus la médiathèque. Enregistrés sur le PC et retrouvés d'un dimanche à l'autre.

import { useCallback, useEffect, useRef, useState } from "react";
import { t, type MessageKey } from "../i18n";
import type { Content } from "../shared/content";
import { loadDoc, saveDoc } from "../shared/storage";

export interface PlanItem {
  id: string;
  label: string;
  content: Content;
}
export interface Moment {
  id: string;
  name: string;
  items: PlanItem[];
}
export interface MediaEntry {
  id: string;
  name: string;
  src: string;
}
export interface Library {
  version: 1;
  moments: Moment[];
  media: MediaEntry[];
}

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

export type KindKey = "standby" | "camera" | "lower" | "full" | "fullText" | "poster" | "slides";
export function kindOf(c: Content): KindKey {
  switch (c.kind) {
    case "standby":
      return "standby";
    case "none":
      return "camera";
    case "image":
      return "poster";
    case "slides":
      return "slides";
    case "verse":
      return c.layout === "lower" ? "lower" : "full";
    case "text":
      return c.layout === "lower" ? "lower" : "fullText";
  }
}
export const kindLabel = (c: Content) => (c.kind === "slides" ? t("kinds.slides", { n: c.slides.length }) : t(`kinds.${kindOf(c)}` as MessageKey));

export function standby(): Content {
  return { kind: "standby", title: t("defaults.standbyTitle"), subtitle: t("defaults.standbySubtitle") };
}

/** Déroulé de départ pour une nouvelle église (modifiable : ajouter, renommer, supprimer). */
function defaultLibrary(): Library {
  const camera = (label: string): PlanItem => ({ id: uid(), label, content: { kind: "none" } });
  const text = (label: string, title: string, body: string, layout: "lower" | "full" = "full"): PlanItem => ({
    id: uid(),
    label,
    content: { kind: "text", layout, title, body },
  });
  return {
    version: 1,
    media: [],
    moments: [
      { id: uid(), name: t("defaults.welcome"), items: [{ id: uid(), label: t("kinds.standby"), content: standby() }] },
      { id: uid(), name: t("defaults.worship"), items: [camera(t("kinds.camera"))] },
      { id: uid(), name: t("defaults.adoration"), items: [camera(t("kinds.camera"))] },
      { id: uid(), name: t("defaults.sermon"), items: [text(t("defaults.sermonTitle"), t("defaults.sermon"), t("defaults.sermonTitleText"), "lower")] },
      { id: uid(), name: t("defaults.offering"), items: [text(t("defaults.offeringLabel"), t("defaults.offering"), t("defaults.offeringText"))] },
      { id: uid(), name: t("defaults.announcements"), items: [text(t("defaults.announcement"), t("defaults.announcements"), t("defaults.announcementText"))] },
      { id: uid(), name: t("defaults.blessing"), items: [camera(t("kinds.camera"))] },
    ],
  };
}

const DOC = "library";

/** Bibliothèque chargée au démarrage, enregistrée automatiquement à chaque modification. */
export function useLibrary() {
  const [lib, setLib] = useState<Library | null>(null);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    loadDoc<Library>(DOC).then((saved) => setLib(saved && saved.version === 1 ? saved : defaultLibrary()));
  }, []);

  const update = useCallback((fn: (l: Library) => Library) => {
    setLib((cur) => {
      if (!cur) return cur;
      const next = fn(cur);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => saveDoc(DOC, next).catch(() => {}), 300);
      return next;
    });
  }, []);

  return { lib, update };
}
