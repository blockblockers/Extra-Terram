"""The eleven pieces: the menu theme, four world pairs (calm loop + additive battle stem on the same grid) and two
stings, in a trip-hop language: slow swung drums with ghost notes, dusty breaks, a deep sub, sparse Rhodes and
vibes, dub delays, vinyl grain. Each world keeps its own percussion palette."""
from __future__ import annotations

import sys
import time

import numpy as np

from engine import (
    SR,
    Song,
    bell,
    chitter,
    clap,
    click,
    conga,
    crash,
    ep,
    flute,
    hat,
    kick,
    limiter,
    metal,
    midi,
    note,
    pad,
    pluck,
    ride,
    rim,
    rms_db,
    shaker,
    snare,
    strings,
    sub_bass,
    tom,
    vibes,
    wood,
    write_wav24,
)

import os

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "out", "masters")  # git-ignored


def N(*names: str) -> list[float]:
    return [midi(note(n)) for n in names]


def n1(name: str) -> float:
    return midi(note(name))


def fill_bar(bar: int, every: int = 8) -> bool:
    return (bar + 1) % every == 0


# =============================================================================== Rootkin — Mossbank, 86 bpm, D Dorian
ROOT_CHORDS = {
    "A": [N("D3", "F3", "A3", "C4"), N("D3", "F3", "A3", "C4"), N("F3", "A3", "C4", "E4"), N("G3", "B3", "D4", "F4")],
    "B": [N("D3", "F3", "A3", "C4"), N("A2", "C3", "E3", "G3"), N("F3", "A3", "C4", "E4"), N("E3", "G3", "B3", "D4")],
}
ROOT_BASS = {"A": ["D2", "D2", "F2", "G2"], "B": ["D2", "A1", "F2", "E2"]}


