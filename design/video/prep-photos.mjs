// Prépare les photos pour un rendu rapide : réduites (1920 px) et versions floutées d'avance (le flou CSS,
// recalculé à chaque image, ralentissait énormément l'export). → photos/web/<nom>.jpg et <nom>-flou<N>.jpg
import fs from "node:fs";
import { execFileSync } from "node:child_process";
const dir = new URL("./photos/", import.meta.url).pathname;
const out = dir + "web/";
fs.mkdirSync(out, { recursive: true });
const BLURS = [3, 4, 5, 6, 8];
for (const f of fs.readdirSync(dir).filter((f) => f.endsWith(".jpg"))) {
  const name = f.replace(".jpg", "");
  const run = (vf, file) => fs.existsSync(file) || execFileSync("ffmpeg", ["-loglevel", "error", "-y", "-i", dir + f, "-vf", vf, "-q:v", "3", file]);
  run("scale='min(1920,iw)':-2", `${out}${name}.jpg`);
  // Flou équivalent au flou CSS (rayon ~ N px à l'échelle de l'écran) : sur une image réduite, puis agrandie.
  for (const b of BLURS) run(`scale=960:-2,gblur=sigma=${b * 0.6},scale=1920:-2`, `${out}${name}-flou${b}.jpg`);
}
console.log("photos prêtes :", fs.readdirSync(out).length, "fichiers");
