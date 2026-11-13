// Test : nouvelle interface (Démarrage → Sources du jour → Régie) ↔ faux OBS ↔ page d'affichage.
// Prérequis : `npm run dev` lancé.
import { launch, BASE } from "./browser.mjs";
import { startFakeObs } from "./fake-obs.mjs";

const SCENE = "Regio - Sortie";
const obs = startFakeObs(4466);
// Scène et sources laissées par l'ancien nom « DiffChurch » : supprimées à la connexion.
obs.state.scenes.push("DiffChurch - Sortie");
obs.state.inputs.push({ inputName: "DiffChurch - Téléphone (Wi-Fi)", inputKind: "ffmpeg_source", settings: {} });

const browser = await launch();
const errors = [];
const external = [];
const fail = async (msg) => {
  console.error("ÉCHEC :", msg);
  await browser.close();
  obs.close();
  process.exit(1);
};
const check = async (cond, msg) => (cond ? console.log("✓", msg) : fail(msg));
const enabledCams = () => obs.state.items[SCENE].filter((i) => i.sceneItemEnabled && i.sourceName.startsWith("Regio - Caméra")).map((i) => i.sourceName);

try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "fr-FR" });
  const app = await ctx.newPage();
  app.on("pageerror", (e) => errors.push("régie : " + e.message));
  app.on("request", (r) => {
    const u = new URL(r.url());
    if (!["localhost", "127.0.0.1"].includes(u.hostname) && !u.protocol.startsWith("data")) external.push(r.url());
  });

  // --- Connexion (mode navigateur) puis Démarrage ---
  await app.goto(BASE);
  await app.fill("#port", "4466");
  await app.click("text=Se connecter");
  await app.waitForSelector("text=Préparation du culte");
  await app.waitForSelector("button:has-text('Choisir les caméras du jour'):not([disabled])", { timeout: 8000 });
  await check(await app.isVisible("text=Écran 2 · 1280 × 720"), "démarrage : écran de la salle trouvé (écran 2)");
  await check(await app.isVisible("text=2 caméra(s) trouvée(s)"), "démarrage : 2 caméras trouvées");
  await check(obs.state.projector === 1, "projection ouverte toute seule sur l'écran de la salle (jamais sur l'écran principal)");
  await check(!obs.state.scenes.some((n) => n.startsWith("DiffChurch")) && !obs.state.inputs.some((i) => i.inputName.startsWith("DiffChurch")), "anciennes sources « DiffChurch » supprimées");

  const overlay = obs.state.inputs.find((i) => i.inputName === "Regio - Contenu");
  const render = await ctx.newPage();
  render.on("pageerror", (e) => errors.push("affichage : " + e.message));
  await render.setViewportSize({ width: 1920, height: 1080 });
  await render.goto(overlay.settings.url.replace("port=4455", "port=4466"));
  await render.waitForSelector(".standby-title:has-text('Bienvenue')", { timeout: 5000 });
  await check(true, "salle : écran d'attente « Bienvenue » affiché dès le démarrage");

  // --- Sources du jour ---
  await app.click("text=Choisir les caméras du jour");
  await app.waitForSelector("text=Quelles caméras aujourd'hui ?");
  await app.waitForSelector(".cam.is-main", { timeout: 8000 });
  await check((await app.textContent(".cam.is-main .cam-name")).includes("Cam Link 4K"), "première caméra choisie automatiquement comme principale");
  await app.click(".cam:has-text('Webcam intégrée')");
  await app.waitForSelector(".cam.is-main:has-text('Webcam intégrée')");
  const en = enabledCams();
  await check(en.length === 1 && en[0].includes("Webcam intégrée"), `une seule caméra à l'écran : ${en.join(", ")}`);
  await app.waitForSelector("img[alt='QR code à scanner avec le téléphone']", { timeout: 8000 });
  const phone = obs.state.inputs.find((i) => i.inputName === "Regio - Téléphone QR 1");
  await check(phone?.inputKind === "browser_source" && phone.settings.reroute_audio === true, "téléphone : QR code affiché, réception prête dans le moteur vidéo (son inclus)");

  // --- Régie ---
  await app.click("text=Commencer le culte");
  await app.waitForSelector(".plan-item.is-current:has-text('Écran d')");
  await check(true, "régie : le déroulé commence par l'écran d'attente");
  await app.keyboard.press("Space");
  await app.waitForSelector(".plan-item.is-current:has-text('Louange')");
  await render.waitForTimeout(600);
  await check((await render.locator(".layer > *").count()) === 0, "barre d'espace → Louange : caméra seule");
  await app.keyboard.press("Space");
  await app.keyboard.press("Space");
  await render.waitForSelector(".verse-text:has-text('berger')");
  await check((await render.textContent(".ref")).includes("PSAUME 23:1"), "Suivant → Psaume 23:1 en plein écran, référence en or");

  await app.fill("#passage", "jean 3 16");
  await check((await app.locator(".verse").count()) === 1, "Bible : « jean 3 16 » trouve Jean 3:16");
  await app.click(".verse >> text=En bandeau");
  await render.waitForSelector(".lower-ref:has-text('JEAN 3:16')");
  await check(await app.isVisible(".segmented button[aria-pressed='true']:has-text('Bandeau')"), "verset en bandeau sur la caméra ; mise en page « Bandeau » sélectionnée");
  await app.click(".stage-head >> text=Plein écran");
  await render.waitForSelector(".full .verse-text:has-text('Car Dieu')");
  await check(true, "mise en page : bandeau → plein écran");

  await app.click("body", { position: { x: 700, y: 880 } });
  await app.keyboard.press("Escape");
  await render.waitForTimeout(600);
  await check((await render.locator(".layer > *").count()) === 0, "Échap → caméra seule");

  await app.click("role=tab[name='Texte']");
  await app.fill("#ttitle", "Culte de Noël");
  await app.fill("#tbody", "Mercredi 24 décembre à 19 h");
  await app.click(".panels >> text=Plein écran");
  await render.waitForSelector(".text-title:has-text('Culte de Noël')");
  await check(true, "texte libre affiché en plein écran");
  await check(!(await app.isVisible("text=La page d'affichage ne répond pas")), "la régie voit la page d'affichage connectée");

  await check(external.length === 0, `aucune ressource chargée depuis Internet (hors ligne) ${external.slice(0, 3).join(" ")}`);
  if (errors.length) await fail(errors.join("\n"));
  await app.screenshot({ path: process.env.SHOT ?? "/dev/null" }).catch(() => {});
  console.log("TOUS LES TESTS PASSENT");
} catch (e) {
  await fail(e.message);
}
await browser.close();
obs.close();
