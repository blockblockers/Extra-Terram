#!/usr/bin/env python3
"""Extra Terram — scripts/check-audio.py v0.2.0 — the seam check compares the seam with the music's own transitions

  python scripts/check-audio.py <drop-folder>        a folder laid out like public/audio (music/, sfx/)
  python scripts/check-audio.py public/audio          the game's own files

For every file: the id is one the game asks for; the encodings the handoff asks for are both there (ogg
and m4a); with ffprobe/ffmpeg installed: sample rate 48 kHz, channel count, duration inside the id's
range, integrated loudness and true peak (EBU R128) inside the id's window, no silence at the head of
an effect, and for loops a seam check: the step in level across the loop point is no bigger than the
music's own steps between beats, and the end does not fade below the piece's level. Prints OK / WARN /
FAIL per id and a count. Needs only the standard library; the measurements need ffmpeg.
"""
import json
import math
import re
import shutil
import subprocess
import sys
from pathlib import Path

FORMATS = ("ogg", "m4a", "mp3", "wav")
WORLDS = ("rootkin", "assembly", "chitin", "lumenari")
MUSIC_IDS = ["menu", "result-win", "result-lose"] + [f"world-{w}" for w in WORLDS] + [f"world-{w}-battle" for w in WORLDS]
SFX_IDS = [
    "fire-thorn", "fire-kinetic", "fire-acid", "fire-energy", "fire-splash", "fire-beam",
    "hit-thorn", "hit-kinetic", "hit-acid", "hit-energy", "hit-splash",
    "death-bark", "death-plated", "death-carapace", "death-shielded",
    "leak", "leak-boss", "lives-low",
    "place", "upgrade", "reinforce", "sell", "income",
    "wave-start", "wave-boss", "wave-clear", "boss-appear",
    "send", "incoming",
    "ui-tap", "ui-error",
]
# Music: seconds (min, max), integrated loudness LUFS (min, max), true peak dBTP max.
# Effects are too short for integrated loudness: their sample peak must sit in "peak_range" (dBFS); the
# mixer sets every effect's level relative to the others, so a delivery is peak-normalised, not mixed.
SPEC = {
    "music-loop": {"dur": (60.0, 240.0), "lufs": (-20.0, -14.0), "peak": -1.0},
    "music-sting": {"dur": (2.0, 10.0), "lufs": (-18.0, -12.0), "peak": -1.0},
    "fire": {"dur": (0.05, 0.6), "peak_range": (-9.0, -1.0)},
    "hit": {"dur": (0.03, 0.5), "peak_range": (-9.0, -1.0)},
    "death": {"dur": (0.15, 1.2), "peak_range": (-9.0, -1.0)},
    "cue": {"dur": (0.1, 2.5), "peak_range": (-9.0, -1.0)},
    "sting": {"dur": (0.5, 3.0), "peak_range": (-6.0, -1.0)},
    "ui": {"dur": (0.02, 0.4), "peak_range": (-12.0, -1.0)},
}
VARIATION = re.compile(r"^(.*?)-(\d+)$")


def kind_of(sid: str, music: bool) -> str:
    if music:
        return "music-sting" if sid.startswith("result-") else "music-loop"
    head = sid.split("-")[0]
    if head in ("fire", "hit", "death", "ui"):
        return head
    if sid in ("wave-start", "wave-boss", "boss-appear", "incoming", "lives-low"):
        return "sting"
    return "cue"


def probe(path: Path) -> dict | None:
    if not shutil.which("ffprobe"):
        return None
    try:
        out = subprocess.run(["ffprobe", "-v", "error", "-print_format", "json", "-show_streams", "-show_format", str(path)], capture_output=True, text=True, timeout=30)
        data = json.loads(out.stdout)
        st = next((s for s in data.get("streams", []) if s.get("codec_type") == "audio"), None)
        if not st:
            return None
        return {"rate": int(st.get("sample_rate", 0)), "channels": int(st.get("channels", 0)), "codec": st.get("codec_name"), "duration": float(data.get("format", {}).get("duration", 0) or st.get("duration", 0) or 0)}
    except (ValueError, subprocess.SubprocessError, json.JSONDecodeError):
        return None