def rootkin(battle: bool) -> np.ndarray:
    s = Song(bpm=86, bars=48, swing=0.58, humanize_ms=4, seed=11)
    bars = range(48)
    sect = lambda b: "B" if (16 <= b < 24 or 40 <= b < 48) else "A"  # noqa: E731
    if not battle:
        k = s.track("kick", "drums", gain=0.9)
        rm = s.track("rim", "drums", gain=0.8, pan=0.08)
        hh = s.track("hat", "drums", gain=0.55, pan=0.25)
        sh = s.track("shaker", "perc", gain=0.6, pan=-0.45, reverb_send=0.1)
        cg = s.track("conga", "perc", gain=0.8, pan=0.3, reverb_send=0.25)
        wd = s.track("wood", "perc", gain=0.5, pan=-0.2, reverb_send=0.3, delay_send=0.25)
        bs = s.track("bass", "bass", gain=1.0)
        ky = s.track("ep", "keys", gain=0.9, delay_send=0.4, reverb_send=0.25, width=1)
        pd = s.track("pad", "pad", gain=0.5, reverb_send=0.35)
        fl = s.track("flute", "lead", gain=0.7, pan=-0.15, delay_send=0.45, reverb_send=0.4)
        for b in bars:
            quiet = 32 <= b < 36  # the break: drums out, the grove breathes
            if quiet:
                continue
            kp = ["X......X..x.....", "X.....o.X....o.."][b % 2] if b < 36 else ["X..o...X..x....o", "X.....o.X.o..o.."][b % 2]
            s.drums(k, kick, [kp], range(b, b + 1), decay=0.3, f0=52)
            rp = "....X.......X..." if not fill_bar(b) else "....X.....o.X.xX"
            s.drums(rm, rim, [rp], range(b, b + 1))
            if b >= 8:
                s.drums(hh, hat, ["x.o.x.o.x.o.x.o."], range(b, b + 1), decay=0.04)
            s.drums(sh, shaker, ["o.x.o.x.o.x.o.x." if b < 24 else "oxoxoxoxoxoxoxox"], range(b, b + 1), vel_scale=0.7)
            if b >= 8:
                s.drums(cg, conga, ["..x.....x..x....", "..x....x.x....o."][b % 2], range(b, b + 1), f=205)
                s.drums(cg, conga, ["......o.......o."], range(b, b + 1), f=150, vel_scale=0.8)
            if b >= 16:
                s.drums(wd, wood, ["..........x....." if b % 4 != 3 else "..........x...x."], range(b, b + 1))
        # bass: root on 1, the and-of-2 pickup, a fifth or seventh on the a-of-3
        ev = []
        for b in bars:
            r = n1(ROOT_BASS[sect(b)][b % 4])
            if 32 <= b < 36:
                ev += [(b, 0, 12, r, 0.6)]
                continue
            ev += [(b, 0, 2.5, r, 0.95), (b, 6, 1.5, r, 0.7), (b, 11, 1.5, r * 2 ** (10 / 12) if b % 2 else r * 2 ** (7 / 12), 0.75), (b, 14, 2, r, 0.6)]
        s.notes(bs, sub_bass, ev, drive=1.4)
        # Rhodes: off the beat, the and-of-1 and the a-of-3
        for b in bars:
            ch = ROOT_CHORDS[sect(b)][b % 4]
            v = 0.55 if b < 8 else 0.7
            s.notes(ky, ep, [(b, 2, 3, ch, v), (b, 11, 2.5, ch, v * 0.75)], strum_ms=14)
            if b % 8 == 7:
                s.notes(ky, ep, [(b, 14, 2, ch, v * 0.6)], strum_ms=10)
        # pad: long, low
        for b in range(0, 48, 4):
            root = n1(ROOT_BASS[sect(b)][0])
            s.chord(pd, pad, b, 0, 64, [root * 2, root * 3, root * 4 * 2 ** (3 / 12)], 0.45 if 32 <= b < 40 else 0.3, cutoff=900, att_ms=600)
        # flute motif in the B sections and over the break
        motif = [(0, 0, 6, "A4"), (0, 8, 4, "G4"), (1, 0, 10, "F4"), (2, 2, 6, "D4"), (2, 10, 4, "E4"), (3, 0, 12, "F4"), (4, 0, 6, "A4"), (4, 8, 4, "C5"), (5, 0, 12, "A4"), (6, 2, 6, "G4"), (6, 10, 6, "E4"), (7, 0, 12, "D4")]
        for start in (16, 32, 40):
            if start == 32:
                sel = motif[:6]
            else:
                sel = motif
            s.notes(fl, flute, [(start + b, st, d, n1(nm), 0.6) for b, st, d, nm in sel])
        return s.render(bus_gain={"drums": 1.0, "perc": 0.75, "bass": 0.85, "keys": 0.7, "pad": 0.55, "lead": 0.55, "fx": 0.7}, drums_lp=9500, crackle=0.09)
    # ---- battle: the full kit over the same grid, tribal congas, a low string swell
    k = s.track("kick", "drums", gain=0.95)
    sn = s.track("snare", "drums", gain=0.9, pan=0.05)
    hh = s.track("hat", "drums", gain=0.6, pan=0.3)
    oh = s.track("ohat", "drums", gain=0.5, pan=0.3)
    tm = s.track("tom", "drums", gain=0.8, pan=-0.3)
    cg = s.track("conga", "perc", gain=0.85, pan=-0.35, reverb_send=0.2)
    wd = s.track("wood", "perc", gain=0.5, pan=0.4, delay_send=0.3)
    bs = s.track("bass", "bass", gain=0.7)
    st = s.track("strings", "pad", gain=0.6, reverb_send=0.4)
    for b in bars:
        s.drums(k, kick, [["X..x..X...X..x..", "X..x..X..o.X..x.", "X.....X.x.X....x", "X..x..X...X.o.x."][b % 4]], range(b, b + 1), decay=0.3, f0=50)
        sp = "....X..o..o.X..o" if not fill_bar(b, 4) else "....X..o.o.oX.xX"
        if fill_bar(b, 8):
            sp = "....X.o.x.o.XxXX"
        s.drums(sn, snare, [sp], range(b, b + 1), decay=0.16, tone=192)
        s.drums(hh, hat, ["xoxoxoXoxoxoxoXo"], range(b, b + 1), decay=0.035, vel_scale=0.9)
        s.drums(oh, hat, ["..............x." if b % 2 else "......x........."], range(b, b + 1), open_=True, decay=0.22, vel_scale=0.8)
        if fill_bar(b, 8):
            s.drums(tm, tom, ["..........x.x.x."], range(b, b + 1), f=120)
            s.drums(tm, tom, ["............x..x"], range(b, b + 1), f=90)
        s.drums(cg, conga, [["x.x..x.xx.x..x.x", "x.x..x.x.x.xx..x"][b % 2]], range(b, b + 1), f=230, vel_scale=0.85)
        s.drums(cg, conga, ["......x.......x."], range(b, b + 1), f=140)
        s.drums(wd, wood, ["...x......x...x."], range(b, b + 1), vel_scale=0.8)
    ev = []
    for b in bars:
        r = n1(ROOT_BASS[sect(b)][b % 4]) * 2
        ev += [(b, 0, 1.5, r, 0.8), (b, 3, 1, r, 0.6), (b, 6, 1.5, r, 0.7), (b, 11, 1.5, r * 2 ** (7 / 12), 0.7), (b, 14, 1, r, 0.5)]
    s.notes(bs, sub_bass, ev, drive=2.2, harm=0.5)
    for b in range(0, 48, 8):
        ch = [n1(ROOT_BASS[sect(b)][0]) * 2, n1(ROOT_BASS[sect(b)][0]) * 2 * 2 ** (7 / 12), n1(ROOT_BASS[sect(b)][0]) * 4 * 2 ** (3 / 12)]
        s.chord(st, strings, b, 0, 128, ch, 0.5 if b in (16, 40) else 0.3, att_ms=1200)
    return s.render(bus_gain={"drums": 1.0, "perc": 0.7, "bass": 0.6, "pad": 0.5, "fx": 0.6}, drums_lp=10500, drums_drive=1.8, crackle=0.0)


# =============================================================================== Assembly — Slag Trench, 92 bpm, A Phrygian, half-time
ASM_CHORDS = {"A": [N("A2", "C3", "E3", "G3"), N("Bb2", "D3", "F3", "A3"), N("A2", "C3", "E3", "G3"), N("F2", "A2", "C3", "E3")], "B": [N("A2", "C3", "E3", "G3"), N("G2", "Bb2", "D3", "F3"), N("F2", "A2", "C3", "E3"), N("E2", "G#2", "B2", "D3")]}
ASM_BASS = {"A": ["A1", "Bb1", "A1", "F1"], "B": ["A1", "G1", "F1", "E1"]}


