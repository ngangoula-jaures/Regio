// Exporte les vidéos en MP4 (H.264, 30 i/s) : chaque image est dessinée par film.html (seek), capturée, puis
// encodée par ffmpeg. Piste audio silencieuse (certains réseaux refusent une vidéo sans piste son).
// Usage : node design/video/render.mjs [a|b] [169|916]  (sans argument : les 4 vidéos) → design/video/out/
import fs from "node:fs";
import { spawn } from "node:child_process";
import { launch } from "../../tests/e2e/browser.mjs";
import { serve } from "./static.mjs";

const FPS = 30;
const OUT = new URL("./out/", import.meta.url).pathname;
fs.mkdirSync(OUT, { recursive: true });
const [onlyV, onlyF] = process.argv.slice(2);
const jobs = [];
for (const v of ["a", "b"]) for (const f of ["169", "916"]) if ((!onlyV || onlyV === v) && (!onlyF || onlyF === f)) jobs.push([v, f]);
const NAMES = { a: "Regio-eglises", b: "Regio-pour-tous" };

const srv = await serve(4702);
const browser = await launch();
for (const [v, fmt] of jobs) {
  const [W, H] = fmt === "916" ? [1080, 1920] : [1920, 1080];
  const page = await (await browser.newContext({ viewport: { width: W, height: H } })).newPage();
  await page.goto(`${srv.base}/design/video/film.html?v=${v}&fmt=${fmt}`);
  await page.evaluate(() => window.filmReady);
  const duration = await page.evaluate(() => window.DURATION);
  const file = `${OUT}${NAMES[v]}-${fmt === "916" ? "vertical-9x16" : "horizontal-16x9"}.mp4`;
  const ff = spawn("ffmpeg", ["-loglevel", "error", "-y", "-f", "image2pipe", "-c:v", "mjpeg", "-framerate", String(FPS), "-i", "-",
    "-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=48000",
    "-c:v", "libx264", "-preset", "medium", "-crf", "17", "-pix_fmt", "yuv420p", "-profile:v", "high", "-r", String(FPS),
    "-c:a", "aac", "-b:a", "128k", "-shortest", "-movflags", "+faststart", file], { stdio: ["pipe", "inherit", "inherit"] });
  const frames = Math.min(Math.round(duration * FPS), Number(process.env.RENDER_LIMIT || 1e9));
  const t0 = Date.now();
  for (let i = 0; i < frames; i++) {
    await page.evaluate((t) => window.seek(t), i / FPS);
    const img = await page.screenshot({ type: "jpeg", quality: 94 });
    if (!ff.stdin.write(img)) await new Promise((r) => ff.stdin.once("drain", r));
    if (i % 150 === 0) process.stdout.write(`${NAMES[v]} ${fmt} : ${Math.round((i / frames) * 100)} %\r`);
  }
  ff.stdin.end();
  await new Promise((r) => ff.on("close", r));
  await page.context().close();
  console.log(`✓ ${file.replace(OUT, "")} (${frames} images, ${Math.round((Date.now() - t0) / 1000)} s, ${(fs.statSync(file).size / 1048576).toFixed(1)} Mo)`);
}
await browser.close();
srv.close();
