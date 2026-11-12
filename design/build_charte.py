"""Assemble design/charte-graphique.html : insère les vrais fichiers du logo dans le gabarit."""
import base64, re
from pathlib import Path

D = Path(__file__).parent
B = D / "brand"

def svg(name: str) -> str:
    s = (B / name).read_text(encoding="utf-8").strip()
    return re.sub(r"<title>.*?</title>", "", s)

def inner(name: str) -> str:
    return re.sub(r"^<svg[^>]*>|</svg>$", "", svg(name))

def png(name: str) -> str:
    return "data:image/png;base64," + base64.b64encode((B / "png" / name).read_bytes()).decode()

repl = {
    "{{LOCKUP_DARK}}": svg("regio-lockup-on-dark.svg"),
    "{{LOCKUP_LIGHT}}": svg("regio-lockup-on-light.svg"),
    "{{MARK_DARK}}": svg("regio-mark-on-dark.svg"),
    "{{MARK_LIGHT}}": svg("regio-mark-on-light.svg"),
    "{{MARK_MONO}}": svg("regio-mark-mono.svg"),
    "{{MARK_DARK_INNER}}": inner("regio-mark-on-dark.svg"),
    "{{ICON16}}": png("regio-icon-16.png"),
    "{{ICON32}}": png("regio-icon-32.png"),
}
html = (D / "charte-graphique.template.html").read_text(encoding="utf-8")
for k, v in repl.items():
    html = html.replace(k, v)
assert "{{" not in html, "marqueur non remplacé"
(D / "charte-graphique.html").write_text(html, encoding="utf-8")
print("écrit design/charte-graphique.html")