def assembly(battle: bool) -> np.ndarray:
    s = Song(bpm=92, bars=48, swing=0.61, humanize_ms=3, seed=22)
    bars = range(48)
    sect = lambda b: "B" if (16 <= b < 24 or 40 <= b < 48) else "A"  # noqa: E731
    if not battle:
        k = s.track("kick", "drums", gain=1.0)
        sn = s.track("snare", "drums", gain=0.8)
        hh = s.track("hat", "drums", gain=0.5, pan=0.2)
        pipe = s.track("pipe", "perc", gain=0.55, pan=-0.35, delay_send=0.35, reverb_send=0.3)
        bs = s.track("bass", "bass", gain=1.0)
        ky = s.track("ep", "keys", gain=0.8, delay_send=0.35, reverb_send=0.2, width=1)
        pd = s.track("pad", "pad", gain=0.55, reverb_send=0.3)
        for b in bars:
            if 32 <= b < 36:
                # the break: only the machine idles — pipes and the pad
                s.drums(pipe, metal, ["x.......x......."], range(b, b + 1), f=520, decay=0.5, vel_scale=0.7)
                continue
            s.drums(k, kick, [["X.........x.....", "X.......o.x...o.", "X.........x..X..", "X......o..x....."][b % 4]], range(b, b + 1), decay=0.42, f0=47, sweep=90)
            sp = "........X......." if not fill_bar(b, 8) else "........X.....oX"
            s.drums(sn, snare, [sp], range(b, b + 1), decay=0.24, tone=165, body=0.7)
            if b >= 8:
                s.drums(hh, hat, ["x.x.x.x.x.x.x.x." if b < 24 else "x.xox.x.x.xox.x."], range(b, b + 1), decay=0.03, vel_scale=0.8)
            s.drums(pipe, metal, [["......x.......x.", "......x....x....", "......x.......x.", "...x..x.......x."][b % 4]], range(b, b + 1), f=520, decay=0.3, vel_scale=0.7)
        ev = []
        for b in bars:
            r = n1(ASM_BASS[sect(b)][b % 4])
            if 32 <= b < 36:
                ev += [(b, 0, 14, r, 0.5)]
                continue
            ev += [(b, 0, 3, r, 0.95), (b, 5, 1, r * 2, 0.55), (b, 6, 2, r, 0.75), (b, 10, 1.5, r, 0.7), (b, 13, 1, r * 2 ** (3 / 12), 0.6), (b, 14, 2, r, 0.7)]
        s.notes(bs, sub_bass, ev, drive=2.0, harm=0.45)
        for b in bars:
            ch = ASM_CHORDS[sect(b)][b % 4]
            if b < 8 or 32 <= b < 36:
                s.notes(ky, ep, [(b, 8, 4, ch, 0.5)], strum_ms=8, bright=0.8)
            else:
                s.notes(ky, ep, [(b, 3, 2, ch, 0.65), (b, 8, 2, ch, 0.55), (b, 13, 1.5, ch, 0.5)], strum_ms=8, bright=0.8)
        for b in range(0, 48, 4):
            r = n1(ASM_BASS[sect(b)][0])
            s.chord(pd, pad, b, 0, 64, [r * 2, r * 3, r * 4 * 2 ** (1 / 12)], 0.4 if 32 <= b < 40 else 0.28, cutoff=650, att_ms=800, detune=9)
        return s.render(bus_gain={"drums": 1.0, "perc": 0.7, "bass": 0.9, "keys": 0.65, "pad": 0.55, "fx": 0.6}, drums_lp=8500, drums_drive=2.2, crackle=0.14, delay_steps=6)
    k = s.track("kick", "drums", gain=0.95)
    sn = s.track("snare", "drums", gain=0.85)
    cl = s.track("clap", "drums", gain=0.6, width=1)
    hh = s.track("hat", "drums", gain=0.55, pan=0.3)
    anvil = s.track("anvil", "perc", gain=0.6, pan=0.15, reverb_send=0.3)
    pipe = s.track("pipe", "perc", gain=0.5, pan=-0.4, delay_send=0.3)
    tm = s.track("tom", "drums", gain=0.8, pan=-0.2)
    bs = s.track("bass", "bass", gain=0.7)
    st = s.track("strings", "pad", gain=0.5, reverb_send=0.4)
    for b in bars:
        s.drums(k, kick, [["X..x......x..x..", "X..x....o.x..x.o", "X..x..o...x.x...", "X.x...x...x..x.."][b % 4]], range(b, b + 1), decay=0.36, f0=48)
        sp = "....o...X.....o." if not fill_bar(b, 8) else "....o...X.o.XxXX"
        s.drums(sn, snare, [sp], range(b, b + 1), decay=0.22, tone=170, body=0.7)
        s.drums(cl, clap, ["........X......."], range(b, b + 1))
        s.drums(hh, hat, ["xoxoxoxoxoxoxoxo"], range(b, b + 1), decay=0.03, vel_scale=0.9)
        s.drums(anvil, metal, ["........x......." if b % 2 == 0 else "........x....x.."], range(b, b + 1), f=2300, decay=0.7, vel_scale=0.8)
        s.drums(pipe, metal, ["..x...x...x...x." if b % 4 != 3 else "..x...x.x.x.x.x."], range(b, b + 1), f=700, decay=0.2, vel_scale=0.6)
        if fill_bar(b, 8):
            s.drums(tm, tom, ["..........xx..x."], range(b, b + 1), f=100)
            s.drums(tm, tom, ["............x..x"], range(b, b + 1), f=75)
    ev = []
    for b in bars:
        r = n1(ASM_BASS[sect(b)][b % 4]) * 2
        ev += [(b, 0, 1.5, r, 0.8), (b, 3, 1, r, 0.6), (b, 6, 1, r, 0.6), (b, 8, 1.5, r, 0.7), (b, 11, 1, r * 2 ** (1 / 12), 0.6), (b, 14, 2, r, 0.6)]
    s.notes(bs, sub_bass, ev, drive=3.0, harm=0.7)
    for b in range(0, 48, 8):
        r = n1(ASM_BASS[sect(b)][0])
        s.chord(st, strings, b, 0, 128, [r * 4, r * 4 * 2 ** (1 / 12), r * 6], 0.45 if b in (16, 40) else 0.25, att_ms=1500)
    return s.render(bus_gain={"drums": 1.0, "perc": 0.75, "bass": 0.6, "pad": 0.45, "fx": 0.55}, drums_lp=11000, drums_drive=2.4, crackle=0.0)


