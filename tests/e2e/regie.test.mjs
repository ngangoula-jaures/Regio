// Test : régie ↔ faux OBS ↔ page d'affichage. Prérequis : `npm run dev` lancé.
import { launch, BASE } from "./browser.mjs";
import { startFakeObs } from "./fake-obs.mjs";

const SCENE = "DiffChurch - Sortie";
const obs = startFakeObs(4466);
const browser = await launch();
const errors = [];
const fail = async (msg) => {
  console.error("ÉCHEC :", msg);
  await browser.close();
  obs.close();
  process.exit(1);
};
const check = async (cond, msg) => (cond ? console.log("✓", msg) : fail(msg));

try {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const control = await ctx.newPage();
  control.on("pageerror", (e) => errors.push("régie : " + e.message));
  await control.goto(BASE);
  await control.fill('input[type="number"]', "4466");
  await control.click("text=Se connecter et préparer OBS");
  await control.waitForSelector("text=Caméra seule");
  await check(obs.state.scenes.includes(SCENE), "scène de sortie créée");

  // Verset envoyé AVANT l'ouverture de la page d'affichage → récupéré via « hello ».
  const overlay = obs.state.inputs.find((i) => i.inputName === "DiffChurch - Contenu");
  const render = await ctx.newPage();
  render.on("pageerror", (e) => errors.push("affichage : " + e.message));
  await render.setViewportSize({ width: 1920, height: 1080 });
  await control.click("text=Plein écran");
  await control.click("text=Jean 3:16");
  await render.goto(overlay.settings.url.replace("port=4455", "port=4466"));
  await render.waitForSelector(".verse-text", { timeout: 5000 });
  await check(true, "la page d'affichage récupère le contenu en cours");
  await control.waitForSelector(".render-status.ok", { timeout: 5000 });
  await check(true, "la régie voit la page d'affichage connectée");

  await control.click("text=Bandeau (caméra visible)");
  await control.click("text=Psaume 23:1");
  await render.waitForSelector(".lower-title:has-text('Psaume 23:1')");
  await render.waitForTimeout(600);
  await check((await render.locator(".layer").count()) === 1, "fondu terminé, un seul calque");

  await control.click("text=Détecter les caméras USB / HDMI");
  await control.click("text=Cam Link 4K");
  await control.waitForSelector(".row.active");
  const order = obs.state.items[SCENE].map((i) => i.sourceName);
  await check(order[0] === "DiffChurch - Fond" && order.at(-1) === "DiffChurch - Contenu", `ordre des calques : ${order.join(" | ")}`);

  await control.click("text=Téléphone (QR code)");
  await control.waitForSelector(".phone-qr img", { timeout: 8000 });
  const qrInput = obs.state.inputs.find((i) => i.inputName === "DiffChurch - Téléphone QR 1");
  await check(qrInput?.inputKind === "browser_source" && qrInput.settings.reroute_audio === true, "source téléphone QR créée (son vers OBS)");
  const enabled = obs.state.items[SCENE].filter((i) => i.sceneItemEnabled).map((i) => i.sourceName);
  await check(enabled.includes("DiffChurch - Téléphone QR 1") && !enabled.includes("DiffChurch - Caméra : Cam Link 4K"), "une seule caméra active (téléphone)");
  await check(/https:\/\/.+:8443\/phone\.html\?cam=1/.test(await control.textContent(".phone-qr .url")), "adresse du QR code correcte");

  await control.keyboard.press("Escape");
  await render.waitForTimeout(600);
  await check((await render.locator(".layer > *").count()) === 0, "Échap → caméra seule");

  if (errors.length) await fail(errors.join("\n"));
  console.log("TOUS LES TESTS PASSENT");
} catch (e) {
  await fail(e.message);
}
await browser.close();
obs.close();
