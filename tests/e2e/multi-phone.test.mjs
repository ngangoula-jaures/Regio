// Test : plusieurs téléphones comme caméras (Sources du jour + rangée des caméras de la régie).
// Prérequis : `npm run dev` lancé. Caméras des téléphones simulées par Chromium.
import { launch, BASE, PHONE_BASE } from "./browser.mjs";
import { startFakeObs } from "./fake-obs.mjs";

const obs = startFakeObs(4467);
const browser = await launch(["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"]);
const fail = async (msg) => {
  console.error("ÉCHEC :", msg);
  await browser.close();
  obs.close();
  process.exit(1);
};
const check = async (cond, msg) => (cond ? console.log("✓", msg) : fail(msg));
// Chaque téléphone = un appareil distinct (contexte séparé → identifiant d'appareil différent).
const startPhone = async (cam) => {
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true, permissions: ["camera", "microphone"], locale: "fr-FR" });
  const p = await ctx.newPage();
  await p.goto(`${PHONE_BASE}/phone.html?cam=${cam}`);
  await p.click("text=Démarrer la caméra");
  return p;
};

// Le faux OBS ne charge pas les pages : on ouvre nous-mêmes une page réceptrice par source téléphone créée.
const receivers = new Map();
const recvCtx = await browser.newContext();
const syncReceivers = setInterval(async () => {
  for (const i of obs.state.inputs) {
    const id = i.inputName.match(/^Regio - Téléphone QR (\d+)$/)?.[1];
    if (!id || receivers.has(id)) continue;
    receivers.set(id, null);
    const r = await recvCtx.newPage();
    await r.goto(`${BASE}/receiver.html?cam=${id}`);
    receivers.set(id, r);
  }
}, 300);