# =============================================================================== Chitin — Brood Gallery, 92 bpm, 7/8, F# minor
CHI_CHORDS = {"A": [N("F#2", "A2", "C#3", "E3"), N("F#2", "A2", "C#3", "E3"), N("D3", "F#3", "A3", "C#4"), N("E2", "G#2", "B2", "D3")], "B": [N("F#2", "A2", "C#3", "G#3"), N("A2", "C#3", "E3", "G#3"), N("D3", "F#3", "A3", "C#4"), N("C#3", "E3", "G#3", "B3")]}
CHI_BASS = {"A": ["F#1", "F#1", "D1", "E1"], "B": ["F#1", "A1", "D1", "C#1"]}


def chitin(battle: bool) -> np.ndarray:
    # 7/8 written as seven eighth-note beats of two sixteenth steps: 14 steps a bar, grouped 2 + 2 + 3
    s = Song(bpm=184, bars=56, beats_per_bar=7, steps_per_beat=2, swing=0.56, humanize_ms=4, seed=33)  # bpm = the eighth: a quarter at 92
    bars = range(56)
    sect = lambda b: "B" if (16 <= b < 24 or 40 <= b < 56) else "A"  # noqa: E731
    if not battle:
        k = s.track("kick", "drums", gain=1.0)
        sn = s.track("snare", "drums", gain=0.75)
        ck = s.track("click", "perc", gain=0.7, pan=0.3, delay_send=0.2)
        ch = s.track("chitter", "perc", gain=0.6, pan=-0.4, reverb_send=0.2)
        bs = s.track("bass", "bass", gain=1.0)
        ky = s.track("ep", "keys", gain=0.75, delay_send=0.45, reverb_send=0.3, width=1)
        pd = s.track("drone", "pad", gain=0.6, reverb_send=0.3)
        wd = s.track("wood", "perc", gain=0.45, pan=0.1, reverb_send=0.35)
        for b in bars:
            if 32 <= b < 36:
                s.drums(ch, chitter, ["x......x......"], range(b, b + 1), vel_scale=0.6)
                continue
            s.drums(k, kick, [["X.......X.....", "X...o...X...o.", "X.......X..x..", "X.....o.X....."][b % 4]], range(b, b + 1), decay=0.34, f0=46, sweep=80)
            sp = "....X.....X..." if not fill_bar(b, 8) else "....X.....X.xX"
            s.drums(sn, snare, [sp], range(b, b + 1), decay=0.15, tone=200, snap=0.8, body=0.4)
            s.drums(ck, click, ["x.o.x.o.x.o.o." if b < 24 else "xoo.x.o.xoo.o."], range(b, b + 1), vel_scale=0.9)
            if b >= 8:
                s.drums(ch, chitter, [["......x......." , "......x.....x.", "..x...x.......", "......x......."][b % 4]], range(b, b + 1), vel_scale=0.8)
            if b >= 16:
                s.drums(wd, wood, ["..........x..."], range(b, b + 1), f=560, vel_scale=0.7)
        ev = []
        for b in bars:
            r = n1(CHI_BASS[sect(b)][b % 4])
            if 32 <= b < 36:
                ev += [(b, 0, 12, r, 0.55)]
                continue
            ev += [(b, 0, 2, r, 0.95), (b, 4, 1.5, r, 0.7), (b, 8, 2, r, 0.85), (b, 11, 1, r * 2 ** (3 / 12) if b % 2 else r, 0.6), (b, 12, 1.5, r, 0.6)]
        s.notes(bs, sub_bass, ev, drive=1.8, harm=0.35)
        for b in bars:
            chd = CHI_CHORDS[sect(b)][b % 4]
            if b < 8:
                s.notes(ky, ep, [(b, 8, 4, chd, 0.5)], strum_ms=18, bright=0.7)
            else:
                s.notes(ky, ep, [(b, 2, 2, chd, 0.55), (b, 8, 3, chd, 0.6)], strum_ms=18, bright=0.7)
        # the hive breathing: a drone that swells on a long cycle
        for b in range(0, 56, 4):
            r = n1(CHI_BASS[sect(b)][0])
            s.chord(pd, pad, b, 0, 56, [r * 2, r * 3, r * 4 * 2 ** (3 / 12)], 0.42 if 32 <= b < 40 else 0.3, cutoff=480, att_ms=1200, rel_ms=1200, detune=11)
        return s.render(bus_gain={"drums": 1.0, "perc": 0.7, "bass": 0.95, "keys": 0.6, "pad": 0.6, "fx": 0.6}, drums_lp=8000, drums_drive=1.6, crackle=0.06, delay_steps=3, reverb_rt=2.2, reverb_lp=2500)
    k = s.track("kick", "drums", gain=0.95)
    sn = s.track("snare", "drums", gain=0.85)
    ck = s.track("click", "perc", gain=0.7, pan=0.35)
    ch = s.track("chitter", "perc", gain=0.7, pan=-0.3, delay_send=0.2)
    tm = s.track("tom", "drums", gain=0.7, pan=-0.25)
    bs = s.track("bass", "bass", gain=0.7)
    st = s.track("strings", "pad", gain=0.55, reverb_send=0.45)
    for b in bars:
        s.drums(k, kick, [["X..x....X.x...", "X..x..o.X.x..o", "X.x.....X.x.x.", "X..x....X...x."][b % 4]], range(b, b + 1), decay=0.3, f0=46)
        sp = "....X.o...X.o." if not fill_bar(b, 8) else "....X.o.o.XxXX"
        s.drums(sn, snare, [sp], range(b, b + 1), decay=0.15, tone=205, snap=1.0)
        s.drums(ck, click, ["xoxoxoxoxoxoxo"], range(b, b + 1), vel_scale=0.9)
        s.drums(ch, chitter, [["x...x...x.x...", "x...x.x.x...x."][b % 2]], range(b, b + 1), vel_scale=0.9, count=5)
        if fill_bar(b, 8):
            s.drums(tm, tom, ["........x.x.x."], range(b, b + 1), f=115)
    ev = []
    for b in bars:
        r = n1(CHI_BASS[sect(b)][b % 4]) * 2
        ev += [(b, 0, 1.5, r, 0.8), (b, 2, 1, r, 0.5), (b, 4, 1, r, 0.6), (b, 8, 1.5, r, 0.7), (b, 10, 1, r * 2 ** (3 / 12), 0.55), (b, 12, 1, r, 0.5)]
    s.notes(bs, sub_bass, ev, drive=2.6, harm=0.6)
    for b in range(0, 56, 8):
        r = n1(CHI_BASS[sect(b)][0])
        s.chord(st, strings, b, 0, 112, [r * 4, r * 4 * 2 ** (6 / 12), r * 8 * 2 ** (1 / 12)], 0.45 if b >= 40 else 0.28, att_ms=1800)
    return s.render(bus_gain={"drums": 1.0, "perc": 0.75, "bass": 0.6, "pad": 0.5, "fx": 0.55}, drums_lp=10000, drums_drive=1.9, crackle=0.0, reverb_rt=2.0, reverb_lp=3000)


