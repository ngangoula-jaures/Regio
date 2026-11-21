// Petit serveur statique (racine du dépôt) pour le film : pas de rechargement automatique comme Vite.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
const ROOT = new URL("../../", import.meta.url).pathname;
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".woff2": "font/woff2", ".woff": "font/woff", ".svg": "image/svg+xml" };
export function serve(port = 4700) {
  const server = http.createServer((req, res) => {
    const f = path.join(ROOT, decodeURIComponent(req.url.split("?")[0]));
    if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { "content-type": TYPES[path.extname(f)] ?? "application/octet-stream" });
    fs.createReadStream(f).pipe(res);
  });
  return new Promise((ok) => server.listen(port, "127.0.0.1", () => ok({ base: `http://127.0.0.1:${port}`, close: () => server.close() })));
}