try {
  const app = await (await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "fr-FR" })).newPage();
  await app.addInitScript(() => localStorage.getItem("regio.lang") || localStorage.setItem("regio.lang", "fr")); // langue déjà choisie
  await app.goto(BASE);
  await app.evaluate(() => localStorage.clear());
  await app.reload();
  await app.fill("#port", "4467");
  await app.click("text=Se connecter");
  await app.click("button:has-text('Choisir les caméras du jour'):not([disabled])", { timeout: 8000 });
  await app.waitForSelector(".cam:has-text('Téléphone 1')", { timeout: 8000 });
  await check(true, "sources : QR code du « Téléphone 1 »");

  const phoneA = await startPhone("1");
  await app.waitForSelector(".cam-name:text-is('Téléphone 1')", { timeout: 10000 });
  await app.waitForSelector("text=Ajouter un téléphone (2)", { timeout: 10000 });
  await phoneA.waitForSelector(".status.live", { timeout: 10000 });
  await check(true, "téléphone 1 connecté → nouveau QR code pour un 2e téléphone");

  // Cas réel : le 2e téléphone a scanné le MÊME QR code (« Téléphone 1 ») que le premier.
  const phoneB = await startPhone("1");
  await phoneB.waitForSelector(".cam-name:text-is('Téléphone 2')", { timeout: 10000 });
  await phoneB.waitForSelector(".status.live", { timeout: 10000 });
  await check(true, "2e téléphone sur le même QR code → la régie lui donne la place n° 2");
  await phoneA.waitForTimeout(1500);
  await check((await phoneA.locator(".status.live").count()) === 1 && (await phoneA.locator(".cam-name").textContent()) === "Téléphone 1", "le 1er téléphone n'est PAS déconnecté");
  await app.waitForSelector(".cam-name:text-is('Téléphone 2')", { timeout: 10000 });
  await app.waitForSelector("text=Ajouter un téléphone (3)", { timeout: 10000 });
  const qr = obs.state.inputs.filter((i) => i.inputName.startsWith("Regio - Téléphone QR")).map((i) => i.inputName);
  await check(qr.length === 3, `chaque téléphone a sa réception dans le moteur vidéo (${qr.join(", ")})`);

  // Coupure réseau du 1er téléphone (page rechargée) : il retrouve SA place, pas celle d'un autre.
  await phoneA.reload();
  await phoneA.click("text=Démarrer la caméra");
  await phoneA.waitForSelector(".status.live", { timeout: 10000 });
  await check((await phoneA.locator(".cam-name").textContent()) === "Téléphone 1" && (await phoneB.locator(".status.live").count()) === 1, "après une coupure, le téléphone 1 reprend sa place sans gêner le 2");

  await app.click(".cam:has-text('Cam Link 4K') >> text=Utiliser cette caméra");
  await app.waitForSelector(".cam:not(.is-off):has-text('Cam Link 4K')");
  await app.click("role=button[name='Commencer']");
  await app.click(".template-card:has-text(\"Un culte d'église\")");
  await app.waitForSelector(".cam-tile:has-text('Téléphone 2')");
  await app.click(".cam-tile:has-text('Téléphone 2')");
  await app.waitForSelector(".cam-tile.is-on:has-text('Téléphone 2')");
  const on = obs.state.items["Regio - Sortie"].filter((i) => i.sceneItemEnabled && !["Regio - Fond", "Regio - Contenu", "Regio - Son"].includes(i.sourceName)).map((i) => i.sourceName);
  await check(on.length === 1 && on[0] === "Regio - Téléphone QR 2", `régie : bascule sur le téléphone 2 (${on.join(", ")})`);
  // --- Le son suit l'image ; « Garder ce son » ---
  const mutes = () => obs.state.mutes ?? {};
  // Le moteur vidéo reçoit les ordres un instant après l'écran : on attend que l'état soit atteint.
  const until = async (cond, ms = 4000) => { for (const end = Date.now() + ms; Date.now() < end; await new Promise((r) => setTimeout(r, 100))) if (cond()) return true; return cond(); };
  const item = (n) => obs.state.items["Regio - Sortie"].find((i) => i.sourceName === n);
  await check(await until(() => mutes()["Regio - Téléphone QR 2"] === false && mutes()["Regio - Son"] === true && mutes()["Regio - Téléphone QR 1"] === true),
    "son qui suit l'image : téléphone 2 affiché → on entend le téléphone 2 seulement (PC et téléphone 1 coupés)");
  await app.hover(".cam-tile-wrap:has-text('Téléphone 1')");
  await app.click(".cam-tile-wrap:has-text('Téléphone 1') .keep-btn");
  await app.waitForSelector(".sound-state.is-kept:has-text('Son gardé : Téléphone 1')");
  await check(await until(() => item("Regio - Téléphone QR 1").sceneItemEnabled && item("Regio - Téléphone QR 1").transform?.positionX >= 1920 && mutes()["Regio - Téléphone QR 1"] === false && mutes()["Regio - Téléphone QR 2"] === true),
    "« Garder ce son » sur le téléphone 1 : son son passe, son image reste hors du cadre ; le téléphone 2 (affiché) est coupé");
  await app.click(".cam-tile:has-text('Cam Link 4K')");
  await app.waitForSelector(".cam-tile.is-on:has-text('Cam Link 4K')");
  await check(await until(() => mutes()["Regio - Son"] === true && mutes()["Regio - Téléphone QR 1"] === false && item("Regio - Téléphone QR 1").sceneItemEnabled),
    "on montre une autre caméra (celle du PC) : on entend TOUJOURS le téléphone 1");
  await app.click(".sound-state >> text=Libérer");
  await app.waitForSelector(".sound-state:has-text(\"Son : suit l'image\")");
  await check(await until(() => mutes()["Regio - Son"] === false && !item("Regio - Téléphone QR 1").sceneItemEnabled),
    "« Libérer » : le son suit de nouveau l'image (caméra du PC → son du PC)");
  // --- Jamais d'écran noir : le téléphone à l'écran se déconnecte → bascule automatique + message ---
  await app.click(".cam-tile:has-text('Téléphone 2')");
  await app.waitForSelector(".cam-tile.is-on:has-text('Téléphone 2')");
  await phoneB.context().close();
  await app.waitForSelector("text=« Téléphone 2 » s'est déconnectée : Regio a basculé sur", { timeout: 20000 });
  const onAfter = obs.state.items["Regio - Sortie"].filter((i) => i.sceneItemEnabled && i.sourceName.startsWith("Regio - Caméra")).map((i) => i.sourceName);
  await check(onAfter.length === 1, `téléphone à l'écran déconnecté : Regio bascule tout seul sur une autre caméra (${onAfter.join(", ")}) et prévient`);
  console.log("TOUS LES TESTS PASSENT");
  clearInterval(syncReceivers);
} catch (e) {
  await fail(e.message);
}
await browser.close();
obs.close();