# =============================================================================== Lumenari — Prism Span, 88 bpm, E Lydian
LUM_CHORDS = {"A": [N("E3", "G#3", "B3", "D#4"), N("F#3", "A#3", "C#4", "E4"), N("E3", "G#3", "B3", "D#4"), N("C#3", "E3", "G#3", "B3")], "B": [N("A#2", "C#3", "E3", "G#3"), N("B2", "D#3", "F#3", "A#3"), N("G#2", "B2", "D#3", "F#3"), N("F#2", "A#2", "C#3", "E3")]}
LUM_BASS = {"A": ["E1", "F#1", "E1", "C#1"], "B": ["A#1", "B1", "G#1", "F#1"]}
LUM_ARP = {"A": [["E4", "G#4", "B4", "D#5"], ["F#4", "A#4", "C#5", "E5"], ["E4", "B4", "D#5", "G#5"], ["C#4", "E4", "G#4", "B4"]], "B": [["A#3", "C#4", "E4", "G#4"], ["B3", "D#4", "F#4", "A#4"], ["G#3", "B3", "D#4", "F#4"], ["F#3", "A#3", "C#4", "E4"]]}


def lumenari(battle: bool) -> np.ndarray:
    s = Song(bpm=88, bars=48, swing=0.56, humanize_ms=4, seed=44)
    bars = range(48)
    sect = lambda b: "B" if (16 <= b < 24 or 40 <= b < 48) else "A"  # noqa: E731
    if not battle:
        k = s.track("kick", "drums", gain=0.85)
        sn = s.track("snare", "drums", gain=0.75, pan=0.05)
        hh = s.track("hat", "drums", gain=0.5, pan=0.3)
        sh = s.track("shaker", "perc", gain=0.5, pan=-0.4)
        bl = s.track("bells", "keys", gain=0.8, delay_send=0.5, reverb_send=0.45, width=1)
        bs = s.track("bass", "bass", gain=1.0)
        ky = s.track("ep", "keys", gain=0.7, delay_send=0.3, reverb_send=0.3, width=1)
        pd = s.track("pad", "pad", gain=0.5, reverb_send=0.4)
        vb = s.track("vibes", "lead", gain=0.7, pan=0.1, delay_send=0.4, reverb_send=0.4)
        for b in bars:
            if 32 <= b < 36:
                continue
            s.drums(k, kick, [["X.......X.x.....", "X.....o.X...o...", "X.......X.x....o", "X.....o...x....."][b % 4]], range(b, b + 1), decay=0.28, f0=54, sweep=120, click=0.7)
            sp = "....X.......X..." if not fill_bar(b, 8) else "....X.....o.X.oX"
            s.drums(sn, snare, [sp], range(b, b + 1), decay=0.13, tone=215, snap=1.1, body=0.45)
            if b >= 8:
                s.drums(hh, hat, ["x.o.x.o.x.o.x.o." if b < 24 else "x.oox.o.x.oox.o."], range(b, b + 1), decay=0.03, bright=1.1)
            s.drums(sh, shaker, ["oxoxoxoxoxoxoxox"], range(b, b + 1), vel_scale=0.6)
        # bells: a dotted-eighth cross-rhythm (every three sixteenths) over the bar
        for b in bars:
            arp = [n1(x) for x in LUM_ARP[sect(b)][b % 4]]
            if b < 8 or 32 <= b < 36:
                steps = [0, 6, 12]
            else:
                steps = [0, 3, 6, 9, 12, 15]
            for i, st_ in enumerate(steps):
                s.notes(bl, bell, [(b, st_, 2, arp[i % len(arp)], 0.45 + 0.1 * (i % 2 == 0))])
        ev = []
        for b in bars:
            r = n1(LUM_BASS[sect(b)][b % 4])
            if 32 <= b < 36:
                ev += [(b, 0, 14, r, 0.55)]
                continue
            ev += [(b, 0, 3, r, 0.9), (b, 6, 1.5, r, 0.65), (b, 10, 2, r, 0.75), (b, 13, 1, r * 2 ** (7 / 12), 0.55), (b, 14, 2, r, 0.6)]
        s.notes(bs, sub_bass, ev, drive=1.3, harm=0.15)
        for b in bars:
            chd = LUM_CHORDS[sect(b)][b % 4]
            s.notes(ky, ep, [(b, 2, 3, chd, 0.5), (b, 10, 3, chd, 0.42)], strum_ms=20, bright=1.1)
        for b in range(0, 48, 4):
            r = n1(LUM_BASS[sect(b)][0])
            s.chord(pd, pad, b, 0, 64, [r * 4, r * 6, r * 8 * 2 ** (6 / 12)], 0.4 if 32 <= b < 40 else 0.28, cutoff=2200, att_ms=700, detune=4)
        motif = [(0, 2, 5, "B4"), (0, 8, 4, "G#4"), (1, 2, 8, "A#4"), (2, 2, 5, "B4"), (2, 8, 4, "D#5"), (3, 2, 10, "C#5"), (4, 2, 5, "B4"), (4, 8, 4, "G#4"), (5, 2, 8, "F#4"), (6, 2, 5, "G#4"), (6, 8, 4, "A#4"), (7, 2, 10, "B4")]
        for start in (16, 40):
            s.notes(vb, vibes, [(start + b, st_, d, n1(nm), 0.6) for b, st_, d, nm in motif])
        s.notes(vb, vibes, [(32 + b, st_, d, n1(nm), 0.5) for b, st_, d, nm in motif[:6]])
        return s.render(bus_gain={"drums": 1.0, "perc": 0.6, "bass": 0.85, "keys": 0.7, "pad": 0.5, "lead": 0.6, "fx": 0.75}, drums_lp=12000, drums_drive=1.3, crackle=0.05, delay_steps=3, reverb_rt=2.4, reverb_lp=6000)
    k = s.track("kick", "drums", gain=0.9)
    sn = s.track("snare", "drums", gain=0.85, pan=0.05)
    hh = s.track("hat", "drums", gain=0.55, pan=0.3)
    rd = s.track("ride", "drums", gain=0.5, pan=-0.35)
    bl = s.track("bells", "keys", gain=0.75, delay_send=0.4, reverb_send=0.35, width=1)
    bs = s.track("bass", "bass", gain=0.65)
    st = s.track("strings", "pad", gain=0.55, reverb_send=0.45)
    for b in bars:
        s.drums(k, kick, [["X..x..X...X..x..", "X..x..X.o.X..x..", "X.....X.x.X....x", "X..x..X...X.o.x."][b % 4]], range(b, b + 1), decay=0.28, f0=52, click=0.7)
        sp = "....X..o..o.X..o" if not fill_bar(b, 8) else "....X.o.x.o.XxXX"
        s.drums(sn, snare, [sp], range(b, b + 1), decay=0.13, tone=215, snap=1.1)
        s.drums(hh, hat, ["xoxoxoXoxoxoxoXo"], range(b, b + 1), decay=0.03, bright=1.1, vel_scale=0.9)
        s.drums(rd, ride, ["x...x...x...x..." if b % 2 == 0 else "x...x...x.x.x..."], range(b, b + 1), vel_scale=0.7)
    for b in bars:
        arp = [n1(x) * 2 for x in LUM_ARP[sect(b)][b % 4]]
        for i, st_ in enumerate(range(0, 16, 2)):
            s.notes(bl, bell, [(b, st_ + (1 if i % 2 else 0), 1.5, arp[(i * 3) % len(arp)], 0.4)])
    ev = []
    for b in bars:
        r = n1(LUM_BASS[sect(b)][b % 4]) * 2
        ev += [(b, 0, 1.5, r, 0.8), (b, 3, 1, r, 0.55), (b, 6, 1.5, r, 0.7), (b, 10, 1, r, 0.6), (b, 13, 1, r * 2 ** (7 / 12), 0.55), (b, 14, 1, r, 0.5)]
    s.notes(bs, sub_bass, ev, drive=1.8, harm=0.4)
    for b in range(0, 48, 8):
        r = n1(LUM_BASS[sect(b)][0])
        s.chord(st, strings, b, 0, 128, [r * 8, r * 8 * 2 ** (4 / 12), r * 8 * 2 ** (11 / 12), r * 16 * 2 ** (6 / 12)], 0.5 if b in (16, 40) else 0.3, att_ms=1400)
    return s.render(bus_gain={"drums": 1.0, "perc": 0.6, "bass": 0.55, "keys": 0.6, "pad": 0.5, "fx": 0.6}, drums_lp=13000, drums_drive=1.5, crackle=0.0, reverb_rt=2.2, reverb_lp=6000)


