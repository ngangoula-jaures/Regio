// Captures HD de la vraie interface (contenu fictif) pour les vidéos de présentation.
// Prérequis : `npm run dev` lancé. Usage : node design/video/capture.mjs → design/video/assets/*.png
import { launch, BASE, PHONE_BASE } from "../../tests/e2e/browser.mjs";
import { startFakeObs } from "../../tests/e2e/fake-obs.mjs";

const SET = process.argv[2] === "b" ? "b" : "a";
const OUT = new URL(`./assets/${SET}/`, import.meta.url).pathname;
(await import("node:fs")).mkdirSync(OUT, { recursive: true });
const obs = startFakeObs(SET === "a" ? 4481 : 4482);
const W = 1600, H = 900;
const b64 = (s) => "data:image/svg+xml;base64," + Buffer.from(s).toString("base64");

// Image de caméra illustrée : une scène (pupitre, silhouette), teinte différente par caméra.
const camera = (bg, glow, w = 640) =>
  b64(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${Math.round((w * 9) / 16)}" viewBox="0 0 160 90" preserveAspectRatio="xMidYMid slice"><rect width="160" height="90" fill="${bg}"/><ellipse cx="80" cy="22" rx="70" ry="40" fill="${glow}" opacity=".55"/><rect y="66" width="160" height="24" fill="#000" opacity=".25"/><circle cx="80" cy="33" r="8.5" fill="#1b1714"/><path d="M61 72C61 52 70 45 80 45S99 52 99 72Z" fill="#1b1714"/><path d="M58 61H102L97 90H63Z" fill="#2b221c"/><rect x="58" y="59" width="44" height="4" rx="1.5" fill="#3a2e25"/></svg>`);
// Vraies photos (Unsplash, licence gratuite) dans les caméras : A = église, ambiance africaine ; B = mixte.
const { execFileSync } = await import("node:child_process");
const photo = (name) =>
  "data:image/jpeg;base64," +
  execFileSync("ffmpeg", ["-loglevel", "error", "-i", new URL(`./photos/${name}.jpg`, import.meta.url).pathname, "-vf", "scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720:(iw-1280)/2:(ih-720)*0.3", "-q:v", "3", "-f", "mjpeg", "-"]).toString("base64");
const DEV = SET === "a" ? ["Caméra du pupitre", "Caméra de la salle"] : ["Caméra plateau", "Caméra invitée"];
const CAMS = SET === "a"
  ? { [DEV[0]]: photo("predicateur"), [DEV[1]]: photo("louange-assemblee"), phone: photo("chanteuse") }
  : { [DEV[0]]: photo("podcast-nairobi"), [DEV[1]]: photo("podcast-studio"), phone: photo("podcasteuse") };
obs.state.videoDevices = DEV.map((n, i) => ({ itemName: n, itemValue: "dev:" + i, itemEnabled: true }));
let program = CAMS[DEV[0]];
obs.state.shotFor = (source) => (source === "Regio - Sortie" ? program : source.includes("Téléphone") ? CAMS.phone : (CAMS[source.replace("Regio - Caméra : ", "")] ?? CAMS[DEV[0]]));

// Diapos d'un cantique du domaine public (« À toi la gloire », Edmond Budry, 1904).
const slide = (title, lines) =>
  b64(`<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1c1640"/><stop offset="1" stop-color="#3a2160"/></linearGradient></defs><rect width="1920" height="1080" fill="url(#g)"/><text x="100" y="110" font-family="Montserrat,Arial" font-weight="700" font-size="40" letter-spacing="6" fill="#ffffff" opacity=".55">${title.toUpperCase()}</text>${lines.map((l, i) => `<text x="960" y="${430 + i * 120 - (lines.length - 1) * 60}" text-anchor="middle" font-family="Montserrat,Arial" font-weight="700" font-size="96" fill="#fff">${l}</text>`).join("")}</svg>`);
const poster = b64(`<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080"><defs><linearGradient id="p" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#5a1e2a"/><stop offset="1" stop-color="#a8462e"/></linearGradient></defs><rect width="1920" height="1080" fill="url(#p)"/><text x="140" y="700" font-family="Montserrat,Arial" font-weight="800" font-size="170" fill="#fff">Concert de Noël</text><text x="140" y="820" font-family="Montserrat,Arial" font-weight="600" font-size="64" fill="#fff" opacity=".9">Samedi 20 décembre · 19 h</text></svg>`);
// Verset plein écran, comme le rend la page d'affichage (pour l'aperçu « À l'écran »).
const verse = (lines, ref) =>
  b64(`<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080"><defs><radialGradient id="v" cx=".5" cy=".3" r=".8"><stop offset="0" stop-color="#18224a"/><stop offset="1" stop-color="#0e1530"/></radialGradient></defs><rect width="1920" height="1080" fill="url(#v)"/>${lines.map((l, i) => `<text x="960" y="${470 + i * 92 - (lines.length - 1) * 46}" text-anchor="middle" font-family="Georgia,serif" font-size="66" fill="#f6f2e8">${l}</text>`).join("")}<text x="960" y="${560 + lines.length * 46}" text-anchor="middle" font-family="Arial" font-weight="700" font-size="34" letter-spacing="5" fill="#9aa3bf">${ref}</text></svg>`);
const id = () => Math.random().toString(36).slice(2);
const item = (label, content) => ({ id: id(), label, content });
const library = {
  version: 1,
  media: [{ id: id(), name: "Concert de Noël", src: poster }],
  moments: [
    { id: id(), name: "Écran d'attente", items: [item("Écran d'attente", { kind: "standby", title: "Bienvenue", subtitle: "Nous commençons dans quelques instants" })] },
    {
      id: id(),
      name: "Louange",
      items: [
        item("À toi la gloire", {
          kind: "slides",
          name: "À toi la gloire",
          index: 0,
          slides: [
            slide("À toi la gloire", ["À toi la gloire"]),
            slide("Couplet 1", ["Brillant de lumière,", "l'ange est descendu,", "il roule la pierre", "du tombeau vaincu."]),
            slide("Refrain", ["À toi la gloire,", "ô Ressuscité !", "À toi la victoire", "pour l'éternité !"]),
            slide("Couplet 2", ["Vois-le paraître :", "c'est lui, c'est Jésus,", "ton Sauveur, ton Maître !", "Oh ! ne doute plus !"]),
          ],
        }),
        item("Caméra seule", { kind: "none" }),
      ],
    },
    { id: id(), name: "Prédication", items: [item("Le bon berger", { kind: "text", layout: "full", title: "Le bon berger", body: "Jean 10" }), item("Jean 10:11", { kind: "verse", layout: "lower", reference: "Jean 10:11", text: "Je suis le bon berger. Le bon berger donne sa vie pour ses brebis.", version: "LSG 1910" })] },
    { id: id(), name: "Offrandes", items: [item("Merci", { kind: "text", layout: "full", title: "Offrandes", body: "Merci pour votre générosité" })] },
    { id: id(), name: "Annonces", items: [item("Concert de Noël", { kind: "image", src: poster, name: "Concert de Noël" })] },
    { id: id(), name: "Bénédiction", items: [item("Caméra seule", { kind: "none" })] },
  ],
};

// Vidéo B (neutre) : un programme d'émission, sans contenu d'église.
const slideB = (title, lines) =>
  b64(`<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0f2a3d"/><stop offset="1" stop-color="#1c5161"/></linearGradient></defs><rect width="1920" height="1080" fill="url(#g)"/><text x="100" y="110" font-family="Montserrat,Arial" font-weight="700" font-size="40" letter-spacing="6" fill="#ffffff" opacity=".6">${title.toUpperCase()}</text>${lines.map((l, i) => `<text x="960" y="${430 + i * 120 - (lines.length - 1) * 60}" text-anchor="middle" font-family="Montserrat,Arial" font-weight="700" font-size="92" fill="#fff">${l}</text>`).join("")}</svg>`);
const libraryB = {
  version: 1,
  media: [],
  moments: [
    { id: id(), name: "Écran d'attente", items: [item("Écran d'attente", { kind: "standby", title: "Le live du vendredi", subtitle: "On commence dans quelques instants" })] },
    { id: id(), name: "Introduction", items: [item("Bienvenue", { kind: "text", layout: "full", title: "Créer, partager, réussir", body: "Le live du vendredi" })] },
    { id: id(), name: "Invitée", items: [
      item("Awa Koné", { kind: "text", layout: "lower", title: "Awa Koné", body: "Fondatrice du Studio Kora" }),
      item("Ses 3 conseils", { kind: "slides", name: "Ses 3 conseils", index: 0, slides: [slideB("Ses 3 conseils", ["Lancer sa chaîne", "en 3 étapes"]), slideB("Étape 1", ["Trouver sa voix"]), slideB("Étape 2", ["Publier chaque semaine"]), slideB("Étape 3", ["Parler à sa communauté"])] }),
    ] },
    { id: id(), name: "Questions du public", items: [item("Vos questions", { kind: "text", layout: "full", title: "Vos questions", body: "Écrivez-les en commentaire" })] },
    { id: id(), name: "Fin", items: [item("Caméra seule", { kind: "none" })] },
  ],
};
// Image « caméra + bandeau » (verset sur la caméra), comme la sortie réelle.
const lower = (cam, text, ref) =>
  b64(`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1920" height="1080"><image href="${cam}" width="1920" height="1080" preserveAspectRatio="xMidYMid slice"/><rect x="0" y="770" width="1920" height="310" fill="#0e1530" opacity=".86"/><text x="120" y="890" font-family="Georgia,serif" font-size="58" fill="#f6f2e8">${text}</text><text x="120" y="975" font-family="Arial" font-weight="700" font-size="32" letter-spacing="5" fill="#e8b44c">${ref}</text></svg>`);
// Position (en px CSS, fenêtre 1600 × 900) des éléments sur lesquels la vidéo zoome.
const SEL = { qr: ".cam:has(.qr)", phoneCard: ".cam:has-text('Téléphone 1')", cams: ".cam-tiles", tile1: ".cam-tile >> nth=0", tile2: ".cam-tile >> nth=1", tile3: ".cam-tile >> nth=2",
  output: ".output-live", next: ".next-btn", plan: ".plan", slides: ".slide-grid", search: "#bible-q", verse16: ".verse-row[data-verse='16']",
  live: ".live-pill", sound: ".sound-state", keep: ".keep-btn >> nth=2", topbar: ".topbar", layout: ".layout-toggle", vu: ".vu" };
const rects = {};
const shot = async (name) => {
  await app.waitForTimeout(1600);
  await app.screenshot({ path: OUT + name + ".png" });
  rects[name] = {};
  for (const [k, sel] of Object.entries(SEL)) {
    const box = await app.locator(sel).first().boundingBox({ timeout: 300 }).catch(() => null);
    if (box) rects[name][k] = [box.x, box.y, box.width, box.height].map(Math.round);
  }
  console.log("✓", name);
};

const browser = await launch(["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"]);
const ctx = await browser.newContext({ viewport: { width: W, height: H }, locale: "fr-FR", deviceScaleFactor: 2 });
const app = await ctx.newPage();
await app.addInitScript(() => localStorage.getItem("regio.lang") || localStorage.setItem("regio.lang", "fr"));
await app.goto(BASE);
await app.evaluate(() => localStorage.clear());
await app.evaluate((lib) => localStorage.setItem("regio.data.library", JSON.stringify(lib)), SET === "a" ? library : libraryB);
await app.evaluate(() => localStorage.setItem("regio.data.live", JSON.stringify({ target: "page", key: "demo", quality: "720", record: false })));
await app.reload();
await app.fill("#port", SET === "a" ? "4481" : "4482");
await app.click("text=Se connecter");
await app.click("button:has-text('Choisir les caméras du jour'):not([disabled])", { timeout: 20000 });
await app.click(`.cam:has-text('${DEV[0]}') >> text=Utiliser cette caméra`);
await app.click(`.cam:has-text('${DEV[1]}') >> text=Utiliser cette caméra`);
await app.waitForSelector(".cam.is-main");
await shot("sources-qr");
const phone = await (await browser.newContext({ ignoreHTTPSErrors: true, permissions: ["camera", "microphone"], locale: "fr-FR" })).newPage();
await phone.goto(PHONE_BASE + "/phone.html?cam=1");
await phone.click("text=Démarrer la caméra");
await app.waitForSelector(".cam:has-text('Téléphone 1') .pill", { timeout: 15000 }).catch(() => {});
await shot("sources-phone");

const render = await ctx.newPage();
await render.goto(obs.state.inputs.find((i) => i.inputName === "Regio - Contenu").settings.url.replace("port=4455", SET === "a" ? "port=4481" : "port=4482"));
await app.bringToFront();
await app.click("role=button[name='Commencer']");
await app.waitForSelector(".regie");

// Caméras : 1, 2, 3 à l'écran (vidéo B).
await app.click(SET === "a" ? ".moment:has-text('Bénédiction')" : ".moment:has-text('Invitée')");
const tiles = app.locator(".cam-tile");
const camImgs = [CAMS[DEV[0]], CAMS[DEV[1]], CAMS.phone];
for (let i = 0; i < 3; i++) {
  if ((await tiles.count()) <= i) break;
  await tiles.nth(i).click();
  program = camImgs[i];
  await shot("regie-cam" + (i + 1));
}
// Son gardé (cadenas du téléphone).
await app.locator(".keep-btn").nth(2).click().catch(() => {});
await shot("regie-son");
await app.locator(".sound-state button").click().catch(() => {});

if (SET === "b") {
  // Bandeau « Awa Koné » sur la caméra, puis la diapo.
  await tiles.nth(0).click();
  await app.click(".layout-toggle >> text=Sur la caméra");
  await app.click(".item-card:has-text('Awa Koné') .item-main");
  program = lower(CAMS[DEV[0]], "Awa Koné", "FONDATRICE DU STUDIO KORA");
  await shot("regie-bandeau");
} else {
// Louange : diapo 2 à l'écran, puis Suivant → diapo 3 (vidéo A).
await tiles.nth(0).click();
await app.click(".moment:has-text('Louange')");
await app.click(".slide-card[data-slide='1']");
program = slide("Couplet 1", ["Brillant de lumière,", "l'ange est descendu,", "il roule la pierre", "du tombeau vaincu."]);
await shot("regie-louange-2");
await app.keyboard.press("Space");
program = slide("Refrain", ["À toi la gloire,", "ô Ressuscité !", "À toi la victoire", "pour l'éternité !"]);
await shot("regie-louange-3");

// Bible : recherche tapée, puis le verset à l'écran.
await app.click(".moment:has-text('Prédication')");
await app.click(".add-btn:has-text('Verset')");
await app.fill("#bible-q", "jn 3 16");
await shot("bible-tape");
await app.press("#bible-q", "Enter");
program = verse(["Car Dieu a tant aimé le monde qu'il a donné son Fils unique,", "afin que quiconque croit en lui ne périsse point,", "mais qu'il ait la vie éternelle."], "JEAN 3:16 · LSG 1910");
await shot("bible");

// Texte sur la caméra (bandeau).
await app.click(".back-btn");
await app.click(".layout-toggle >> text=Sur la caméra");
await app.click(".item-card:has-text('Jean 10:11') .item-main");
program = lower(CAMS[DEV[0]], "Je suis le bon berger. Le bon berger donne sa vie pour ses brebis.", "JEAN 10:11");
await shot("regie-bandeau");
}

// Le direct.
await app.click("button.live-go");
await app.click(".modal >> button:has-text('Passer en direct')");
await app.waitForSelector(".live-health", { timeout: 10000 });
await app.click(".fb-step >> text=C'est fait").catch(() => {});
await app.waitForTimeout(4000);
await shot("direct");

(await import("node:fs")).writeFileSync(OUT + "rects.json", JSON.stringify(rects, null, 1));
await browser.close();
obs.close();
console.log("Captures écrites dans", OUT);
