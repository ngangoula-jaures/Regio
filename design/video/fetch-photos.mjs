// Télécharge les photos des vidéos (Unsplash, licence gratuite) en 2400 px de large → design/video/photos/ (non versionné).
import fs from "node:fs";
const list = JSON.parse(fs.readFileSync(new URL("./photos.json", import.meta.url)));
const dir = new URL("./photos/", import.meta.url).pathname;
fs.mkdirSync(dir, { recursive: true });
for (const [name, p] of Object.entries(list)) {
  if (name.startsWith("_")) continue;
  const file = `${dir}${name}.jpg`;
  if (fs.existsSync(file)) continue;
  const res = await fetch(`${p.url}?w=2400&q=85&fm=jpg`);
  if (!res.ok) { console.log("ÉCHEC", name, res.status); continue; }
  fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  console.log("✓", name, Math.round(fs.statSync(file).size / 1024), "Ko");
}
