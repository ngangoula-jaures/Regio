// Test : présentation importée (PowerPoint) = UN contenu ; Suivant / Précédent passent de diapo en diapo.
// L'import lui-même (PowerPoint → images) est testé côté Rust sous Windows :
//   scripts/win.sh cargo test --manifest-path src-tauri\Cargo.toml --lib pptx -- --include-ignored
// Prérequis : `npm run dev` lancé.
import { launch, BASE } from "./browser.mjs";
import { startFakeObs } from "./fake-obs.mjs";

const obs = startFakeObs(4469);
const browser = await launch();
const errors = [];
const fail = async (msg) => {
  console.error("ÉCHEC :", msg);
  await browser.close();
  obs.close();
  process.exit(1);
};
const check = async (cond, msg) => (cond ? console.log("✓", msg) : fail(msg));
const slide = (n) =>
  "data:image/svg+xml," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080"><rect width="100%" height="100%" fill="#123"/><text x="100" y="500" font-size="120" fill="#fff">Diapo ${n}</text></svg>`);
const id = () => Math.random().toString(36).slice(2);
const library = {
  version: 1,
  media: [],
  moments: [
    { id: id(), name: "Écran d'attente", items: [{ id: id(), label: "Bienvenue", content: { kind: "standby", title: "Bienvenue", subtitle: "" } }] },
    {
      id: id(),
      name: "Louange",
      items: [
        { id: id(), label: "Chants du dimanche", content: { kind: "slides", name: "Chants du dimanche", slides: [slide(1), slide(2), slide(3)], index: 0 } },
        { id: id(), label: "Annonce", content: { kind: "text", layout: "full", title: "Après la louange", body: "" } },
      ],
    },
  ],
};

try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "fr-FR" });
  const app = await ctx.newPage();
  app.on("pageerror", (e) => errors.push("régie : " + e.message));
  await app.goto(BASE);
  await app.evaluate((lib) => {
    localStorage.clear();
    localStorage.setItem("regio.data.library", JSON.stringify(lib));
  }, library);
  await app.reload();
  await app.fill("#port", "4469");
  await app.click("text=Se connecter");
  await app.click("button:has-text('Choisir les caméras du jour'):not([disabled])", { timeout: 20000 });
  const overlay = obs.state.inputs.find((i) => i.inputName === "Regio - Contenu");
  const render = await ctx.newPage();
  render.on("pageerror", (e) => errors.push("affichage : " + e.message));
  await render.setViewportSize({ width: 1920, height: 1080 });
  await render.goto(overlay.settings.url.replace("port=4455", "port=4469"));
  const shown = async (n) => {
    await render.waitForFunction((n) => decodeURIComponent(document.querySelector(".layer.in img")?.getAttribute("src") ?? "").includes(`Diapo ${n}<`), n, { timeout: 5000 });
  };
  await app.click("role=button[name='Commencer']");

  await app.click(".moment:has-text('Louange')");
  await check((await app.textContent(".item-card:has-text('Chants du dimanche') .item-kind")).includes("Présentation · 3 diapos"), "la présentation est UN contenu « Présentation · 3 diapos »");
  await check((await app.locator(".slide-card").count()) === 3, "ses 3 diapos sont visibles en vignettes");

  await app.click(".item-card:has-text('Chants du dimanche') .item-main");
  await shown(1);
  await check((await app.textContent(".next-btn")).includes("Diapo suivante"), "clic : diapo 1 à l'écran ; le bouton dit « Diapo suivante »");
  await check((await app.textContent(".output")).includes("Chants du dimanche · 1/3"), "à l'écran : « Louange · Chants du dimanche · 1/3 »");
  await app.keyboard.press("Space");
  await shown(2);
  await app.keyboard.press("ArrowRight");
  await shown(3);
  await check((await app.locator(".slide-card.is-live[data-slide='2']").count()) === 1, "espace / → : diapos 2 puis 3 ; la vignette à l'écran est repérée");
  await check((await app.textContent(".next-btn")).includes("Contenu suivant"), "dernière diapo : le bouton redevient « Contenu suivant »");
  await app.keyboard.press("Space");
  await render.waitForSelector(".layer.in .text-title:has-text('Après la louange')");
  await check(true, "après la dernière diapo : le contenu suivant du moment");
  await app.keyboard.press("ArrowLeft");
  await shown(3);
  await check(true, "← depuis le contenu suivant : retour sur la DERNIÈRE diapo");
  await app.click(".slide-card[data-slide='0']");
  await shown(1);
  await app.keyboard.press("ArrowLeft");
  await render.waitForTimeout(600);
  await shown(1);
  await check((await app.locator(".moment.is-live:has-text('Louange')").count()) === 1, "clic sur la vignette 1 : diapo 1 ; ← au début du moment : rien ne change (on ne quitte pas le moment)");

  await check(errors.length === 0, `aucune erreur de page ${errors.join(" | ")}`);
  console.log("TOUS LES TESTS PASSENT");
} catch (e) {
  await fail(e.message);
}
await browser.close();
obs.close();
