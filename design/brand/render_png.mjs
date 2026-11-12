// Rend les icônes PNG de Regio à partir des SVG (Chromium sans interface).
// Usage : node design/brand/render_png.mjs   → design/brand/png/
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { launch } from "../../tests/e2e/browser.mjs";

const dir = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(dir, "png");
fs.mkdirSync(out, { recursive: true });
const read = (f) => fs.readFileSync(path.join(dir, f), "utf8");

const SIZES = [16, 20, 24, 32, 40, 48, 64, 128, 256, 512, 1024];
const browser = await launch();
const page = await browser.newPage();
for (const s of SIZES) {
  const src = s <= 32 ? "regio-icon-small.svg" : "regio-icon.svg"; // traits renforcés en petit
  await page.setViewportSize({ width: s, height: s });
  await page.setContent(`<html><body style="margin:0;background:transparent">${read(src).replace("<svg ", `<svg width="${s}" height="${s}" `)}</body></html>`);
  await page.screenshot({ path: path.join(out, `regio-icon-${s}.png`), omitBackground: true, clip: { x: 0, y: 0, width: s, height: s } });
}
for (const f of ["regio-lockup-on-dark.svg", "regio-lockup-on-light.svg"]) {
  const svg = read(f);
  const [, , w, h] = svg.match(/viewBox="([^"]+)"/)[1].split(" ").map(Number);
  const H = 240, W = Math.round((w / h) * H);
  await page.setViewportSize({ width: W, height: H });
  await page.setContent(`<html><body style="margin:0">${svg.replace("<svg ", `<svg width="${W}" height="${H}" `)}</body></html>`);
  await page.screenshot({ path: path.join(out, f.replace(".svg", ".png")), omitBackground: true, clip: { x: 0, y: 0, width: W, height: H } });
}
await browser.close();
console.log("PNG écrits dans", out);
