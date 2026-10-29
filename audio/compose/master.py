"""Master the rendered pieces: integrated loudness to the brief's targets (ffmpeg ebur128 measures), a true-peak
ceiling of -1 dBTP, then the game's encodes (OGG q6, AAC 192k) straight into public/audio/music."""
import json
import os
import re
import subprocess
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(__file__))
from engine import SR, limiter, write_wav24  # noqa: E402

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "out")  # masters/ and mastered/, git-ignored
MUSIC = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "public", "audio", "music"))
TARGET = {"menu": -15.0, "result-win": -14.0, "result-lose": -14.0}
for w in ("rootkin", "assembly", "chitin", "lumenari"):
    TARGET[f"world-{w}"] = -18.0
    TARGET[f"world-{w}-battle"] = -16.0


def measure(path: str) -> tuple[float, float]:
    r = subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-i", path, "-af", "ebur128=peak=true", "-f", "null", "-"], capture_output=True, text=True)
    txt = r.stderr
    lufs = float(re.findall(r"I:\s+(-?[\d.]+) LUFS", txt)[-1])
    tp = float(re.findall(r"Peak:\s+(-?[\d.]+) dBFS", txt)[-1])
    return lufs, tp


def decode(path: str) -> np.ndarray:
    out = subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-f", "f32le", "-ac", "2", "-ar", str(SR), "-"], capture_output=True).stdout
    return np.frombuffer(out, dtype=np.float32).reshape(-1, 2).astype(np.float64)


def master(name: str) -> dict:
    src = f"{ROOT}/masters/{name}.wav"
    x = decode(src)
    lufs, tp = measure(src)
    gain = 10 ** ((TARGET[name] - lufs) / 20)
    y = x * gain
    # ceiling: true peak sits a little above the sample peak; aim at -1.6 dBFS sample peak
    y = limiter(y, ceiling=10 ** (-1.6 / 20), lookahead_ms=5, release_ms=120)
    out = f"{ROOT}/mastered/{name}.wav"
    write_wav24(out, y)
    lufs2, tp2 = measure(out)
    # a second trim if the limiter pulled the loudness down
    if abs(lufs2 - TARGET[name]) > 0.4:
        y = y * 10 ** ((TARGET[name] - lufs2) / 20)
        y = limiter(y, ceiling=10 ** (-1.6 / 20), lookahead_ms=5, release_ms=120)
        write_wav24(out, y)
        lufs2, tp2 = measure(out)
    enc = MUSIC
    os.makedirs(enc, exist_ok=True)
    subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", out, "-ar", "48000", "-c:a", "libvorbis", "-qscale:a", "6", f"{enc}/{name}.ogg"], check=True)
    subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", out, "-ar", "48000", "-c:a", "aac", "-b:a", "192k", f"{enc}/{name}.m4a"], check=True)
    return {"id": name, "seconds": round(len(y) / SR, 3), "lufs": lufs2, "true_peak": tp2, "gain_db": round(20 * np.log10(gain), 1)}


if __name__ == "__main__":
    os.makedirs(f"{ROOT}/mastered", exist_ok=True)
    names = sys.argv[1:] or list(TARGET)
    report = []
    for n in names:
        r = master(n)
        report.append(r)
        print(f"{r['id']:24s} {r['seconds']:8.2f} s  {r['lufs']:6.1f} LUFS  TP {r['true_peak']:5.1f} dBTP  (gain {r['gain_db']:+.1f} dB)")
    json.dump(report, open(f"{ROOT}/master-report.json", "w"), indent=2)