# =============================================================================== Menu — the theme, 82 bpm, D Mixolydian
MENU_CHORDS = {"A": [N("D3", "F#3", "A3", "C#4"), N("C3", "E3", "G3", "B3"), N("G2", "B2", "D3", "F#3"), N("A2", "C#3", "E3", "G3")], "B": [N("B2", "D3", "F#3", "A3"), N("G2", "B2", "D3", "F#3"), N("E3", "G3", "B3", "D4"), N("A2", "C#3", "E3", "G3")]}
MENU_BASS = {"A": ["D2", "C2", "G1", "A1"], "B": ["B1", "G1", "E2", "A1"]}
THEME = [(0, 2, 4, "D4"), (0, 8, 2, "F#4"), (0, 11, 5, "A4"), (1, 2, 6, "B4"), (1, 10, 6, "A4"), (2, 2, 4, "G4"), (2, 8, 2, "F#4"), (2, 11, 5, "E4"), (3, 2, 12, "D4"), (4, 2, 4, "D4"), (4, 8, 2, "F#4"), (4, 11, 5, "A4"), (5, 2, 6, "C5"), (5, 10, 6, "B4"), (6, 2, 4, "A4"), (6, 8, 2, "G4"), (6, 11, 5, "F#4"), (7, 2, 12, "E4")]


