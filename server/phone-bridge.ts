// Pont « caméra téléphone sans application » (mode développement, branché sur Vite).
//
//  Téléphone (navigateur) ──HTTPS + wss──▶ ce serveur ◀──ws── page réceptrice dans OBS
//          └──────────────── vidéo WebRTC directe sur le Wi-Fi ───────────────┘
//
// Le serveur ne transporte que la mise en relation (signalisation) : la vidéo passe en direct
// du téléphone à OBS. HTTPS est obligatoire : les navigateurs n'autorisent la caméra que sur
// une origine sécurisée. Certificat auto-signé conservé dans .cert/ (le téléphone l'accepte une fois).
//
// TODO Tauri : réimplémenter ce pont côté Rust pour l'application installée.

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import https from "node:https";
import { execFile } from "node:child_process";
import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import type { Plugin, ViteDevServer } from "vite";
import { WebSocketServer, WebSocket } from "ws";
import { generate } from "selfsigned";

export const PHONE_HTTPS_PORT = 8443;
export const SIGNAL_PATH = "/regio/signal";
export const INFO_PATH = "/regio/info";
const CLOSE_REPLACED = 4000; // identique à src/shared/signal.ts

type Role = "phone" | "receiver";

interface Room {
  phone?: WebSocket;
  receiver?: WebSocket;
}

// ---------- Signalisation ----------

const rooms = new Map<string, Room>();

function send(ws: WebSocket | undefined, msg: unknown) {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}

function other(role: Role): Role {
  return role === "phone" ? "receiver" : "phone";
}

function handleSignalConnection(ws: WebSocket) {
  let cam: string | null = null;
  let role: Role | null = null;

  ws.on("message", (raw) => {
    let msg: { type?: string; role?: Role; cam?: string };
    try {
      msg = JSON.parse(String(raw));
    } catch {
      return;
    }
    if (msg.type === "join" && (msg.role === "phone" || msg.role === "receiver")) {
      cam = String(msg.cam ?? "1");
      role = msg.role;
      const room = rooms.get(cam) ?? {};
      rooms.set(cam, room);
      // Une seule connexion par rôle : la plus récente remplace l'ancienne.
      if (room[role] && room[role] !== ws) room[role]!.close(CLOSE_REPLACED, "remplacé");
      room[role] = ws;
      send(ws, { type: "peer", present: Boolean(room[other(role)]) });
      send(room[other(role)], { type: "peer", present: true });
      return;
    }
    // Tout le reste (offer / answer / candidate) est relayé tel quel à l'autre côté.
    if (cam && role) send(rooms.get(cam)?.[other(role)], msg);
  });

  ws.on("close", () => {
    if (!cam || !role) return;
    const room = rooms.get(cam);
    if (room?.[role] === ws) {
      delete room[role];
      send(room[other(role)], { type: "peer", present: false });
    }
  });
}

type UpgradeServer = { on(event: "upgrade", cb: (req: IncomingMessage, socket: Duplex, head: Buffer) => void): unknown };

/**
 * @param rejectOthers Fermer immédiatement les autres websockets. Indispensable sur le serveur du
 *   téléphone : le client HMR de Vite y resterait « en connexion » indéfiniment, et Chrome n'ouvre
 *   qu'un websocket à la fois vers une même adresse → notre signalisation serait bloquée derrière.
 */
function attachSignaling(server: UpgradeServer, wss: WebSocketServer, rejectOthers: boolean) {
  server.on("upgrade", (req, socket, head) => {
    if (req.url?.startsWith(SIGNAL_PATH)) {
      wss.handleUpgrade(req, socket, head, (ws) => handleSignalConnection(ws));
    } else if (rejectOthers) {
      socket.destroy();
    } // sinon : laisser Vite gérer son propre websocket (HMR)
  });
}

// ---------- Adresse du PC sur le réseau local ----------

const isWsl = (() => {
  try {
    return /microsoft/i.test(fs.readFileSync("/proc/version", "utf8"));
  } catch {
    return false;
  }
})();

function localIps(): string[] {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter((i): i is os.NetworkInterfaceInfo => Boolean(i && i.family === "IPv4" && !i.internal))
    .map((i) => i.address);
}

/** Sous WSL, l'adresse utile est celle de Windows (celle que le téléphone peut joindre). */
function windowsLanIps(): Promise<string[]> {
  return new Promise((resolve) => {
    execFile(
      "powershell.exe",
      [
        "-NoProfile",
        "-Command",
        // ~1 s (Get-NetIPConfiguration en prend ~9) ; seulement les adresses actives attribuées par la box ou fixes.
        "Get-NetIPAddress -AddressFamily IPv4 -AddressState Preferred -PrefixOrigin Dhcp,Manual -ErrorAction SilentlyContinue | Where-Object { $_.InterfaceAlias -notmatch 'vEthernet|Loopback' } | ForEach-Object { $_.IPAddress }",
      ],
      { timeout: 20000 },
      (err, stdout) => resolve(err ? [] : stdout.split(/\s+/).filter((s) => /^\d+\.\d+\.\d+\.\d+$/.test(s))),
    );
  });
}

