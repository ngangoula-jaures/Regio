"""Construit public/bible/lsg1910.json à partir du texte public d'eBible.org (Louis Segond 1910, domaine public).

Usage : python3 scripts/build_bible.py [fraLSG_vpl.zip]   (sans argument : téléchargement)
Format produit : {"id","name","books":[{"code","name","chapters":[["v1","v2",…],…]}]}
"""
import io, json, re, urllib.request, zipfile
from pathlib import Path

URL = "https://ebible.org/Scriptures/fraLSG_vpl.zip"
OUT = Path(__file__).resolve().parent.parent / "public" / "bible" / "lsg1910.json"

# Codes eBible → noms français usuels (ordre canonique protestant, 66 livres).
NAMES = {
    "GEN": "Genèse", "EXO": "Exode", "LEV": "Lévitique", "NUM": "Nombres", "DEU": "Deutéronome", "JOS": "Josué",
    "JDG": "Juges", "RUT": "Ruth", "1SA": "1 Samuel", "2SA": "2 Samuel", "1KI": "1 Rois", "2KI": "2 Rois",
    "1CH": "1 Chroniques", "2CH": "2 Chroniques", "EZR": "Esdras", "NEH": "Néhémie", "EST": "Esther", "JOB": "Job",
    "PSA": "Psaumes", "PRO": "Proverbes", "ECC": "Ecclésiaste", "SOL": "Cantique des cantiques", "ISA": "Ésaïe",
    "JER": "Jérémie", "LAM": "Lamentations", "EZE": "Ézéchiel", "DAN": "Daniel", "HOS": "Osée", "JOE": "Joël",
    "AMO": "Amos", "OBA": "Abdias", "JON": "Jonas", "MIC": "Michée", "NAH": "Nahum", "HAB": "Habacuc",
    "ZEP": "Sophonie", "HAG": "Aggée", "ZEC": "Zacharie", "MAL": "Malachie",
    "MAT": "Matthieu", "MAR": "Marc", "LUK": "Luc", "JOH": "Jean", "ACT": "Actes", "ROM": "Romains",
    "1CO": "1 Corinthiens", "2CO": "2 Corinthiens", "GAL": "Galates", "EPH": "Éphésiens", "PHI": "Philippiens",
    "COL": "Colossiens", "1TH": "1 Thessaloniciens", "2TH": "2 Thessaloniciens", "1TI": "1 Timothée",
    "2TI": "2 Timothée", "TIT": "Tite", "PHM": "Philémon", "HEB": "Hébreux", "JAM": "Jacques", "1PE": "1 Pierre",
    "2PE": "2 Pierre", "1JO": "1 Jean", "2JO": "2 Jean", "3JO": "3 Jean", "JUD": "Jude", "REV": "Apocalypse",
}

def main():
    import sys
    if len(sys.argv) > 1:
        data = Path(sys.argv[1]).read_bytes()
    else:
        req = urllib.request.Request(URL, headers={"User-Agent": "Mozilla/5.0 (Regio bible builder)"})
        data = urllib.request.urlopen(req, timeout=60).read()
    text = zipfile.ZipFile(io.BytesIO(data)).read("fraLSG_vpl.txt").decode("utf-8")
    books, order = {}, []
    line_re = re.compile(r"^(\w{3}) (\d+):(\d+) (.*)$")
    for line in text.splitlines():
        m = line_re.match(line.strip())
        if not m:
            continue
        code, c, v, t = m.group(1), int(m.group(2)), int(m.group(3)), m.group(4).strip()
        if code not in books:
            books[code] = {}
            order.append(code)
        ch = books[code].setdefault(c, {})
        ch[v] = t
    out, gaps = [], 0
    for code in order:
        chapters = []
        for c in range(1, max(books[code]) + 1):
            verses = books[code].get(c, {})
            last = max(verses) if verses else 0
            row = [verses.get(v, "") for v in range(1, last + 1)]
            gaps += row.count("")
            chapters.append(row)
        out.append({"code": code, "name": NAMES[code], "chapters": chapters})
    assert len(out) == 66, len(out)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({"id": "lsg1910", "name": "Louis Segond 1910", "license": "Domaine public (source : eBible.org)", "books": out}, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    total = sum(len(v) for b in out for v in b["chapters"])
    print(f"écrit {OUT} : {len(out)} livres, {total} versets, {gaps} numéros vides, {OUT.stat().st_size // 1024} Ko")

if __name__ == "__main__":
    main()
