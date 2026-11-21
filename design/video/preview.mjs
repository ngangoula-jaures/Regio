// Planche d'aperçu : quelques instants clés d'une vidéo, pour vérifier la mise en page.
// Usage : node design/video/preview.mjs a|b 169|916 t1,t2,… sortie.png
import { launch } from "../../tests/e2e/browser.mjs";
import { serve } from "./static.mjs";
const srv = await serve(4701);
const BASE = srv.base;
const [v, fmt, times, outFile] = process.argv.slice(2);
const [W, H] = fmt === "916" ? [1080, 1920] : [1920, 1080];
const browser = await launch();
const page = await (await browser.newContext({ viewport: { width: W, height: H } })).newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
await page.goto(`${BASE}/design/video/film.html?v=${v}&fmt=${fmt}`);
await page.evaluate(() => window.filmReady);
const shots = [];
for (const t of times.split(",").map(Number)) {
  await page.evaluate((t) => window.seek(t), t);
  shots.push(await page.screenshot({ type: "jpeg", quality: 80 }));
}
await browser.close();
srv.close();
// Planche : les images côte à côte (réduites), via ffmpeg.
import fs from "node:fs";
import { execFileSync } from "node:child_process";
const dir = fs.mkdtempSync("/tmp/claude-1000/-home-vedem-worker-diff-church/6aad37d0-1b09-4d59-9731-39323750852f/scratchpad/pv-");
shots.forEach((b, i) => fs.writeFileSync(`${dir}/${i}.jpg`, b));
const cols = fmt === "916" ? 4 : 3;
const sw = fmt === "916" ? 360 : 640, sh = fmt === "916" ? 640 : 360;
const inputs = shots.flatMap((_, i) => ["-i", `${dir}/${i}.jpg`]);
const layout = shots.map((_, i) => `${(i % cols) * sw}_${Math.floor(i / cols) * sh}`).join("|");
const scales = shots.map((_, i) => `[${i}:v]scale=${sw}:${sh}[s${i}]`).join(";");
execFileSync("ffmpeg", ["-loglevel", "error", "-y", ...inputs, "-filter_complex", `${scales};${shots.map((_, i) => `[s${i}]`).join("")}xstack=inputs=${shots.length}:layout=${layout}:fill=black`, outFile]);
console.log(errors.length ? "ERREURS : " + errors.join(" | ") : "aucune erreur", "→", outFile);
