// Test : le direct sur Facebook (assistant, passer en direct, santé, enregistrement au choix, fin) ↔ faux OBS.
// Prérequis : `npm run dev` lancé.
import { launch, BASE } from "./browser.mjs";
import { startFakeObs } from "./fake-obs.mjs";

const obs = startFakeObs(4471);
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
  const app = await (await browser.newContext({ viewport: { width: 1366, height: 820 }, locale: "fr-FR" })).newPage();
  app.on("pageerror", (e) => errors.push(e.message));
  await app.goto(BASE);
  await app.evaluate(() => localStorage.clear());
  await app.reload();
  await app.fill("#port", "4471");
  await app.click("text=Se connecter");
  await app.click("button:has-text('Choisir les caméras du jour'):not([disabled])", { timeout: 20000 });
  await app.click("role=button[name='Commencer']");
  await app.click(".template-card:has-text(\"Un culte d'église\")");

  // --- Vumètre : le son du moteur vidéo arrive ---
  await app.waitForFunction(() => parseFloat(document.querySelector(".vu > span > span")?.style.width || "0") > 30, null, { timeout: 5000 });
  await check((await app.textContent(".sound")).includes("le son arrive"), "vumètre : les niveaux sonores du moteur vidéo s'affichent");

  // --- Entrée son : la table de mixage (interface audio USB), choisie dans Regio et retenue ---
  await app.click(".sound-input-btn");
  await app.click(".sound-menu >> text=Entrée ligne (Focusrite USB Audio)");
  await app.waitForSelector(".sound-input-btn:has-text('Focusrite')");
  const soundIn = () => obs.state.inputs.find((i) => i.inputName === "Regio - Son")?.settings.device_id;
  await check(soundIn() === "focusrite", "entrée son choisie dans Regio : la table de mixage (le moteur vidéo l'utilise)");

  // --- Assistant (une seule fois) ---
  await app.click("text=Diffuser sur Facebook");
  await check(await app.isVisible("role=dialog[name='Diffuser sur Facebook']"), "assistant ouvert");
  await check((await app.locator(".choice[aria-pressed='true']").textContent()).includes("Page Facebook"), "étape 1 : « Page Facebook » choisie par défaut");
  await app.click(".modal >> text=Continuer");
  await check(await app.isDisabled(".modal >> text=Continuer"), "étape 2 : impossible de continuer sans clé");
  await app.fill("#fb-key", "FB-1234567890123456-0-AbCdEfGh");
  await check((await app.getAttribute("#fb-key", "type")) === "password", "la clé est masquée par défaut");
  await app.click(".modal >> text=Continuer");
  await app.click("text=Tester ma connexion");
  await app.waitForSelector("text=Connexion : 8,2 Mb/s en envoi. Qualité conseillée : 720p.");
  await check((await app.locator(".choice[aria-checked='true']").textContent()).includes("720p") && (await app.isDisabled(".choice:has-text('1080p')")),
    "étape 3 : connexion mesurée, 720p conseillé, 1080p grisé (connexion trop juste)");
  await app.click(".modal >> text=Terminer");
  await app.waitForSelector(".live-target:has-text('Facebook · 720p')");
  await check(await app.isVisible("button:has-text('Passer en direct')"), "réglé : « Facebook · 720p » et « Passer en direct » en haut à droite");

  // --- Mode répétition : la télé garde l'écran d'attente, le direct est bloqué ---
  const holdItem = () => obs.state.items["Regio - Salle"]?.find((i) => i.sourceName === "Regio - Attente salle");
  const salle = obs.state.items["Regio - Salle"]?.map((i) => i.sourceName) ?? [];
  await check(salle.includes("Regio - Sortie") && holdItem() && !holdItem().sceneItemEnabled, `scène de la télé : la sortie de la régie + l'écran d'attente masqué (${salle.join(", ")})`);
  await app.click("button.rehearsal-btn");
  await app.waitForSelector(".rehearsal-bar");
  await check(holdItem().sceneItemEnabled && (await app.isDisabled("button.live-go")), "« Répétition » : la télé affiche l'écran d'attente, « Passer en direct » est bloqué");
  const hold = await app.context().newPage();
  const holdUrl = obs.state.inputs.find((i) => i.inputName === "Regio - Attente salle").settings.url.replace("port=4455", "port=4471");
  await hold.goto(holdUrl);
  await hold.waitForSelector(".layer.in .standby-title:has-text('Bienvenue')", { timeout: 6000 });
  await check(true, "la page d'attente de la télé montre l'écran d'attente du Programme");
  await hold.close();
  await app.click(".rehearsal-bar >> text=Terminer la répétition");
  await app.waitForSelector(".rehearsal-bar", { state: "detached" });
  await check(!holdItem().sceneItemEnabled && !(await app.isDisabled("button.live-go")), "fin de la répétition : la télé montre de nouveau la régie, le direct est possible");

  // --- Passer en direct : l'enregistrement est DEMANDÉ (décoché par défaut) ---
  await app.click("button.live-go");
  await check(await app.isVisible("role=dialog[name='Passer en direct sur Facebook ?']"), "confirmation avant de passer en direct");
  await check(!(await app.isChecked(".record-choice input")) && (await app.textContent(".record-choice")).includes("Environ 1,4 Go par heure"),
    "enregistrement proposé (décoché), taille annoncée : ~1,4 Go par heure en 720p");
  await app.check(".record-choice input");
  await app.click(".modal >> button:has-text('Passer en direct')");
  await app.waitForSelector(".live-pill:has-text('EN DIRECT')", { timeout: 8000 });
  await check(obs.state.service?.streamServiceSettings?.server === "rtmps://live-api-s.facebook.com:443/rtmp/" && obs.state.service.streamServiceSettings.key === "FB-1234567890123456-0-AbCdEfGh",
    "le moteur vidéo envoie vers Facebook (RTMPS) avec la clé");
  await check(!!obs.state.record, "l'enregistrement a démarré (demandé)");
  await check(await app.isDisabled("button.rehearsal-btn"), "pendant le direct, le mode répétition n'est pas proposé");
  await check(await app.isVisible("text=Dernière étape, sur Facebook"), "rappel : le dernier clic se fait sur Facebook");
  await app.click(".fb-step >> text=C'est fait");
  await app.waitForSelector(".live-health:has-text('Connexion bonne')", { timeout: 6000 });
  await check(true, "voyant de santé : « Connexion bonne »");
  await app.waitForTimeout(2500);
  const t1 = await app.textContent(".live-time");
  await check(/^00:00:0[1-9]$/.test(t1), `chronomètre du direct (${t1})`);

  // --- Santé : connexion faible puis coupée ---
  obs.state.congestion = 0.6;
  await app.waitForSelector(".live-health:has-text('Connexion faible')", { timeout: 6000 });
  await check(await app.isVisible("text=Connexion faible : le débit est réduit automatiquement"), "connexion faible : voyant orange + message, le direct continue");
  obs.state.congestion = 0;
  obs.state.reconnecting = true;
  await app.waitForSelector(".live-health:has-text('Reconnexion')", { timeout: 6000 });
  await check(await app.isVisible("text=L'enregistrement continue sur ce PC."), "Internet coupé : reconnexion, l'enregistrement continue");
  obs.state.reconnecting = false;
  await app.click(".live-health");
  await check(await app.isVisible(".health-panel >> text=en cours sur ce PC"), "détails de la santé (débit, qualité, enregistrement)");
  await app.click(".health-panel >> role=button[name='Fermer']");

  // --- Les raccourcis de la régie restent actifs pendant le direct, pas pendant une fenêtre ---
  const nextBefore = await app.textContent(".next-btn");
  await app.click(".live-end");
  await check((await app.evaluate(() => document.activeElement?.textContent)) === "Continuer le direct", "fenêtre « Terminer » : le bouton prêt à l'emploi est « Continuer le direct »");
  await app.keyboard.press("Space");
  await check(!!obs.state.stream && (await app.textContent(".next-btn")) === nextBefore && (await app.isVisible(".live-pill")),
    "un appui sur espace par réflexe : le direct CONTINUE et la régie n'avance pas");
  await app.click(".live-end");
  await app.click("text=Oui, terminer");
  await app.waitForSelector("role=dialog[name='Direct terminé']");
  await check(!obs.state.stream && !obs.state.record && (await app.textContent(".modal")).includes("Culte 2026-11-16 10-02.mp4"),
    "fin : direct et enregistrement arrêtés, chemin du fichier affiché");
  await app.click(".modal >> text=Fermer");
  await check(await app.isVisible("button.live-go"), "retour à « Passer en direct »");

  // --- Réglages retenus d'un lancement à l'autre (clé + dernier choix d'enregistrement) ---
  await app.reload();
  await app.fill("#port", "4471");
  await app.click("text=Se connecter");
  await app.click("button:has-text('Choisir les caméras du jour'):not([disabled])", { timeout: 20000 });
  await app.click("role=button[name='Commencer']");
  await app.waitForSelector(".live-target:has-text('Facebook · 720p')");
  await app.click("button.live-go");
  await check(await app.isChecked(".record-choice input"), "après redémarrage : réglages retenus, dernier choix « enregistrer » coché");
  await check((await app.textContent(".sound-input-btn")).includes("Focusrite") && soundIn() === "focusrite", "après redémarrage : l'entrée son choisie est retenue et réappliquée");
  await check(errors.length === 0, `aucune erreur de page ${errors.join(" | ")}`);
  console.log("TOUS LES TESTS PASSENT");
} catch (e) {
  await fail(e.message);
}
await browser.close();
obs.close();