def loudness(path: Path) -> tuple[float, float] | None:
    """(integrated LUFS, true peak dBTP) from ffmpeg's ebur128."""
    if not shutil.which("ffmpeg"):
        return None
    try:
        out = subprocess.run(["ffmpeg", "-nostats", "-i", str(path), "-filter_complex", "ebur128=peak=true", "-f", "null", "-"], capture_output=True, text=True, timeout=120)
        text = out.stderr
        i = re.search(r"I:\s+(-?[\d.]+) LUFS", text.split("Summary:")[-1])
        p = re.search(r"Peak:\s+(-?[\d.]+) dBFS", text.split("Summary:")[-1])
        return (float(i.group(1)) if i else float("nan"), float(p.group(1)) if p else float("nan"))
    except (ValueError, subprocess.SubprocessError):
        return None


def peak_dbfs(path: Path) -> float | None:
    """The sample peak in dBFS from ffmpeg's volumedetect."""
    if not shutil.which("ffmpeg"):
        return None
    try:
        out = subprocess.run(["ffmpeg", "-nostats", "-i", str(path), "-af", "volumedetect", "-f", "null", "-"], capture_output=True, text=True, timeout=60)
        m = re.search(r"max_volume:\s+(-?[\d.]+) dB", out.stderr)
        return float(m.group(1)) if m else None
    except (ValueError, subprocess.SubprocessError):
        return None


def pcm_window(path: Path, start: float | None, length: float) -> list[float] | None:
    """Mono float samples of a window (start None = the last `length` seconds)."""
    if not shutil.which("ffmpeg"):
        return None
    args = ["ffmpeg", "-v", "error"]
    if start is None:
        args += ["-sseof", f"-{length}"]
    else:
        args += ["-ss", f"{start}"]
    args += ["-i", str(path), "-t", f"{length}", "-ac", "1", "-ar", "48000", "-f", "f32le", "-"]
    try:
        out = subprocess.run(args, capture_output=True, timeout=60)
        import struct

        n = len(out.stdout) // 4
        return list(struct.unpack(f"<{n}f", out.stdout[: n * 4]))
    except (subprocess.SubprocessError, ValueError):
        return None


