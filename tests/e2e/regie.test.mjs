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
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 820 }, locale: "fr-FR" }); // taille de la fenêtre de l'application
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

  // --- Régie v3 ---
  const live = async () => (await render.locator(".layer.in").last().innerText().catch(() => "")).replace(/\s+/g, " ");
  const waitRender = (sel) => render.waitForSelector(`.layer.in ${sel}`, { timeout: 6000 });
  await app.click("text=Commencer le culte");
  await app.waitForSelector(".moment.is-live:has-text('Écran d')");
  await waitRender(".standby-title");
  await check(true, "régie : le 1er moment (écran d'attente) est à l'écran");
  await app.keyboard.press("ArrowDown");
  await app.keyboard.press("ArrowDown");
  await app.waitForSelector(".moment.is-selected:has-text('Adoration')");
  await app.waitForSelector(".view-title h1:text-is('Adoration')");
  await render.waitForTimeout(500);
  await check((await app.locator(".moment.is-live:has-text('Écran d')").count()) === 1 && (await render.locator(".layer.in .standby-title").count()) === 1,
    "↓ ↓ : on choisit « Adoration » (ses contenus au centre) sans rien changer à l'écran");
  await app.keyboard.press("ArrowUp");
  await app.waitForSelector(".moment.is-selected:has-text('Louange')");
  await check((await app.textContent(".next-btn")).includes("Afficher « Louange »"), "↑ : retour sur « Louange » ; le bouton annonce « Afficher « Louange » »");

  await app.click(".moment:has-text('Prédication')");
  await app.waitForSelector(".view-title h1:text-is('Prédication')");
  await render.waitForTimeout(500);
  await check((await render.locator(".layer.in .standby-title").count()) === 1, "clic sur « Prédication » : ses contenus s'ouvrent au centre, l'écran ne change pas");
  // Mise en page choisie À L'AVANCE : le texte arrive directement sur la caméra, sans passer par le plein écran.
  await app.click(".layout-toggle >> text=Sur la caméra");
  await render.waitForTimeout(400);
  await check((await render.locator(".layer.in .standby-title").count()) === 1, "« Sur la caméra » choisi à l'avance : rien ne change à l'écran (écran d'attente)");
  await app.keyboard.press("Space");
  await waitRender(".lower-ref");
  await app.waitForSelector(".moment.is-live:has-text('Prédication')");
  await check((await render.locator(".layer.in .text-title, .layer.in .full").count()) === 0, "espace : le 1er contenu du moment s'affiche DIRECTEMENT sur la caméra (jamais en plein écran)");
  await app.click(".layout-toggle >> text=En plein écran");
  await waitRender(".text-title");
  await check((await app.textContent(".moment.is-live")).includes("Prédication") && (await app.textContent(".next-btn")).includes("Contenu suivant"),
    "« En plein écran » : le même texte passe en plein écran, on reste dans le déroulé");

  await app.click(".add-btn:has-text('Texte')");
  await app.fill("#ttitle", "Culte de Noël");
  await app.fill("#tbody", "Mercredi 24 décembre à 19 h");
  await app.click("role=button[name='Ajouter à Prédication']");
  await app.waitForSelector("text=Ajouté à Prédication");
  await app.click(".back-btn:has-text('Retour à « Prédication »')");
  await check((await app.locator(".item-card").count()) === 2, "texte créé et rattaché au moment « Prédication »");

  await app.click(".item-card >> nth=0 >> .item-main");
  await check((await app.textContent(".next-btn")).includes("Contenu suivant"), "un clic sur un contenu l'affiche ; le bouton dit « Contenu suivant »");
  await app.keyboard.press("Space");
  await waitRender(".text-title:has-text('Culte de Noël')");
  await check(true, "espace : contenu suivant du moment (le texte ajouté)");
  await app.keyboard.press("Space");
  await app.waitForSelector(".moment.is-live:has-text('Offrandes')");
  await check(true, "fin du moment : on enchaîne sur le 1er contenu du moment suivant");

  await app.click(".add-btn:has-text('Verset')");
  await app.fill("#bible-q", "ps 23 1");
  await app.press("#bible-q", "Enter");
  await waitRender(".verse-text:has-text('mon berger')");
  await check((await app.textContent(".next-btn")).includes("Verset suivant"), "« ps 23 1 » : Psaume 23:1 affiché, lecture suivie (« Verset suivant »)");
  await app.click("body", { position: { x: 700, y: 30 } });
  await app.keyboard.press("Space");
  await waitRender(".verse-text:has-text('verts pâturages')");
  await app.keyboard.press("ArrowLeft");
  await waitRender(".verse-text:has-text('mon berger')");
  await check(true, "lecture suivie : espace = verset 2, ← = retour au verset 1");
  await app.click(".layout-toggle >> text=Sur la caméra");
  await waitRender(".lower-ref:has-text('PSAUMES 23:1')");
  await check(true, "verset passé « Sur la caméra » (bandeau)");
  await app.click(".layout-toggle >> text=En plein écran");
  await waitRender(".ref:has-text('PSAUMES 23:1')");
  await check((await app.textContent(".next-btn")).includes("Verset suivant"), "retour « En plein écran » : le verset repasse en plein écran, la lecture suivie continue");

  await app.click(".crumbs >> text=Livres");
  await app.click("text=Nouveau Testament");
  await app.click(".book-grid >> text=/^Jean$/");
  await app.click(".chapter-grid >> text=/^3$/");
  await app.waitForSelector(".verse-row[data-verse='16']:has-text('tant aimé le monde')");
  await check(true, "Bible complète : Livres › Jean › 3 → Jean 3:16 (Louis Segond 1910)");
  await app.click(".moment:has-text('Prédication')");
  await app.click(".add-btn:has-text('Verset')");
  await app.click(".verse-row[data-verse='16'] .icon-btn");
  await app.waitForSelector("text=Ajouté à Prédication");
  await check(true, "« + » sur Jean 3:16 : verset rattaché au moment sélectionné (Prédication)");

  // Réordonner les contenus d'un moment : glisser-déposer, puis clavier sur la poignée.
  await app.click(".back-btn");
  const labels = () => app.locator(".item-card .item-label").allInnerTexts();
  const before = await labels();
  // Les deux cartes doivent être visibles (le défilement automatique pendant un glisser fausse le test).
  await app.setViewportSize({ width: 1366, height: 1400 });
  await app.locator(".item-card >> nth=2 >> .item-grip").dragTo(app.locator(".item-card >> nth=0"), { targetPosition: { x: 40, y: 4 } });
  await app.setViewportSize({ width: 1366, height: 820 });
  const afterDrag = await labels();
  await check(afterDrag[0] === before[2] && afterDrag.length === 3, `glisser-déposer : le dernier contenu passe en premier (${afterDrag.join(" | ")})`);
  await app.click(".item-card:has-text('Culte de Noël') .item-main");
  await waitRender(".text-title:has-text('Culte de Noël')");
  await app.focus(".item-card:has-text('Culte de Noël') .item-grip");
  await app.keyboard.press("ArrowUp");
  const afterKey = await labels();
  await check(afterKey.join("|") === [afterDrag[0], "Culte de Noël", afterDrag[1]].join("|"), `poignée + ↑ : le contenu monte d'un cran (${afterKey.join(" | ")})`);
  await check((await app.locator(".item-card.is-live:has-text('Culte de Noël')").count()) === 1 && (await app.textContent(".moment.is-selected")).includes("Prédication"),
    "le contenu à l'écran reste repéré après le déplacement ; ↑ n'a pas changé de moment");
  await check((await app.evaluate(() => document.activeElement?.closest(".item-card")?.textContent ?? "")).includes("Culte de Noël"), "la poignée garde le focus (on peut appuyer plusieurs fois)");
  await app.locator("body").click({ position: { x: 700, y: 30 } });
  const order = await labels();

  await app.click("text=+ Ajouter un moment");
  await app.fill("#new-moment", "Témoignages");
  await app.press("#new-moment", "Enter");
  await app.waitForSelector(".view-title h1:text-is('Témoignages')");
  const names = await app.locator(".moment .plan-label").allInnerTexts();
  await check(names.at(-2) === "Témoignages" && names.at(-1) === "Bénédiction", `nouveau moment « Témoignages » avant la bénédiction (${names.join(", ")})`);

  await app.click(".cam-tile:has-text('Cam Link 4K')");
  await app.waitForSelector(".cam-tile.is-on:has-text('Cam Link 4K')");
  const en2 = enabledCams();
  await check(en2.length === 1 && en2[0].includes("Cam Link 4K"), "rangée des caméras : un clic change la caméra à l'écran");
  await app.click(".cam-tile:has-text('Webcam intégrée')"); // nom long + badge « À l'écran »
  await app.waitForSelector(".cam-tile.is-on:has-text('Webcam intégrée')");
  const overlap = await app.$$eval(".cam-tile", (tiles) =>
    tiles.some((a, i) => tiles.slice(i + 1).some((b) => {
      const r = a.getBoundingClientRect(), q = b.getBoundingClientRect();
      return r.left < q.right - 1 && q.left < r.right - 1 && r.top < q.bottom - 1 && q.top < r.bottom - 1;
    })));
  await check(!overlap, "rangée des caméras : aucune vignette ne déborde sur sa voisine (nom de caméra long)");
  // Un plein écran est affiché : un clic (ou une touche 1–6) sur une caméra la remet à l'écran.
  await app.click(".moment:has-text('Prédication')");
  await app.click(".item-card:has-text('Culte de Noël') .item-main");
  await waitRender(".text-title:has-text('Culte de Noël')");
  await app.waitForSelector(".cam-tile.is-ready");
  await check((await app.textContent(".cam-tile.is-ready")).includes("PRÊTE"), "plein écran : la caméra choisie est « PRÊTE · sous le plein écran »");
  await app.locator("body").click({ position: { x: 700, y: 30 } });
  await app.keyboard.press("1");
  await app.waitForSelector(".cam-tile.is-on:has-text('Cam Link 4K')");
  await render.waitForTimeout(700);
  await check((await render.locator(".layer.in > *").count()) === 0, "touche 1 : la caméra 1 revient à l'écran, le plein écran s'efface");
  await app.click(".cam-tile:has-text('Cam Link 4K')");
  await app.waitForSelector(".cam-tile.is-on:has-text('Cam Link 4K')");

  await app.click(".room-btn");
  await app.waitForSelector("text=Votre ordinateur");
  await check(await app.isVisible(".room-choice:has-text('Télé / projecteur')"), "télé de la salle : choix « Votre ordinateur » / « Télé / projecteur »");
  await app.click(".room-choice:has-text('Votre ordinateur')");
  await check(obs.state.projector === 0, "projection déplacée sur « Votre ordinateur »");

  await app.keyboard.press("Escape");
  await render.waitForTimeout(600);
  await check((await render.locator(".layer.in > *").count()) === 0, "Échap → retour à la caméra");
  await check(!(await app.isVisible("text=La page d'affichage ne répond pas")), "la régie voit la page d'affichage connectée");

  // Les moments et leurs contenus sont conservés d'un lancement à l'autre.
  await app.waitForTimeout(500);
  await app.reload();
  await app.fill("#port", "4466");
  await app.click("text=Se connecter");
  await app.click("button:has-text('Choisir les caméras du jour'):not([disabled])", { timeout: 8000 });
  await app.click("text=Commencer le culte");
  await app.waitForSelector(".moment:has-text('Témoignages')");
  await app.click(".moment:has-text('Prédication')");
  await check((await app.locator(".item-card").count()) === 3, "après redémarrage : moment « Témoignages » et contenus de « Prédication » retrouvés");
  await check((await labels()).join("|") === order.join("|"), `l'ordre des contenus est conservé (${order.join(" | ")})`);

  await check(external.length === 0, `aucune ressource chargée depuis Internet (hors ligne) ${external.slice(0, 3).join(" ")}`);
  if (errors.length) await fail(errors.join("\n"));
  await app.screenshot({ path: process.env.SHOT ?? "/dev/null" }).catch(() => {});
  console.log("TOUS LES TESTS PASSENT");
} catch (e) {
  await fail(e.message);
}
await browser.close();
obs.close();
