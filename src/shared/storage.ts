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
