// Enregistrement local : fichiers dans le dossier de Regio (application de bureau),
// ou stockage du navigateur (mode développement).

import { invoke } from "@tauri-apps/api/core";
import { inTauri } from "./server";

export async function loadDoc<T>(name: string): Promise<T | null> {
  try {
    const raw = inTauri ? await invoke<string | null>("load_data", { name }) : localStorage.getItem(`regio.data.${name}`);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export async function saveDoc(name: string, value: unknown): Promise<void> {
  const json = JSON.stringify(value);
  if (inTauri) await invoke("save_data", { name, json });
  else localStorage.setItem(`regio.data.${name}`, json);
}

/**
 * Range une image importée (déjà réduite en JPEG) et renvoie son adresse utilisable par la page
 * d'affichage d'OBS. Application de bureau : vrai fichier, servi par le serveur local.
 */
export async function storeImage(dataUrl: string, localBase: string): Promise<string> {
  if (!inTauri) return dataUrl;
  const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
  const file = await invoke<string>("save_media", { base64, ext: "jpg" });
  return `${localBase}/media/${file}`;
}

/** Formats de présentation que PowerPoint sait ouvrir. */
export const PRESENTATION_ACCEPT = ".pptx,.ppt,.pptm,.ppsx,.pps,.ppsm,.potx,.odp";

/** Erreurs connues de l'import (traduites par l'interface). */
export type ImportError = "NOPOWERPOINT" | "FORMAT" | "EMPTY" | "TIMEOUT" | "OTHER";

/**
 * Import « fidèle » d'une présentation : PowerPoint exporte chaque diapo en image HD (application
 * de bureau uniquement). `onProgress(done, total)` suit l'avancement. Renvoie les adresses des images.
 */
export async function importPresentation(
  file: File,
  localBase: string,
  onProgress: (done: number, total: number) => void,
): Promise<{ name: string; slides: string[] }> {
  const { listen } = await import("@tauri-apps/api/event");
  const stop = await listen<{ done: number; total: number }>("pptx-progress", (e) => onProgress(e.payload.done, e.payload.total));
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const r = await invoke<{ name: string; slides: string[] }>("import_pptx", bytes, { headers: { "x-file-name": encodeURIComponent(file.name) } });
    return { name: r.name || file.name, slides: r.slides.map((f) => `${localBase}/media/${f}`) };
  } finally {
    stop();
  }
}

export function importErrorKind(e: unknown): ImportError {
  const msg = String(e instanceof Error ? e.message : e);
  return (["NOPOWERPOINT", "FORMAT", "EMPTY", "TIMEOUT"] as const).find((k) => msg === k) ?? "OTHER";
}
