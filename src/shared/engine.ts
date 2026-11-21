// Moteur vidéo embarqué (OBS géré par l'application de bureau, voir src-tauri/src/obs.rs).

import { invoke } from "@tauri-apps/api/core";

export type EngineState =
  | { state: "preparing" }
  | { state: "downloading"; progress: number }
  | { state: "installing"; progress: number }
  | { state: "starting" }
  | { state: "running"; port: number; password: string }
  | { state: "error"; message: string };

export function getEngineState(): Promise<EngineState> {
  return invoke<EngineState>("obs_status");
}

/**
 * Télé de la salle : `shown` = la projection de Regio passe devant les autres fenêtres de la télé (une page étendue
 * peut ensuite repasser devant) ; sinon elle est cachée. Renvoie le nombre de fenêtres de projection trouvées.
 */
export function roomScreen(shown: boolean | null): Promise<number> {
  return invoke<number>("room_screen", { shown });
}