def menu() -> np.ndarray:
    s = Song(bpm=82, bars=48, swing=0.57, humanize_ms=4, seed=55)
    bars = range(48)
    sect = lambda b: "B" if (16 <= b < 24 or 40 <= b < 48) else "A"  # noqa: E731
    k = s.track("kick", "drums", gain=0.9)
    sn = s.track("snare", "drums", gain=0.8, pan=0.04)
    hh = s.track("hat", "drums", gain=0.5, pan=0.28)
    oh = s.track("ohat", "drums", gain=0.4, pan=0.28)
    sh = s.track("shaker", "perc", gain=0.5, pan=-0.4)
    cg = s.track("conga", "perc", gain=0.6, pan=0.35, reverb_send=0.25)
    tb = s.track("tamb", "perc", gain=0.4, pan=-0.2, reverb_send=0.3)
    bs = s.track("bass", "bass", gain=1.0)
    ky = s.track("ep", "keys", gain=0.85, delay_send=0.35, reverb_send=0.3, width=1)
    gt = s.track("guitar", "keys", gain=0.55, pan=-0.3, delay_send=0.3, reverb_send=0.2)
    pd = s.track("pad", "pad", gain=0.5, reverb_send=0.4)
    st = s.track("strings", "pad", gain=0.5, reverb_send=0.45)
    vb = s.track("vibes", "lead", gain=0.85, pan=0.12, delay_send=0.45, reverb_send=0.45)
    for b in bars:
        if 32 <= b < 36:
            continue
        s.drums(k, kick, [["X..x....X.x.....", "X..x....X...o...", "X.......X.x..X..", "X..x..o.X.x....."][b % 4]], range(b, b + 1), decay=0.33, f0=52)
        sp = "....X.....o.X..." if not fill_bar(b, 8) else "....X...o.o.X.xX"
        s.drums(sn, snare, [sp], range(b, b + 1), decay=0.17, tone=185, snap=0.9)
        if b >= 8:
            s.drums(hh, hat, ["x.o.x.o.x.o.x.o." if b < 24 else "xoo.x.o.xoo.x.o."], range(b, b + 1), decay=0.035)
            s.drums(oh, hat, ["..............x."], range(b, b + 1), open_=True, decay=0.2, vel_scale=0.7)
        s.drums(sh, shaker, ["oxoxoxoxoxoxoxox"], range(b, b + 1), vel_scale=0.55)
        if b >= 16:
            s.drums(cg, conga, [["..x.....x..x....", "..x....x.x......"][b % 2]], range(b, b + 1), f=200, vel_scale=0.8)
        if sect(b) == "B":
            s.drums(tb, shaker, ["....x.......x..."], range(b, b + 1), decay=0.12, vel_scale=0.9)
    ev = []
    for b in bars:
        r = n1(MENU_BASS[sect(b)][b % 4])
        if 32 <= b < 36:
            ev += [(b, 0, 14, r, 0.5)]
            continue
        ev += [(b, 0, 2.5, r, 0.9), (b, 6, 1.5, r, 0.65), (b, 10, 2, r * 2 ** (7 / 12) if b % 2 else r, 0.7), (b, 14, 2, r, 0.6)]
    s.notes(bs, sub_bass, ev, drive=1.4)
    for b in bars:
        chd = MENU_CHORDS[sect(b)][b % 4]
        v = 0.55 if b < 8 else 0.68
        s.notes(ky, ep, [(b, 2, 3, chd, v), (b, 11, 2.5, chd, v * 0.8)], strum_ms=14)
        if 8 <= b < 32 or b >= 36:
            # a muted funk chuck on the e-of-2 and the a-of-3
            top = chd[-2:]
            s.notes(gt, pluck, [(b, 5, 0.5, top, 0.55), (b, 11, 0.5, top, 0.5), (b, 13, 0.5, [chd[1]], 0.4)], damp=0.96, bright=0.8)
    for b in range(0, 48, 4):
        r = n1(MENU_BASS[sect(b)][0])
        s.chord(pd, pad, b, 0, 64, [r * 2, r * 3, r * 4 * 2 ** (4 / 12)], 0.4 if 32 <= b < 40 else 0.26, cutoff=1300, att_ms=700)
    for b in (16, 40):
        r = n1(MENU_BASS["B"][0])
        s.chord(st, strings, b, 0, 128, [n1("D4"), n1("F#4"), n1("A4"), n1("D5")], 0.4, att_ms=1500)
        _ = r
    # the theme: twice through the A sections, the B answer, and alone over the break
    for start in (8, 24, 40):
        s.notes(vb, vibes, [(start + b, st_, d, n1(nm), 0.7) for b, st_, d, nm in THEME])
    s.notes(vb, vibes, [(32 + b, st_, d, n1(nm), 0.55) for b, st_, d, nm in THEME[:9]])
    return s.render(bus_gain={"drums": 1.0, "perc": 0.65, "bass": 0.85, "keys": 0.7, "pad": 0.5, "lead": 0.7, "fx": 0.7}, drums_lp=10000, drums_drive=1.5, crackle=0.08, delay_steps=3, reverb_rt=2.0)