def seam_report(path: Path, duration: float) -> list[str]:
    """Loop seam: the level step from the file's end to its start, against the piece's own steps between 20 ms
    windows (a downbeat at the start is a step the music makes every bar); and the last second against the
    piece's typical second (a fade-out would be heard as a breath at every restart)."""
    if not shutil.which("ffmpeg"):
        return []
    args = ["ffmpeg", "-v", "error", "-i", str(path), "-ac", "1", "-ar", "12000", "-f", "f32le", "-"]
    try:
        out = subprocess.run(args, capture_output=True, timeout=120).stdout
    except subprocess.SubprocessError:
        return []
    import array

    a = array.array("f")
    a.frombytes(out[: len(out) // 4 * 4])
    if len(a) < 12000 * 4:
        return []
    w = 240  # 20 ms at 12 kHz
    levels = []
    for i in range(0, len(a) - w, w):
        seg = a[i : i + w]
        levels.append(math.sqrt(sum(x * x for x in seg) / w))
    floor = max(1e-6, max(levels) * 1e-3)
    db = [20 * math.log10(max(v, floor)) for v in levels]
    steps1 = sorted(abs(db[i + 1] - db[i]) for i in range(len(db) - 1))
    steps2 = sorted(abs(db[i + 2] - db[i]) for i in range(len(db) - 2))
    typical = max(steps1[int(len(steps1) * 0.98)], steps2[int(len(steps2) * 0.98)]) if steps2 else 0.0
    seam = abs(db[0] - db[-1])
    msgs = []
    if seam > max(6.0, typical + 2.0):
        msgs.append(f"the loop's end is {seam:.1f} dB off its start, more than the music's own steps ({typical:.1f} dB); the seam will be heard")
    sec = 50  # windows per second
    seconds = [sum(levels[i : i + sec]) / sec for i in range(0, len(levels) - sec, sec)]
    if len(seconds) > 4:
        med = sorted(seconds)[len(seconds) // 2]
        last = seconds[-1]
        if last > 0 and med / last > 2.0:
            msgs.append(f"the last second is {20 * math.log10(med / last):.1f} dB under the piece's typical level: it fades out, so every restart breathes")
    _ = duration
    return msgs


def rms(samples: list[float]) -> float:
    return (sum(s * s for s in samples) / max(1, len(samples))) ** 0.5


def main() -> None:
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(2)
    drop = Path(sys.argv[1]).resolve()
    ok = warn = fail = 0
    have_tools = bool(shutil.which("ffprobe") and shutil.which("ffmpeg"))
    if not have_tools:
        print("ffprobe/ffmpeg not found: names and encodings only, no measurements")

    for folder, music in (("music", True), ("sfx", False)):
        d = drop / folder
        if not d.is_dir():
            continue
        groups: dict[str, dict[str, list[Path]]] = {}
        for p in sorted(d.iterdir()):
            ext = p.suffix.lower().lstrip(".")
            if ext not in FORMATS:
                continue
            stem = p.stem
            sid = stem if music else (VARIATION.match(stem).group(1) if VARIATION.match(stem) else stem)
            groups.setdefault(sid, {}).setdefault(stem, []).append(p)
        for sid, stems in groups.items():
            msgs: list[str] = []
            level = "OK"
            known = sid in (MUSIC_IDS if music else SFX_IDS)
            if not known:
                msgs.append("FAIL the game never asks for this id (see audio/AUDIO_HANDOFF.md for the list)")
            spec = SPEC[kind_of(sid, music)]
            for stem, files in stems.items():
                exts = {p.suffix.lower().lstrip(".") for p in files}
                if "ogg" not in exts or "m4a" not in exts:
                    msgs.append(f"WARN {stem}: has {', '.join(sorted(exts))}; the handoff asks for ogg and m4a of every sound")
                if not have_tools:
                    continue
                ref = next((p for p in files if p.suffix.lower() == ".ogg"), files[0])
                info = probe(ref)
                if not info:
                    msgs.append(f"WARN {stem}: could not be read")
                    continue
                if info["rate"] != 48000:
                    msgs.append(f"WARN {stem}: {info['rate']} Hz, the handoff asks for 48 kHz")
                if music and info["channels"] != 2:
                    msgs.append(f"WARN {stem}: {info['channels']} channel(s); music is stereo")
                if not music and info["channels"] not in (1, 2):
                    msgs.append(f"WARN {stem}: {info['channels']} channels")
                lo, hi = spec["dur"]
                if not lo <= info["duration"] <= hi:
                    msgs.append(f"WARN {stem}: {info['duration']:.2f} s, expected {lo}–{hi} s")
                if "lufs" in spec:
                    lu = loudness(ref)
                    if lu:
                        i, pk = lu
                        llo, lhi = spec["lufs"]
                        if i == i and not llo <= i <= lhi:
                            msgs.append(f"WARN {stem}: {i:.1f} LUFS, expected {llo} to {lhi}")
                        if pk == pk and pk > spec["peak"]:
                            msgs.append(f"FAIL {stem}: true peak {pk:.1f} dBTP, over {spec['peak']}")
                else:
                    pk = peak_dbfs(ref)
                    plo, phi = spec["peak_range"]
                    if pk is not None and not plo <= pk <= phi:
                        msgs.append(f"WARN {stem}: peaks at {pk:.1f} dBFS, expected {plo} to {phi} (normalise the peak; the mixer sets the level)")
                if not music:
                    head = pcm_window(ref, 0.0, 0.02)
                    if head and rms(head) < 1e-4 and info["duration"] > 0.05:
                        msgs.append(f"WARN {stem}: starts with silence; trim the head so the sound lands on the event")
                elif not sid.startswith("result-"):
                    for m in seam_report(ref, info["duration"]):
                        msgs.append(f"WARN {stem}: {m}")
            if any(m.startswith("FAIL") for m in msgs):
                level = "FAIL"
                fail += 1
            elif msgs:
                level = "WARN"
                warn += 1
            else:
                ok += 1
            print(f"{level:4s}  {folder}/{sid}" + (f"  ({len(stems)} variation(s))" if not music and len(stems) > 1 else ""))
            for m in msgs:
                print(f"      {m[5:] if m[:4] in ('WARN', 'FAIL') else m}")

    missing_music = [m for m in MUSIC_IDS if not (drop / "music").is_dir() or not any((drop / "music").glob(f"{m}.*"))]
    missing_sfx = [s for s in SFX_IDS if not (drop / "sfx").is_dir() or not (any((drop / "sfx").glob(f"{s}.*")) or any((drop / "sfx").glob(f"{s}-[0-9]*.*")))]
    print(f"\n{ok} OK, {warn} to look at, {fail} failing. Not in this delivery (placeholders play): {len(missing_music)} music id(s), {len(missing_sfx)} effect id(s)")
    if missing_music:
        print("  music: " + ", ".join(missing_music))
    if missing_sfx:
        print("  sfx: " + ", ".join(missing_sfx))


if __name__ == "__main__":
    main()
