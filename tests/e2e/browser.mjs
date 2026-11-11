// Lancement de Chromium pour les tests de bout en bout.
// Navigateur : variable CHROMIUM_PATH, sinon le dernier « headless shell » installé par Playwright.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium } from "playwright-core";

function findChromium() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  const root = path.join(os.homedir(), ".cache", "ms-playwright");
  const dirs = fs.existsSync(root) ? fs.readdirSync(root).filter((d) => d.startsWith("chromium_headless_shell-")).sort().reverse() : [];
  for (const d of dirs) {
    const exe = path.join(root, d, "chrome-headless-shell-linux64", "chrome-headless-shell");
    if (fs.existsSync(exe)) return exe;
  }
  throw new Error("Chromium introuvable : définir CHROMIUM_PATH");
}

export function launch(extraArgs = []) {
  return chromium.launch({ executablePath: findChromium(), args: extraArgs });
}

export const BASE = process.env.DIFFCHURCH_URL ?? "http://localhost:1420";
export const PHONE_BASE = process.env.DIFFCHURCH_PHONE_URL ?? "https://127.0.0.1:8443";
