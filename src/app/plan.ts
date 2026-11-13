// Déroulé du culte. Phase 1 : il sera préparé dans la semaine et enregistré (SQLite).
// En attendant, un déroulé d'exemple montre le fonctionnement (textes entre crochets à remplacer).

import { t, type MessageKey } from "../i18n";
import { SAMPLE_VERSES } from "../shared/bible-sample";
import type { Content } from "../shared/content";

export interface PlanItem {
  id: string;
  moment: string;
  label: string;
  content: Content;
}

export type KindKey = "standby" | "camera" | "lower" | "full" | "fullText" | "poster";

export function kindOf(c: Content): KindKey {
  switch (c.kind) {
    case "standby":
      return "standby";
    case "none":
      return "camera";
    case "image":
      return "poster";
    case "verse":
      return c.layout === "lower" ? "lower" : "full";
    case "text":
      return c.layout === "lower" ? "lower" : "fullText";
  }
}

export const kindLabel = (c: Content) => t(`kinds.${kindOf(c)}` as MessageKey);

function verse(ref: string, layout: "lower" | "full"): Content {
  const v = SAMPLE_VERSES.find((x) => x.reference === ref)!;
  return { kind: "verse", layout, reference: v.reference, text: v.text, version: v.version };
}

export function standby(): Content {
  return { kind: "standby", title: t("panels.standbyTitle"), subtitle: t("panels.standbySubtitle") };
}

export function samplePlan(): PlanItem[] {
  const camera: Content = { kind: "none" };
  return [
    { id: "accueil", moment: t("plan.welcome"), label: t("kinds.standby"), content: standby() },
    { id: "louange", moment: t("plan.worship"), label: t("plan.worship"), content: camera },
    { id: "priere", moment: t("plan.prayer"), label: t("plan.openingPrayer"), content: camera },
    { id: "lecture", moment: t("plan.reading"), label: "Psaume 23:1", content: verse("Psaume 23:1", "full") },
    { id: "titre", moment: t("plan.sermon"), label: t("plan.sermonTitle"), content: { kind: "text", layout: "lower", title: t("plan.sermon"), body: t("plan.sermonTitleText") } },
    { id: "jean316", moment: t("plan.sermon"), label: "Jean 3:16", content: verse("Jean 3:16", "lower") },
    { id: "phil413", moment: t("plan.sermon"), label: "Philippiens 4:13", content: verse("Philippiens 4:13", "full") },
    { id: "offrandes", moment: t("plan.offering"), label: t("plan.offeringLabel"), content: { kind: "text", layout: "full", title: t("plan.offeringTitle"), body: t("plan.offeringText") } },
    { id: "annonce", moment: t("plan.announcements"), label: t("plan.announcement"), content: { kind: "text", layout: "full", title: t("plan.announcements"), body: t("plan.announcementText") } },
    { id: "benediction", moment: t("plan.blessing"), label: t("plan.blessing"), content: camera },
  ];
}
