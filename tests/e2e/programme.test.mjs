// Test : programme de départ « live », modifier l'écran d'attente, confirmations avant suppression, import de PDF.
// Prérequis : `npm run dev` lancé.
import { launch, BASE } from "./browser.mjs";
import { startFakeObs } from "./fake-obs.mjs";

const obs = startFakeObs(4473);
const browser = await launch();
const errors = [];
const fail = async (msg) => {
  console.error("ÉCHEC :", msg);
  await browser.close();
  obs.close();
  process.exit(1);
};
const check = async (cond, msg) => (cond ? console.log("✓", msg) : fail(msg));

/** Petit PDF valide de `n` pages (texte « Page k »), fabriqué à la main. */
function makePdf(n) {
  const objs = ["<< /Type /Catalog /Pages 2 0 R >>", null, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"];
  const kids = [];
  for (let k = 1; k <= n; k++) {
    const stream = `BT /F1 72 Tf 100 300 Td (Page ${k}) Tj ET`;
    objs.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
    const contentId = objs.length;
    objs.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 960 540] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentId} 0 R >>`);
    kids.push(`${objs.length} 0 R`);
  }
  objs[1] = `<< /Type /Pages /Kids [${kids.join(" ")}] /Count ${n} >>`;
  let out = "%PDF-1.4\n";
  const offsets = [];
  objs.forEach((o, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("");
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, "latin1");
}

try {
  const app = await (await browser.newContext({ viewport: { width: 1366, height: 820 }, locale: "fr-FR" })).newPage();
  app.on("pageerror", (e) => errors.push(e.message));
  await app.goto(BASE);
  await app.evaluate(() => localStorage.clear());
  await app.reload();

  // --- 1er lancement : choix de la langue, la langue de l'ordinateur proposée en premier ---
  const langs = await app.locator(".language-grid .template-card strong").allInnerTexts();
  await check(langs.join("|") === "Français|English", `choix de la langue, français en premier : ${langs.join(", ")}`);
  await check((await app.textContent(".language-grid .template-card >> nth=0")).includes("Langue de votre ordinateur"), "la langue de l'ordinateur est signalée");
  {
    const en = await (await browser.newContext({ viewport: { width: 1366, height: 820 }, locale: "en-US" })).newPage();
    await en.goto(BASE);
    const order = await en.locator(".language-grid .template-card strong").allInnerTexts();
    await check(order[0] === "English", `ordinateur en anglais : English proposé en premier (${order.join(", ")})`);
    await en.click(".template-card:has-text('Français')");
    await en.waitForSelector("text=Se connecter");
    await check(true, "ordinateur en anglais, Français choisi : l'interface est en français");
    await en.reload();
    await check((await en.locator(".language-grid").count()) === 0, "la langue n'est demandée qu'une fois");
    await en.context().close();
  }
  await app.click(".template-card:has-text('Français')");
  await app.fill("#port", "4473");
  await app.click("text=Se connecter");
  await app.click("button:has-text('Choisir les caméras du jour'):not([disabled])", { timeout: 20000 });
  await app.click("role=button[name='Commencer']");

  // --- Programme de départ « live » ---
  await app.click(".template-card:has-text('Un live, une émission')");
  const names = await app.locator(".moment .plan-label").allInnerTexts();
  await check(names.join("|") === "Écran d'attente|Introduction|Sujet principal|Questions du public|Fin", `programme « live » : ${names.join(", ")}`);
  await check((await app.textContent("h2")).includes("Programme"), "la colonne de gauche s'appelle « Programme »");

  // --- Modifier l'écran d'attente (il est à l'écran : la modification s'affiche tout de suite) ---
  await app.click(".item-card:has-text('Écran d') .item-edit");
  await app.fill("#edit-title", "Bienvenue sur la chaîne");
  await app.fill("#edit-body", "Le live commence à 20 h");
  await app.click(".modal >> text=Enregistrer");
  await app.waitForSelector(".item-card .mini:has-text('Bienvenue sur la chaîne')");
  await check(true, "écran d'attente modifié (titre et sous-titre)");

  // --- Créer / Importer bien séparés ---
  const groups = await app.locator(".add-group").allInnerTexts();
  await check(/Créer :\s*Verset\s*Texte/.test(groups[0]) && /Importer :.*PDF.*Image/s.test(groups[1]), `« Créer : Verset · Texte » et « Importer : … PDF · Image » (${groups.map((g) => g.replace(/\s+/g, " ")).join(" / ")})`);

  // --- Import d'un PDF : une page = une diapo ---
  await app.click(".moment:has-text('Sujet principal')");
  await app.setInputFiles("input[aria-label='Importer un PDF dans « Sujet principal »']", { name: "Plan du live.pdf", mimeType: "application/pdf", buffer: makePdf(2) });
  await app.waitForSelector(".item-card.is-slides:has-text('Plan du live')", { timeout: 20000 });
  await check((await app.textContent(".item-card.is-slides .item-kind")).includes("PDF · 2 pages") && (await app.locator(".slide-card").count()) === 2,
    "PDF importé : UN contenu « PDF · 2 pages », deux diapos");

  // --- Confirmation avant de retirer un contenu ---
  await app.click(".item-card.is-slides .item-remove");
  await check(await app.isVisible("role=dialog[name='Retirer ce contenu ?']"), "retirer un contenu : confirmation demandée");
  await check((await app.evaluate(() => document.activeElement?.textContent)) === "Annuler", "le bouton prêt à l'emploi est « Annuler » (un appui par réflexe ne supprime rien)");
  await app.keyboard.press("Enter");
  await check((await app.locator(".item-card.is-slides").count()) === 1, "Annuler : le contenu est toujours là");
  await app.click(".item-card.is-slides .item-remove");
  await app.click(".modal >> text=Oui, retirer");
  await app.waitForSelector(".item-card.is-slides", { state: "detached" });
  await check(true, "« Oui, retirer » : le contenu est retiré");

  // --- Confirmation avant de supprimer un moment ---
  await app.click("role=button[name='Supprimer ce moment']");
  await app.click(".modal >> text=Annuler");
  await check((await app.locator(".moment:has-text('Sujet principal')").count()) === 1, "supprimer un moment : confirmation, Annuler ne supprime rien");

  // --- Mise en page : une image très large au nom très long ne déborde pas, même fenêtre au minimum (1100 px) ---
  const overflowing = () => app.evaluate(() => {
    const boxes = ".media-card, .output, .topbar, .text-form, .plan, .center";
    return [...document.querySelectorAll(`${boxes.split(", ").map((b) => `${b} *`).join(", ")}`)].filter((e) => {
      const p = e.parentElement?.closest(boxes);
      if (!p) return false;
      const a = e.getBoundingClientRect(), b = p.getBoundingClientRect();
      return a.width > 0 && a.height > 0 && (a.right > b.right + 1 || a.left < b.left - 1);
    }).length + (document.documentElement.scrollWidth > innerWidth ? 1000 : 0);
  });
  await app.click(".add-btn:has-text('Image')");
  const png = await app.evaluate(() => { const c = document.createElement("canvas"); c.width = 3000; c.height = 500; const g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, 3000, 500); return c.toDataURL("image/png").split(",")[1]; });
  await app.setInputFiles(".media-import input", { name: "LEjOYxvSCZruZoexPFjZ7r3pRGpJFwgWqqqqqqqqqqqqqqqq.png", mimeType: "image/png", buffer: Buffer.from(png, "base64") });
  await app.waitForSelector(".media-card");
  await check((await overflowing()) === 0, "images : une image très large au nom très long reste dans sa carte");
  await app.click(".back-btn");
  await app.click(".add-btn:has-text('Texte')");
  await check((await overflowing()) === 0, "nouveau texte : les champs restent dans leur colonne");
  await app.setViewportSize({ width: 1100, height: 680 });
  await check((await overflowing()) === 0, "fenêtre au minimum (1100 × 680) : rien ne déborde, rien n'est coupé");
  await app.setViewportSize({ width: 1366, height: 820 });

  await check(errors.length === 0, `aucune erreur de page ${errors.join(" | ")}`);
  console.log("TOUS LES TESTS PASSENT");
} catch (e) {
  await fail(e.message);
}
await browser.close();
obs.close();
