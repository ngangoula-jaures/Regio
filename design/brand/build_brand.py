"""Génère les fichiers du logo Regio (SVG, PNG, ICO) à partir d'une seule définition.

Usage : python design/brand/build_brand.py   (nécessite fonttools)
Les PNG sont rendus ensuite par tests/e2e/render-brand.mjs (Chromium).
"""
from pathlib import Path
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen

OUT = Path(__file__).parent
NUIT, NUIT_BORD, IVOIRE, OR = "#0E1530", "#253055", "#F6F2E8", "#E8B44C"

# --- Le symbole : un écran contenant un « r » dont le bras se termine en point de lumière ---
# Deux dessins : « grand » (≥ 48 px) et « petit » (≤ 32 px, traits renforcés).
GEOM = {
    "large": dict(frame=(9.5, 19.5, 81, 61, 15), fw=7, rw=9,
                  stem="M36.5 63 V43", arch="M36.5 51 C36.5 42 43.5 37 52.5 37", dot=(62.5, 37, 6)),
    "small": dict(frame=(8, 17, 84, 66, 16), fw=10, rw=12,
                  stem="M35.5 64 V45", arch="M35.5 53 C35.5 44 42 39 50 39", dot=(63.5, 39, 7.5)),
}

def mark(ink: str, gold: str = OR, size: str = "large") -> str:
    g = GEOM[size]
    x, y, w, h, r = g["frame"]
    cx, cy, cr = g["dot"]
    return (f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{r}" fill="none" stroke="{ink}" stroke-width="{g["fw"]}"/>'
            f'<path d="{g["stem"]}" fill="none" stroke="{ink}" stroke-width="{g["rw"]}" stroke-linecap="round"/>'
            f'<path d="{g["arch"]}" fill="none" stroke="{ink}" stroke-width="{g["rw"]}" stroke-linecap="round"/>'
            f'<circle cx="{cx}" cy="{cy}" r="{cr}" fill="{gold}"/>')

def svg(body: str, w: float, h: float, label: str) -> str:
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w:g} {h:g}" role="img" aria-label="{label}">'
            f'<title>{label}</title>{body}</svg>\n')

def icon(size: str = "large") -> str:
    # Tuile d'application : carré arrondi bleu nuit, symbole ivoire et or.
    scale, off = (0.72, 14) if size == "large" else (0.86, 7)
    return (f'<rect width="100" height="100" rx="22" fill="{NUIT}"/>'
            f'<g transform="translate({off} {off}) scale({scale})">{mark(IVOIRE, size=size)}</g>')

# --- Le nom « regio » vectorisé en Sora SemiBold, approche resserrée ---
def wordmark_path(text: str = "regio", weight: int = 600, tracking: float = -0.03):
    font = instantiateVariableFont(TTFont(OUT / "fonts" / "Sora[wght].ttf"), {"wght": weight})
    upem = font["head"].unitsPerEm
    cmap, gs, hmtx = font.getBestCmap(), font.getGlyphSet(), font["hmtx"]
    pen = SVGPathPen(gs)
    x = 0.0
    for ch in text:
        name = cmap[ord(ch)]
        gs[name].draw(TransformPen(pen, (1, 0, 0, -1, x, 0)))  # y vers le bas (SVG)
        x += hmtx[name][0] + tracking * upem
    x -= tracking * upem
    xh = font["OS/2"].sxHeight
    return pen.getCommands(), x, upem, xh

def lockup(ink: str) -> tuple[str, float, float]:
    path, adv, upem, xh = wordmark_path()
    fs = 77 / upem                       # taille du nom : 0,77 × la hauteur du symbole
    gap = 27
    base = 50 + xh * fs / 2              # x-hauteur centrée sur l'écran du symbole
    body = (mark(ink) +
            f'<g transform="translate({100 + gap} {base:.2f}) scale({fs:.5f})"><path d="{path}" fill="{ink}"/></g>')
    return body, 100 + gap + adv * fs + 4, 100

def main():
    files = {
        "regio-mark-on-dark.svg": svg(mark(IVOIRE), 100, 100, "Regio"),
        "regio-mark-on-light.svg": svg(mark(NUIT), 100, 100, "Regio"),
        "regio-mark-mono.svg": svg(mark("currentColor", "currentColor"), 100, 100, "Regio"),
        "regio-mark-small-on-dark.svg": svg(mark(IVOIRE, size="small"), 100, 100, "Regio"),
        "regio-mark-small-on-light.svg": svg(mark(NUIT, size="small"), 100, 100, "Regio"),
        "regio-icon.svg": svg(icon("large"), 100, 100, "Regio"),
        "regio-icon-small.svg": svg(icon("small"), 100, 100, "Regio"),
    }
    for tone, ink in (("on-dark", IVOIRE), ("on-light", NUIT)):
        body, w, h = lockup(ink)
        files[f"regio-lockup-{tone}.svg"] = svg(body, round(w, 1), h, "Regio")
    for name, content in files.items():
        (OUT / name).write_text(content, encoding="utf-8")
        print("écrit", name)

if __name__ == "__main__":
    main()
