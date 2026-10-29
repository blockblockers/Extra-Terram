#!/usr/bin/env python3
"""Extra Terram — scripts/audio-manifest.py v0.1.0 — write public/audio/manifest.json from the sound files in public/audio/

  python scripts/audio-manifest.py            scan public/audio/music and public/audio/sfx, write the manifest
  python scripts/audio-manifest.py --check    only report what would be written

Layout the script expects (the audio handoff, audio/AUDIO_HANDOFF.md, says the same):
  public/audio/music/<id>.<ext>            one file per music id: menu, world-<world>, world-<world>-battle,
                                           result-win, result-lose
  public/audio/sfx/<id>-<n>.<ext>          variations of a sound effect, n = 1, 2, 3 …; or <id>.<ext> for one
Every file may come in several encodings (ogg, m4a, mp3, wav); the game picks the first its browser can decode.
Loop points and gain trims come from audio/loops.json ({"world-rootkin": {"loop": [0.0, 96.0], "gain": 0.9}}),
kept by hand from the composer's notes; durations are read with ffprobe when it is installed. The game asks for
ids only: an id missing here plays its placeholder, so the manifest is always safe to write.
"""
import json
import re
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
AUDIO = ROOT / "public" / "audio"
LOOPS = ROOT / "audio" / "loops.json"
FORMATS = ("ogg", "m4a", "mp3", "wav")
VARIATION = re.compile(r"^(.*?)-(\d+)$")


def duration(path: Path) -> float | None:
    if not shutil.which("ffprobe"):
        return None
    try:
        out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)], capture_output=True, text=True, timeout=30)
        return round(float(out.stdout.strip()), 3) if out.returncode == 0 and out.stdout.strip() else None
    except (ValueError, subprocess.SubprocessError):
        return None


def scan(folder: Path) -> dict[str, dict[str, Path]]:
    """{stem: {ext: path}} for every sound file in a folder."""
    found: dict[str, dict[str, Path]] = {}
    if not folder.is_dir():
        return found
    for p in sorted(folder.iterdir()):
        ext = p.suffix.lower().lstrip(".")
        if ext in FORMATS:
            found.setdefault(p.stem, {})[ext] = p
    return found


def main() -> None:
    check = "--check" in sys.argv
    loops = json.loads(LOOPS.read_text()) if LOOPS.exists() else {}
    manifest: dict = {"version": 1, "music": {}, "sfx": {}}

    for stem, files in scan(AUDIO / "music").items():
        formats = [f for f in FORMATS if f in files]
        entry: dict = {"file": f"music/{stem}", "formats": formats}
        meta = loops.get(stem, {})
        if "loop" in meta:
            entry["loop"] = meta["loop"]
        if "gain" in meta:
            entry["gain"] = meta["gain"]
        d = duration(files[formats[0]])
        if d is not None:
            entry["duration"] = d
        manifest["music"][stem] = entry

    groups: dict[str, list[str]] = {}
    sfx_files = scan(AUDIO / "sfx")
    for stem in sfx_files:
        m = VARIATION.match(stem)
        sid = m.group(1) if m else stem
        groups.setdefault(sid, []).append(stem)
    for sid, stems in sorted(groups.items()):
        stems.sort(key=lambda s: int(VARIATION.match(s).group(2)) if VARIATION.match(s) else 0)
        formats = sorted({f for s in stems for f in sfx_files[s]}, key=FORMATS.index)
        entry = {"files": [f"sfx/{s}" for s in stems], "formats": formats}
        meta = loops.get(sid, {})
        if "gain" in meta:
            entry["gain"] = meta["gain"]
        manifest["sfx"][sid] = entry

    text = json.dumps(manifest, indent=2) + "\n"
    print(f"music: {len(manifest['music'])} id(s); sfx: {len(manifest['sfx'])} id(s), {sum(len(v['files']) for v in manifest['sfx'].values())} file(s)")
    for k, v in manifest["music"].items():
        print(f"  music/{k:28s} {','.join(v['formats']):12s} {v.get('duration', '?')} s" + (f"  loop {v['loop']}" if "loop" in v else ""))
    for k, v in manifest["sfx"].items():
        print(f"  sfx/{k:30s} {','.join(v['formats']):12s} x{len(v['files'])}")
    if check:
        return
    (AUDIO / "manifest.json").write_text(text)
    print(f"wrote {(AUDIO / 'manifest.json').relative_to(ROOT).as_posix()}")


if __name__ == "__main__":
    main()