# =============================================================================== stings
def result_win() -> np.ndarray:
    s = Song(bpm=82, bars=2, swing=0.57, humanize_ms=3, seed=66, loop=False, tail_seconds=1.2)
    k = s.track("kick", "drums"); sn = s.track("snare", "drums"); cr = s.track("crash", "drums", gain=0.7, width=1)
    bs = s.track("bass", "bass"); ky = s.track("ep", "keys", gain=0.9, delay_send=0.35, reverb_send=0.4, width=1)
    vb = s.track("vibes", "lead", gain=0.9, delay_send=0.4, reverb_send=0.5); st = s.track("strings", "pad", gain=0.6, reverb_send=0.5)
    s.drums(sn, snare, ["....X.o.x.o.XxXX", "X..............."], range(0, 2), decay=0.17)
    s.drums(k, kick, ["X.......X.x.....", "X..............."], range(0, 2), decay=0.33)
    s.drums(cr, crash, ["................", "X..............."], range(0, 2))
    s.notes(bs, sub_bass, [(0, 0, 3, n1("A1"), 0.9), (0, 8, 2, n1("A1"), 0.7), (0, 12, 2, n1("C2"), 0.7), (1, 0, 20, n1("D2"), 1.0)], drive=1.4)
    s.notes(ky, ep, [(0, 0, 4, N("A2", "C#3", "E3", "G3"), 0.6), (0, 8, 4, N("C3", "E3", "G3", "B3"), 0.6), (1, 0, 24, N("D3", "F#3", "A3", "C#4", "E4"), 0.85)], strum_ms=16)
    s.notes(vb, vibes, [(0, 10, 2, n1("A4"), 0.7), (0, 12, 2, n1("B4"), 0.7), (0, 14, 2, n1("C#5"), 0.75), (1, 0, 8, n1("D5"), 0.9), (1, 8, 6, n1("F#5"), 0.75), (1, 14, 16, n1("A5"), 0.8)])
    s.chord(st, strings, 1, 0, 40, N("D4", "F#4", "A4", "D5"), 0.6, att_ms=300)
    return s.render(bus_gain={"drums": 1.0, "bass": 0.85, "keys": 0.75, "pad": 0.55, "lead": 0.75, "fx": 0.7}, crackle=0.05)


def result_lose() -> np.ndarray:
    s = Song(bpm=76, bars=2, swing=0.57, humanize_ms=3, seed=77, loop=False, tail_seconds=1.6)
    k = s.track("kick", "drums", gain=1.0); tm = s.track("tom", "drums", gain=0.8, pan=-0.2); cr = s.track("crash", "drums", gain=0.5, width=1)
    bs = s.track("bass", "bass"); ky = s.track("ep", "keys", gain=0.8, reverb_send=0.5, width=1); pd = s.track("pad", "pad", gain=0.6, reverb_send=0.5)
    s.drums(k, kick, ["X.......X.......", "X...........X..."], range(0, 2), decay=0.7, f0=42, sweep=70)
    s.drums(tm, tom, ["......x.x.x.x...", "........x.x....."], range(0, 2), f=90, decay=0.35)
    s.drums(cr, crash, ["X...............", "............X..."], range(0, 2), decay=2.0)
    s.notes(bs, sub_bass, [(0, 0, 4, n1("D2"), 0.9), (0, 8, 4, n1("C2"), 0.85), (1, 0, 4, n1("Bb1"), 0.85), (1, 6, 3, n1("A1"), 0.8), (1, 12, 14, n1("D1"), 1.0)], drive=1.5)
    s.notes(ky, ep, [(0, 0, 8, N("D3", "F3", "A3"), 0.6), (0, 8, 8, N("C3", "E3", "G3"), 0.55), (1, 0, 6, N("Bb2", "D3", "F3"), 0.55), (1, 6, 6, N("A2", "C#3", "E3"), 0.5), (1, 12, 16, N("D3", "F3", "A3", "D4"), 0.7)], strum_ms=20, bright=0.7)
    s.chord(pd, pad, 0, 0, 30, N("D2", "A2", "F3"), 0.5, cutoff=600, att_ms=200, rel_ms=1500)
    return s.render(bus_gain={"drums": 1.0, "bass": 0.9, "keys": 0.7, "pad": 0.6, "fx": 0.7}, crackle=0.06, reverb_rt=2.6)


PIECES = {
    "menu": lambda: menu(),
    "world-rootkin": lambda: rootkin(False),
    "world-rootkin-battle": lambda: rootkin(True),
    "world-assembly": lambda: assembly(False),
    "world-assembly-battle": lambda: assembly(True),
    "world-chitin": lambda: chitin(False),
    "world-chitin-battle": lambda: chitin(True),
    "world-lumenari": lambda: lumenari(False),
    "world-lumenari-battle": lambda: lumenari(True),
    "result-win": lambda: result_win(),
    "result-lose": lambda: result_lose(),
}

if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    names = sys.argv[1:] or list(PIECES)
    for name in names:
        t0 = time.time()
        mix = PIECES[name]()
        peak = float(np.max(np.abs(mix)))
        mix = limiter(mix / max(peak, 1e-6) * 0.7, ceiling=0.8)
        write_wav24(f"{OUT}/{name}.wav", mix)
        print(f"{name:24s} {mix.shape[0] / SR:7.2f} s  peak {20 * np.log10(np.max(np.abs(mix))):5.1f}  rms {rms_db(mix):6.1f}  {time.time() - t0:5.1f} s")
