// Captures d'écran de démonstration pour la page GitHub (contenu fictif, aucune vraie personne).
// Prérequis : `npm run dev` lancé. Usage : node scripts/screenshots.mjs  → docs/screenshots/*.png
import { launch, BASE, PHONE_BASE } from "../tests/e2e/browser.mjs";
import { startFakeObs } from "../tests/e2e/fake-obs.mjs";

const OUT = new URL("../docs/screenshots/", import.meta.url).pathname;
const obs = startFakeObs(4480);
const W = 1600, H = 900;
const b64 = (s) => "data:image/svg+xml;base64," + Buffer.from(s).toString("base64");

// Image de caméra illustrée : une scène (pupitre, silhouette), teinte différente par caméra.
const camera = (bg, glow, w = 640) =>
  b64(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${Math.round((w * 9) / 16)}" viewBox="0 0 160 90" preserveAspectRatio="xMidYMid slice"><rect width="160" height="90" fill="${bg}"/><ellipse cx="80" cy="22" rx="70" ry="40" fill="${glow}" opacity=".55"/><rect y="66" width="160" height="24" fill="#000" opacity=".25"/><circle cx="80" cy="33" r="8.5" fill="#1b1714"/><path d="M61 72C61 52 70 45 80 45S99 52 99 72Z" fill="#1b1714"/><path d="M58 61H102L97 90H63Z" fill="#2b221c"/><rect x="58" y="59" width="44" height="4" rx="1.5" fill="#3a2e25"/></svg>`);
const CAMS = { "Cam Link 4K": camera("#2a211b", "#c9a27a"), "Webcam intégrée HP TrueVision HD Camera": camera("#1d2430", "#8aa3c4"), phone: camera("#1c2a26", "#8fbfa8") };
let program = CAMS["Cam Link 4K"];
obs.state.shotFor = (source) => (source === "Regio - Sortie" ? program : source.includes("Téléphone") ? CAMS.phone : (CAMS[source.replace("Regio - Caméra : ", "")] ?? CAMS["Cam Link 4K"]));

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

const browser = await launch(["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"]);
const ctx = await browser.newContext({ viewport: { width: W, height: H }, locale: "fr-FR", deviceScaleFactor: 1 });
const app = await ctx.newPage();
await app.goto(BASE);
await app.evaluate(() => localStorage.clear());
await app.reload();
await app.fill("#port", "4480");
await app.click("text=Se connecter");
await app.click("button:has-text('Choisir les caméras du jour'):not([disabled])", { timeout: 20000 });
await app.click(".cam:has-text('Cam Link 4K') >> text=Utiliser cette caméra");
await app.waitForSelector(".cam.is-main");
// Un téléphone connecté (caméra simulée).
const phone = await (await browser.newContext({ ignoreHTTPSErrors: true, permissions: ["camera", "microphone"], locale: "fr-FR" })).newPage();
await phone.goto(PHONE_BASE + "/phone.html?cam=1");
await phone.click("text=Démarrer la caméra");
await app.waitForSelector(".cam:has-text('Téléphone 1')", { timeout: 15000 }).catch(() => {});
await app.waitForTimeout(1500);
await app.screenshot({ path: OUT + "cameras-du-jour.png" });

// Programme de démonstration, puis la régie.
await app.evaluate((lib) => localStorage.setItem("regio.data.library", JSON.stringify(lib)), library);
await app.evaluate(() => localStorage.setItem("regio.data.live", JSON.stringify({ target: "page", key: "demo", quality: "720", record: true })));
await app.reload();
await app.fill("#port", "4480");
await app.click("text=Se connecter");
await app.click("button:has-text('Choisir les caméras du jour'):not([disabled])", { timeout: 20000 });
// La page d'affichage que charge OBS (sinon la régie signale qu'elle ne répond pas).
const render = await ctx.newPage();
await render.goto(obs.state.inputs.find((i) => i.inputName === "Regio - Contenu").settings.url.replace("port=4455", "port=4480"));
await app.click("role=button[name='Commencer']");
await app.waitForTimeout(1500);
await app.click(".moment:has-text('Louange')");
await app.click(".slide-card[data-slide='2']");
program = slide("Refrain", ["À toi la gloire,", "ô Ressuscité !", "À toi la victoire", "pour l'éternité !"]);
await app.waitForTimeout(2200);
await app.screenshot({ path: OUT + "regie.png" });

// La Bible et la lecture suivie.
await app.click(".moment:has-text('Prédication')");
await app.click(".add-btn:has-text('Verset')");
await app.fill("#bible-q", "jn 3 16");
await app.press("#bible-q", "Enter");
program = verse(["Car Dieu a tant aimé le monde qu'il a donné son Fils unique,", "afin que quiconque croit en lui ne périsse point,", "mais qu'il ait la vie éternelle."], "JEAN 3:16 · LSG 1910");
await app.waitForTimeout(2200);
await app.screenshot({ path: OUT + "bible.png" });

// Le direct sur Facebook.
await app.click(".back-btn");
await app.click(".item-card:has-text('Jean 10:11') .item-main");
program = verse(["Je suis le bon berger.", "Le bon berger donne sa vie pour ses brebis."], "JEAN 10:11 · LSG 1910");
await app.click("button.live-go");
await app.click(".modal >> button:has-text('Passer en direct')");
await app.waitForSelector(".live-health", { timeout: 10000 });
await app.click(".fb-step >> text=C'est fait");
await app.waitForTimeout(6000);
await app.screenshot({ path: OUT + "direct.png" });

await browser.close();
obs.close();
console.log("Captures écrites dans", OUT);
