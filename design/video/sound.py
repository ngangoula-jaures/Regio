"""Bande son des vidéos : voix-off (voix neuronales Microsoft via edge-tts) + musique libre (Mixkit, licence gratuite
sans attribution), mixées sur les MP4 de out/ (l'image est copiée telle quelle).

Usage : python3 design/video/sound.py            (pip install edge-tts ; ffmpeg requis)
Textes, horaires, voix et musiques : sound.json. Chaque phrase est placée à son début ; si elle dépasse sa fenêtre,
elle est régénérée un peu plus vite. La musique baisse automatiquement sous la voix (sidechain).
"""
import asyncio, json, os, subprocess, sys, urllib.request

import edge_tts

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "out")
WORK = os.path.join(HERE, "sound")
NAMES = {"a": "Regio-eglises", "b": "Regio-pour-tous"}
FMTS = ["horizontal-16x9", "vertical-9x16"]
DURATION = 45.0


def duration(path):
    r = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path],
                       capture_output=True, text=True, check=True)
    return float(r.stdout.strip())


async def tts(text, voice, rate, path):
    await edge_tts.Communicate(text, voice, rate=f"{rate:+d}%").save(path)


def line_audio(v, i, start, end, text, voice):
    """Génère la phrase ; accélère (jusqu'à +15 %, au-delà la voix paraît pressée) si elle déborde de sa fenêtre."""
    raw = os.path.join(WORK, f"{v}-{i:02d}.mp3")
    path = os.path.join(WORK, f"{v}-{i:02d}.wav")
    for rate in (0, 5, 10, 15):
        asyncio.run(tts(text, voice, rate, raw))
        # La synthèse ajoute du silence au début et à la fin : on le retire pour placer la voix au plus juste.
        trim = "silenceremove=start_periods=1:start_threshold=-45dB"
        subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", raw, "-af",
                        f"{trim},areverse,{trim},areverse,apad=pad_dur=0.05", path], check=True)
        d = duration(path)
        if start + d <= end + 0.15:
            break
    print(f"  {v}{i:02d} {start:5.1f}–{start + d:5.1f} (fenêtre {end:4.1f}, vitesse +{rate} %) {text}")
    if start + d > end + 0.3:
        print("  ! déborde : raccourcir le texte", file=sys.stderr)
    return path


def main():
    os.makedirs(WORK, exist_ok=True)
    cfg = json.load(open(os.path.join(HERE, "sound.json"), encoding="utf-8"))
    for v, c in cfg.items():
        music = os.path.join(WORK, f"music-{v}.mp3")
        if not os.path.exists(music):
            urllib.request.urlretrieve(c["music"]["url"], music)
        lines = [(line_audio(v, i, s, e, t, c["voice"]), s) for i, (s, e, t) in enumerate(c["lines"])]

        # Voix : chaque phrase retardée à son début, puis mélangées en une piste.
        inputs, filters, labels = [], [], []
        for k, (p, s) in enumerate(lines):
            inputs += ["-i", p]
            ms = int(s * 1000)
            filters.append(f"[{k}:a]aresample=48000,aformat=channel_layouts=stereo,adelay={ms}|{ms}[l{k}]")
            labels.append(f"[l{k}]")
        n = len(lines)
        off = c["music"]["offset"]
        inputs += ["-ss", str(off), "-t", str(DURATION), "-i", music]
        filters += [
            "".join(labels) + f"amix=inputs={n}:normalize=0,apad=whole_dur={DURATION},"
            "highpass=f=80,acompressor=threshold=-20dB:ratio=3:attack=5:release=120,volume=2.2dB,asplit=2[voice][key]",
            # Musique discrète, qui se retire sous la voix ; fondu d'entrée et de sortie.
            f"[{n}:a]aresample=48000,aformat=channel_layouts=stereo,volume=-15dB,"
            f"afade=t=in:st=0:d=0.6,afade=t=out:st={DURATION - 2.8}:d=2.8[mus]",
            "[mus][key]sidechaincompress=threshold=0.03:ratio=5:attack=40:release=450[duck]",
            "[duck][voice]amix=inputs=2:normalize=0,loudnorm=I=-14:TP=-1.5:LRA=9,atrim=0:" + str(DURATION) + "[out]",
        ]
        mix = os.path.join(WORK, f"mix-{v}.wav")
        subprocess.run(["ffmpeg", "-loglevel", "error", "-y", *inputs, "-filter_complex", ";".join(filters),
                        "-map", "[out]", "-ar", "48000", mix], check=True)

        for f in FMTS:
            src = os.path.join(OUT, f"{NAMES[v]}-{f}.mp4")
            dst = os.path.join(OUT, f"{NAMES[v]}-{f}-son.mp4")
            subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", src, "-i", mix, "-map", "0:v", "-map", "1:a",
                            "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-shortest", "-movflags", "+faststart", dst],
                           check=True)
            print(f"✓ {os.path.basename(dst)}")


if __name__ == "__main__":
    main()
