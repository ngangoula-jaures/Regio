// Mises à jour automatiques (application de bureau) : vérifiées au démarrage s'il y a Internet, PROPOSÉES
// à l'utilisateur sur l'écran de démarrage (jamais pendant un direct), signées (clé de Regio) et vérifiées avant
// installation. Le paquet de mise à jour est léger : le moteur vidéo, déjà installé, n'est pas retéléchargé.

import { check, type Update } from "@tauri-apps/plugin-updater";
import { getVersion } from "@tauri-apps/api/app";
import { inTauri } from "./server";

export type { Update };

/** Version installée (null hors application de bureau). */
export async function appVersion(): Promise<string | null> {
  return inTauri ? getVersion().catch(() => null) : null;
}

/** Nouvelle version disponible, ou null (pas d'Internet, déjà à jour, mode navigateur…). Ne lève jamais. */
export async function findUpdate(): Promise<Update | null> {
  if (!inTauri) return null;
  try {
    return await check({ timeout: 8000 });
  } catch {
    return null;
  }
}

/** Télécharge (progression de 0 à 1) puis installe : Regio se ferme et l'installeur s'occupe du reste. */
export async function installUpdate(update: Update, onProgress: (p: number | null) => void): Promise<void> {
  let total = 0;
  let done = 0;
  await update.downloadAndInstall((e) => {
    if (e.event === "Started") total = e.data.contentLength ?? 0;
    else if (e.event === "Progress") {
      done += e.data.chunkLength;
      onProgress(total ? done / total : null);
    } else onProgress(1);
  });
}
