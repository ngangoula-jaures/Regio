// Moteur vidéo embarqué (OBS géré par l'application de bureau, voir src-tauri/src/obs.rs).

import { invoke } from "@tauri-apps/api/core";

export type EngineState =
  | { state: "preparing" }
  | { state: "downloading"; progress: number }
  | { state: "installing" }
  | { state: "starting" }
  | { state: "running"; port: number; password: string }
  | { state: "error"; message: string };

export function getEngineState(): Promise<EngineState> {
  return invoke<EngineState>("obs_status");
}
