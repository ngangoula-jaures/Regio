"""Assemble un .ico Windows multi-tailles à partir des PNG (petites tailles = dessin renforcé)."""
import struct
from pathlib import Path

PNG = Path(__file__).parent / "png"
SIZES = [16, 20, 24, 32, 40, 48, 64, 256]

def build(dest: Path):
    images = [(s, (PNG / f"regio-icon-{s}.png").read_bytes()) for s in SIZES]
    header = struct.pack("<HHH", 0, 1, len(images))
    offset = 6 + 16 * len(images)
    entries, data = b"", b""
    for s, png in images:
        dim = 0 if s >= 256 else s  # 0 = 256 dans le format ICO
        entries += struct.pack("<BBBBHHII", dim, dim, 0, 0, 1, 32, len(png), offset + len(data))
        data += png
    dest.write_bytes(header + entries + data)

if __name__ == "__main__":
    import sys
    build(Path(sys.argv[1]))
