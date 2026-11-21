// Prépare les fichiers d'une version pour GitHub (utilisé par .github/workflows/installeur.yml) :
//   latest.json (lu par les Regio installés pour se mettre à jour) et les notes de version (tirées du CHANGELOG).
// Usage : node scripts/release-files.mjs <version> <fichier .sig de la mise à jour> <dossier de sortie>
import fs from "node:fs";
import path from "node:path";

const [version, sigFile, outDir] = process.argv.slice(2);
if (!version || !sigFile || !outDir) {
  console.error("Usage : node scripts/release-files.mjs <version> <fichier.sig> <dossier>");
  process.exit(1);
}
const repo = "https://github.com/ngangoula-jaures/Regio";

// Notes : la section « ## [version] » du CHANGELOG, jusqu'à la section suivante.
// (fins de ligne normalisées : sous Windows, Git peut extraire le fichier en CRLF.)
const changelog = fs.readFileSync(new URL("../CHANGELOG.md", import.meta.url), "utf8").replace(/\r\n/g, "\n");
const start = changelog.search(new RegExp(`^## \\[?${version.replace(/\./g, "\\.")}\\]?`, "m"));
let notes = "";
if (start >= 0) {
  const rest = changelog.slice(start);
  const next = rest.slice(3).search(/^## /m);
  notes = (next >= 0 ? rest.slice(0, next + 3) : rest).replace(/^## .*\n/, "").trim();
}

const latest = {
  version,
  notes: notes.slice(0, 2000),
  pub_date: new Date().toISOString(),
  platforms: {
    "windows-x86_64": {
      signature: fs.readFileSync(sigFile, "utf8").trim(),
      url: `${repo}/releases/download/v${version}/Regio_${version}_x64-update.exe`,
    },
  },
};
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "latest.json"), JSON.stringify(latest, null, 2));
fs.writeFileSync(path.join(outDir, "notes.md"), notes || `Regio ${version}`);
console.log(`latest.json et notes.md écrits dans ${outDir} (notes : ${notes.length} caractères)`);
