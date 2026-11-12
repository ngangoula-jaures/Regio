// Test du serveur Rust de l'application (à lancer SOUS WINDOWS, application Regio démarrée) :
//   scripts/win.sh node tests/e2e/rust-server.test.mjs
// Vérifie les pages servies et les protections de la signalisation.
import https from "node:https";
import http from "node:http";
import WebSocket from "ws";

const LOCAL = "http://127.0.0.1:47811";
const PHONE = "https://127.0.0.1:47812";
const insecure = new https.Agent({ rejectUnauthorized: false }); // certificat auto-signé
let failed = 0;
const check = (ok, msg) => { console.log(ok ? "✓" : "✗", msg); if (!ok) failed++; };

function get(url) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith("https") ? https : http;
    lib.get(url, url.startsWith("https") ? { agent: insecure } : {}, (res) => {
      let body = ""; res.on("data", (c) => (body += c)); res.on("end", () => resolve({ status: res.statusCode, type: res.headers["content-type"] ?? "", body }));
    }).on("error", reject);
  });
}

/** Ouvre la signalisation, envoie join, renvoie le 1er message reçu ou le code de fermeture. */
function join(url, msg) {
  return new Promise((resolve) => {
    const ws = new WebSocket(url, { rejectUnauthorized: false });
    const t = setTimeout(() => { resolve({ timeout: true }); ws.close(); }, 4000);
    ws.on("open", () => ws.send(JSON.stringify(msg)));
    ws.on("message", (d) => { clearTimeout(t); resolve({ msg: JSON.parse(d), ws }); });
    ws.on("close", (code) => { clearTimeout(t); resolve({ closed: code }); });
    ws.on("error", () => {});
  });
}

const r1 = await get(`${LOCAL}/render.html`);
check(r1.status === 200 && r1.type.includes("text/html") && r1.body.includes("render"), `page d'affichage pour OBS (${r1.status})`);
const r2 = await get(`${LOCAL}/receiver.html`);
check(r2.status === 200 && r2.body.includes("receiver"), `page réceptrice pour OBS (${r2.status})`);
const js = r1.body.match(/src="([^"]+\.js)"/)?.[1];
const r3 = js ? await get(`${LOCAL}${js}`) : { status: 0, type: "" };
check(r3.status === 200 && r3.type.includes("javascript"), `script de la page servi (${js} → ${r3.status}, ${r3.type})`);
const r4 = await get(`${PHONE}/phone.html`);
check(r4.status === 200 && r4.body.includes("phone"), `page du téléphone en HTTPS (${r4.status})`);
const r5 = await get(`${PHONE}/regio/info`);
check(r5.status === 404, `informations internes NON exposées sur le Wi-Fi (${r5.status})`);

const a = await join(`ws://127.0.0.1:47811/regio/signal`, { type: "join", role: "receiver", cam: "test" });
check(a.msg?.type === "peer" && a.msg.present === false, "récepteur accepté depuis le PC");
const b = await join(`wss://127.0.0.1:47812/regio/signal`, { type: "join", role: "phone", cam: "test", key: "mauvaise-cle" });
check(b.closed === 4003, `téléphone avec une mauvaise clé refusé (code ${b.closed})`);
const c = await join(`wss://127.0.0.1:47812/regio/signal`, { type: "join", role: "phone", cam: "test" });
check(c.closed === 4003, `téléphone sans clé refusé (code ${c.closed})`);
const d = await join(`wss://127.0.0.1:47812/regio/signal`, { type: "join", role: "receiver", cam: "test" });
check(d.closed === 4003, `récepteur depuis le Wi-Fi refusé (code ${d.closed})`);
const e = await join(`ws://127.0.0.1:47811/regio/signal`, { type: "join", role: "phone", cam: "test", key: "x" });
check(e.closed === 4003, `téléphone sur le serveur local refusé (code ${e.closed})`);
a.ws?.close();

console.log(failed ? `${failed} ÉCHEC(S)` : "TOUS LES TESTS PASSENT");
process.exit(failed ? 1 : 0);