/**
 * Adresse(s) Wi-Fi du PC, pour le QR code. Elle peut changer (attribuée par la box) :
 * mémorisée 30 s seulement, et un résultat vide n'est jamais gardé.
 */
let lanIpsCache: { at: number; ips: Promise<string[]> } | null = null;
function lanIps(): Promise<string[]> {
  const forced = process.env.REGIO_LAN_IP;
  if (forced) return Promise.resolve([forced]);
  if (lanIpsCache && Date.now() - lanIpsCache.at < 30_000) return lanIpsCache.ips;
  const ips = isWsl ? windowsLanIps() : Promise.resolve(localIps());
  lanIpsCache = { at: Date.now(), ips };
  ips.then((list) => {
    if (list.length === 0) lanIpsCache = null;
  });
  return ips;
}

// ---------- Certificat ----------

async function loadOrCreateCert(root: string): Promise<{ key: string; cert: string }> {
  const dir = path.join(root, ".cert");
  const keyFile = path.join(dir, "phone-key.pem");
  const certFile = path.join(dir, "phone-cert.pem");
  if (fs.existsSync(keyFile) && fs.existsSync(certFile)) {
    return { key: fs.readFileSync(keyFile, "utf8"), cert: fs.readFileSync(certFile, "utf8") };
  }
  const ips = await lanIps();
  const notAfter = new Date();
  notAfter.setFullYear(notAfter.getFullYear() + 5);
  const pems = await generate([{ name: "commonName", value: "Regio" }], {
    keyType: "ec",
    algorithm: "sha256",
    notAfterDate: notAfter,
    extensions: [
      { name: "basicConstraints", cA: false },
      { name: "keyUsage", digitalSignature: true, keyEncipherment: true },
      { name: "subjectAltName", altNames: [{ type: 2, value: "localhost" }, ...ips.map((ip) => ({ type: 7 as const, ip }))] },
    ],
  });
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(keyFile, pems.private);
  fs.writeFileSync(certFile, pems.cert);
  return { key: pems.private, cert: pems.cert };
}

// ---------- Plugin Vite ----------

/** Survit aux rechargements du module (stocké sur globalThis). */
const previous: { close?: () => Promise<void> } = ((globalThis as Record<string, unknown>).__regioPhoneBridge ??= {}) as {
  close?: () => Promise<void>;
};

export function phoneBridge(): Plugin {
  return {
    name: "regio-phone-bridge",
    apply: "serve",
    async configureServer(server: ViteDevServer) {
      const wss = new WebSocketServer({ noServer: true });
      if (server.httpServer) attachSignaling(server.httpServer, wss, false);

      // Informations pour la régie : adresse du téléphone + qui est connecté.
      server.middlewares.use(INFO_PATH, async (_req, res) => {
        const ips = await lanIps();
        const status = Object.fromEntries([...rooms].map(([cam, r]) => [cam, { phone: Boolean(r.phone), receiver: Boolean(r.receiver) }]));
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ lanIps: ips, phonePort: PHONE_HTTPS_PORT, rooms: status }));
      });

      // Serveur HTTPS pour le téléphone, qui réutilise les pages servies par Vite.
      // Quand Vite redémarre (config modifiée), ce module est rechargé : on ferme d'abord
      // le serveur de l'instance précédente, sinon le port 8443 resterait occupé.
      await previous.close?.();
      const { key, cert } = await loadOrCreateCert(server.config.root);
      const phoneServer = https.createServer({ key, cert }, server.middlewares);
      attachSignaling(phoneServer, wss, true);
      const closeAll = () =>
        new Promise<void>((resolve) => {
          wss.clients.forEach((c) => c.terminate());
          wss.close();
          phoneServer.closeAllConnections();
          phoneServer.close(() => resolve());
        });
      previous.close = closeAll;
      server.httpServer?.on("close", () => void closeAll());

      const log = server.config.logger;
      const listen = (attempt: number) => {
        phoneServer.once("error", (e: NodeJS.ErrnoException) => {
          if (e.code === "EADDRINUSE" && attempt < 10) setTimeout(() => listen(attempt + 1), 300);
          else log.error(`[téléphone] ${e.message}`);
        });
        phoneServer.listen(PHONE_HTTPS_PORT, "0.0.0.0", async () => {
          const ips = await lanIps();
          log.info(`  📱 Caméra téléphone : ${ips.map((ip) => `https://${ip}:${PHONE_HTTPS_PORT}/phone.html`).join("  ") || "(adresse Wi-Fi introuvable)"}`);
        });
      };
      listen(0);
    },
  };
}
