// Accès au serveur local de Regio, depuis l'interface de la régie.
// - Application de bureau (Tauri) : serveur Rust intégré, interrogé par une commande Tauri.
// - Navigateur (npm run dev) : plugin Vite `server/phone-bridge.ts`.

import { invoke } from "@tauri-apps/api/core";

export interface ServerInfo {
  /** Adresse des pages chargées par OBS (render.html, receiver.html). */
  localBase: string;
  phonePort: number | null;
  phoneError?: string | null;
  lanIps: string[];
  /** Clé secrète à mettre dans le QR code (application de bureau uniquement). */
  key?: string;
  rooms: Record<string, { phone: boolean; receiver: boolean }>;
}

export const inTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export async function getServerInfo(): Promise<ServerInfo> {
  if (inTauri) return invoke<ServerInfo>("server_info");
  const res = await fetch("/regio/info");
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const d = await res.json();
  return { localBase: window.location.origin, phonePort: d.phonePort, lanIps: d.lanIps, rooms: d.rooms };
}

/** Adresse ouverte par le téléphone (contenu du QR code). */
export function phoneUrl(info: ServerInfo, ip: string, cam: string): string {
  const params = new URLSearchParams({ cam });
  if (info.key) params.set("k", info.key);
  return `https://${ip}:${info.phonePort}/phone.html?${params}`;
}
