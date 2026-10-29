"""Extra-Terram trip-hop engine: drum and instrument synthesis, a swung sequencer, circular (seamless-loop)
effects and a master chain. Pure numpy/scipy, 48 kHz, float32 stereo. Every loop is rendered on a circular
buffer: notes, delay and reverb tails that pass the loop's end wrap to its start, so the seam is the music
carrying on, not a cut."""
from __future__ import annotations

import math
import struct
from dataclasses import dataclass, field

import numpy as np
from scipy import signal
from scipy.ndimage import maximum_filter1d

SR = 48000
TWO_PI = 2 * math.pi


# ----------------------------------------------------------------------------- utils
def t_axis(n: int) -> np.ndarray:
    return np.arange(n, dtype=np.float64) / SR


def exp_env(n: int, tau: float, start: float = 1.0) -> np.ndarray:
    return start * np.exp(-t_axis(n) / max(tau, 1e-4))


def attack(n: int, ms: float) -> np.ndarray:
    a = max(1, int(SR * ms / 1000))
    e = np.ones(n)
    e[:a] = np.linspace(0, 1, a) ** 0.7
    return e


def release_tail(n: int, ms: float) -> np.ndarray:
    r = max(1, min(n, int(SR * ms / 1000)))
    e = np.ones(n)
    e[-r:] = np.linspace(1, 0, r) ** 1.5
    return e


def lp(x: np.ndarray, fc: float, order: int = 2) -> np.ndarray:
    b, a = signal.butter(order, min(fc, SR * 0.49) / (SR / 2), "low")
    return signal.lfilter(b, a, x, axis=0)


def hp(x: np.ndarray, fc: float, order: int = 2) -> np.ndarray:
    b, a = signal.butter(order, max(fc, 10) / (SR / 2), "high")
    return signal.lfilter(b, a, x, axis=0)


def bp(x: np.ndarray, lo: float, hi: float, order: int = 2) -> np.ndarray:
    b, a = signal.butter(order, [max(lo, 10) / (SR / 2), min(hi, SR * 0.49) / (SR / 2)], "band")
    return signal.lfilter(b, a, x, axis=0)


def peak_eq(x: np.ndarray, fc: float, gain_db: float, q: float = 1.0) -> np.ndarray:
    """A peaking EQ band (RBJ cookbook)."""
    A = 10 ** (gain_db / 40)
    w0 = TWO_PI * fc / SR
    alpha = math.sin(w0) / (2 * q)
    b = [1 + alpha * A, -2 * math.cos(w0), 1 - alpha * A]
    a = [1 + alpha / A, -2 * math.cos(w0), 1 - alpha / A]
    return signal.lfilter(np.array(b) / a[0], np.array(a) / a[0], x, axis=0)


def saturate(x: np.ndarray, drive: float = 1.5) -> np.ndarray:
    return np.tanh(x * drive) / math.tanh(drive)


def soft_clip(x: np.ndarray, knee: float = 0.8) -> np.ndarray:
    y = x.copy()
    m = np.abs(x) > knee
    y[m] = np.sign(x[m]) * (knee + (1 - knee) * np.tanh((np.abs(x[m]) - knee) / (1 - knee)))
    return y


def midi(n: float) -> float:
    return 440.0 * 2 ** ((n - 69) / 12)


def note(name: str) -> int:
    """'D3' -> midi number; sharps with '#', flats with 'b'."""
    names = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}
    p = names[name[0]]
    i = 1
    if i < len(name) and name[i] in "#b":
        p += 1 if name[i] == "#" else -1
        i += 1
    octave = int(name[i:])
    return 12 * (octave + 1) + p


def stereo(mono: np.ndarray, pan: float = 0.0, width: float = 0.0, seed: int = 0) -> np.ndarray:
    """Constant-power pan; width adds a short decorrelating delay to one side."""
    p = (pan + 1) / 2 * math.pi / 2
    l = mono * math.cos(p)
    r = mono * math.sin(p)
    if width > 0:
        d = int(SR * 0.0004 * width) + 1
        r = np.concatenate([np.zeros(d), r[:-d]]) if len(r) > d else r
    return np.stack([l, r], axis=1).astype(np.float64)


def rng(seed: int) -> np.random.Generator:
    return np.random.default_rng(seed)


# ----------------------------------------------------------------------------- drums
def kick(vel: float = 1.0, decay: float = 0.32, f0: float = 50.0, sweep: float = 110.0, click: float = 0.5, seed: int = 0) -> np.ndarray:
    n = int(SR * (decay * 4 + 0.05))
    t = t_axis(n)
    f = f0 + sweep * np.exp(-t / 0.045)
    phase = np.cumsum(TWO_PI * f / SR)
    body = np.sin(phase) * exp_env(n, decay)
    body = saturate(body * 1.3, 1.6)
    k = int(SR * 0.004)
    cl = rng(seed).standard_normal(n) * exp_env(n, 0.0025)
    cl = hp(cl, 1500) * click * 0.6
    out = body + cl
    out *= attack(n, 0.3)
    return out * vel * 0.45


def snare(vel: float = 1.0, decay: float = 0.17, tone: float = 188.0, snap: float = 1.0, body: float = 0.55, seed: int = 1) -> np.ndarray:
    n = int(SR * (decay * 5 + 0.05))
    t = t_axis(n)
    g = rng(seed)
    noise = g.standard_normal(n)
    nz = bp(noise, 1200, 7500) * exp_env(n, decay) * snap
    nz += bp(noise, 300, 1500) * exp_env(n, decay * 0.5) * 0.4 * snap
    tonal = (np.sin(TWO_PI * tone * t) + 0.5 * np.sin(TWO_PI * tone * 1.74 * t)) * exp_env(n, decay * 0.55) * body
    out = (nz * 0.8 + tonal) * attack(n, 0.2)
    return saturate(out * 1.1, 1.4) * vel * 0.8


def rim(vel: float = 1.0, seed: int = 2) -> np.ndarray:
    n = int(SR * 0.12)
    t = t_axis(n)
    g = rng(seed)
    out = (np.sin(TWO_PI * 1100 * t) * 0.6 + np.sin(TWO_PI * 420 * t) * 0.4) * exp_env(n, 0.022)
    out += bp(g.standard_normal(n), 2000, 9000) * exp_env(n, 0.006) * 0.9
    return out * attack(n, 0.1) * vel * 0.7


def clap(vel: float = 1.0, seed: int = 3) -> np.ndarray:
    n = int(SR * 0.35)
    g = rng(seed)
    noise = bp(g.standard_normal(n), 900, 6500)
    env = np.zeros(n)
    for k, gap in enumerate([0, 0.011, 0.021, 0.033]):
        s = int(gap * SR)
        env[s:] += np.exp(-t_axis(n - s) / (0.008 if k < 3 else 0.09))
    return (noise * env) * attack(n, 0.1) * vel * 0.55


def hat(vel: float = 1.0, open_: bool = False, decay: float | None = None, seed: int = 4, bright: float = 1.0) -> np.ndarray:
    d = decay if decay is not None else (0.28 if open_ else 0.045)
    n = int(SR * (d * 4 + 0.02))
    t = t_axis(n)
    out = np.zeros(n)
    for r_ in [1.0, 1.4471, 1.6170, 1.9265, 2.5028, 2.6637]:
        out += signal.square(TWO_PI * 3200 * r_ * bright * t)
    out = hp(out / 6, 6500) * 0.9 + hp(rng(seed).standard_normal(n), 8000) * 0.35
    out = out * exp_env(n, d) * attack(n, 0.1)
    return lp(out, 16000) * vel * 0.45


def shaker(vel: float = 1.0, seed: int = 5, decay: float = 0.06) -> np.ndarray:
    n = int(SR * (decay * 4 + 0.02))
    g = rng(seed)
    out = bp(g.standard_normal(n), 3500, 11000) * (attack(n, 6) * exp_env(n, decay))
    return out * vel * 0.3


def conga(vel: float = 1.0, f: float = 190.0, decay: float = 0.16, seed: int = 6) -> np.ndarray:
    n = int(SR * (decay * 4 + 0.03))
    t = t_axis(n)
    fr = f * (1 + 0.5 * np.exp(-t / 0.012))
    out = np.sin(np.cumsum(TWO_PI * fr / SR)) * exp_env(n, decay)
    out += np.sin(TWO_PI * f * 2.3 * t) * exp_env(n, decay * 0.3) * 0.3
    out += hp(rng(seed).standard_normal(n), 2500) * exp_env(n, 0.004) * 0.3
    return saturate(out, 1.3) * attack(n, 0.2) * vel * 0.35


def wood(vel: float = 1.0, f: float = 820.0, seed: int = 7) -> np.ndarray:
    n = int(SR * 0.09)
    t = t_axis(n)
    out = np.sin(TWO_PI * f * t) * exp_env(n, 0.018) + np.sin(TWO_PI * f * 2.9 * t) * exp_env(n, 0.008) * 0.4
    out += hp(rng(seed).standard_normal(n), 3000) * exp_env(n, 0.003) * 0.5
    return out * attack(n, 0.1) * vel * 0.6


def metal(vel: float = 1.0, f: float = 2300.0, decay: float = 0.6, seed: int = 8) -> np.ndarray:
    """Anvil / pipe: inharmonic partials with a bright strike."""
    n = int(SR * (decay * 4 + 0.05))
    t = t_axis(n)
    out = np.zeros(n)
    for k, (r_, a) in enumerate([(1, 1), (1.47, 0.6), (2.09, 0.45), (2.56, 0.3), (3.31, 0.2), (4.2, 0.12)]):
        out += a * np.sin(TWO_PI * f * r_ * t + k) * exp_env(n, decay / (1 + 0.6 * k))
    out = out / 2.4
    out += bp(rng(seed).standard_normal(n), 2000, 12000) * exp_env(n, 0.012) * 0.8
    return out * attack(n, 0.1) * vel * 0.55


def click(vel: float = 1.0, seed: int = 9, f: float = 4000.0) -> np.ndarray:
    n = int(SR * 0.03)
    t = t_axis(n)
    out = hp(rng(seed).standard_normal(n), f) * exp_env(n, 0.0035) + np.sin(TWO_PI * f * 0.6 * t) * exp_env(n, 0.004) * 0.5
    return out * vel * 0.5


def chitter(vel: float = 1.0, seed: int = 10, count: int = 4) -> np.ndarray:
    g = rng(seed)
    n = int(SR * 0.16)
    out = np.zeros(n)
    pos = 0
    for k in range(count):
        c = click(vel * (0.6 + 0.4 * g.random()), seed + k, 3000 + 2500 * g.random())
        s = min(pos, n - len(c))
        out[s : s + len(c)] += c
        pos += int(SR * (0.012 + 0.02 * g.random()))
    return out * 0.8


def ride(vel: float = 1.0, seed: int = 11) -> np.ndarray:
    n = int(SR * 1.2)
    t = t_axis(n)
    out = np.zeros(n)
    for r_ in [1.0, 1.21, 1.63, 2.07, 2.71, 3.4]:
        out += np.sin(TWO_PI * 2600 * r_ * t) * exp_env(n, 0.5 / r_)
    out = hp(out / 4, 3000) + bp(rng(seed).standard_normal(n), 4000, 12000) * exp_env(n, 0.09) * 0.5
    return out * attack(n, 0.1) * vel * 0.22


def tom(vel: float = 1.0, f: float = 110.0, decay: float = 0.28, seed: int = 12) -> np.ndarray:
    n = int(SR * (decay * 4 + 0.03))
    t = t_axis(n)
    fr = f * (1 + 0.7 * np.exp(-t / 0.03))
    out = np.sin(np.cumsum(TWO_PI * fr / SR)) * exp_env(n, decay)
    out += hp(rng(seed).standard_normal(n), 2000) * exp_env(n, 0.005) * 0.3
    return saturate(out, 1.3) * attack(n, 0.2) * vel * 0.8


def crash(vel: float = 1.0, seed: int = 13, decay: float = 1.4) -> np.ndarray:
    n = int(SR * (decay * 3))
    g = rng(seed)
    out = bp(g.standard_normal(n), 2500, 14000) * exp_env(n, decay) + hp(g.standard_normal(n), 6000) * exp_env(n, decay * 0.4) * 0.5
    return out * attack(n, 2) * vel * 0.22


def vinyl(n: int, seed: int = 14, density: float = 9.0, level: float = 1.0) -> np.ndarray:
    """Crackle: sparse impulses, each a tiny low-passed tick, plus a soft hiss floor. Mono."""
    g = rng(seed)
    out = np.zeros(n)
    count = int(density * n / SR)
    pos = g.integers(0, n, count)
    amp = g.random(count) ** 3 * 0.9 + 0.05
    for p, a in zip(pos, amp):
        w = int(SR * (0.0006 + 0.0025 * g.random()))
        e = np.exp(-np.arange(w) / (w / 3)) * a * (1 if g.random() < 0.5 else -1)
        end = min(n, p + w)
        out[p:end] += e[: end - p]
    out = lp(out, 7000)
    hiss = lp(g.standard_normal(n), 3000) * 0.015
    return (out * 0.8 + hiss) * level


# ----------------------------------------------------------------------------- instruments
def sub_bass(f: float, dur: float, vel: float = 1.0, glide_from: float | None = None, drive: float = 1.3, harm: float = 0.18, rel_ms: float = 45.0) -> np.ndarray:
    """A round sub: sine with a little second harmonic and drive; short release so the notes leave space."""
    n = int(SR * (dur + rel_ms / 1000 + 0.02))
    t = t_axis(n)
    fr = f + (glide_from - f) * np.exp(-t / 0.05) if glide_from else np.full(n, f)
    ph = np.cumsum(TWO_PI * fr / SR)
    out = np.sin(ph) + harm * np.sin(2 * ph) * np.exp(-t / 0.35) + 0.08 * np.sin(3 * ph) * np.exp(-t / 0.2)
    out = saturate(out, drive)
    env = attack(n, 5) * np.exp(-t / (dur * 2.5 + 0.8))
    s_ = int(SR * dur)
    env[s_:] *= np.exp(-np.arange(n - s_) / (SR * rel_ms / 1000 / 3))
    return out * env * vel * 0.5


def ep(f: float, dur: float, vel: float = 1.0, bright: float = 1.0) -> np.ndarray:
    """A Rhodes-like electric piano: a tine partial and a bell attack over a warm fundamental, with tremolo."""
    n = int(SR * (dur + 1.6))
    t = t_axis(n)
    v = min(1.0, vel)
    fund = np.sin(TWO_PI * f * t) * np.exp(-t / 1.6)
    second = np.sin(TWO_PI * 2 * f * t + 0.3) * np.exp(-t / 0.9) * 0.35 * v
    tine = np.sin(TWO_PI * f * 7.0 * t) * np.exp(-t / 0.08) * 0.22 * v * bright
    bell = np.sin(TWO_PI * f * 3.98 * t) * np.exp(-t / 0.35) * 0.18 * v * bright
    out = fund + second + tine + bell
    trem = 1 - 0.12 * (0.5 - 0.5 * np.cos(TWO_PI * 4.6 * t))
    env = attack(n, 2)
    s_ = int(SR * dur)
    env[s_:] *= np.exp(-np.arange(n - s_) / (SR * 0.12))  # the key let go: a quick damp
    return lp(out * trem * env, 5500 * bright) * vel * 0.2


def vibes(f: float, dur: float, vel: float = 1.0) -> np.ndarray:
    n = int(SR * (dur + 1.8))
    t = t_axis(n)
    out = np.sin(TWO_PI * f * t) * np.exp(-t / 1.5)
    out += np.sin(TWO_PI * f * 4.0 * t) * np.exp(-t / 0.5) * 0.3
    out += np.sin(TWO_PI * f * 10.0 * t) * np.exp(-t / 0.12) * 0.12
    out += hp(rng(int(f)).standard_normal(n), 3000) * np.exp(-t / 0.004) * 0.25
    trem = 1 - 0.25 * (0.5 - 0.5 * np.cos(TWO_PI * 5.2 * t))
    env = attack(n, 1) * np.minimum(1.0, np.exp(-(t - dur) / 0.3))
    return out * trem * env * vel * 0.3


def bell(f: float, dur: float, vel: float = 1.0) -> np.ndarray:
    n = int(SR * (dur + 2.2))
    t = t_axis(n)
    out = np.sin(TWO_PI * f * t) * np.exp(-t / 1.8)
    out += np.sin(TWO_PI * f * 2.76 * t) * np.exp(-t / 0.9) * 0.4
    out += np.sin(TWO_PI * f * 5.4 * t) * np.exp(-t / 0.35) * 0.25
    out += np.sin(TWO_PI * f * 8.9 * t) * np.exp(-t / 0.12) * 0.12
    return out * attack(n, 0.5) * vel * 0.4


def pluck(f: float, dur: float, vel: float = 1.0, damp: float = 0.994, bright: float = 0.6, seed: int = 20) -> np.ndarray:
    """Karplus-Strong: a plucked string, muted for a funk chuck when `damp` is low."""
    n = int(SR * (dur + 0.6))
    period = max(2, int(round(SR / f)))
    g = rng(seed + int(f))
    buf = g.standard_normal(period)
    buf = lp(buf, 3000 + 6000 * bright)
    out = np.zeros(n)
    y = buf.copy()
    # block-wise string loop
    pos = 0
    prev = 0.0
    while pos < n:
        m = min(period, n - pos)
        out[pos : pos + m] = y[:m]
        # averaging filter with damping
        y2 = damp * 0.5 * (y + np.concatenate([[prev], y[:-1]]))
        prev = y[-1]
        y = y2
        pos += m
    env = np.minimum(1.0, np.exp(-(t_axis(n) - dur) / 0.08))
    return out * env * vel * 0.5


def pad(freqs: list[float], dur: float, vel: float = 1.0, cutoff: float = 1400.0, att_ms: float = 350, rel_ms: float = 700, seed: int = 30, detune: float = 6.0) -> np.ndarray:
    """Detuned saws through a low-pass, stereo: warm and wide."""
    n = int(SR * (dur + rel_ms / 1000 + 0.05))
    t = t_axis(n)
    outL = np.zeros(n)
    outR = np.zeros(n)
    g = rng(seed)
    for f in freqs:
        for k, cents in enumerate([-detune, 0, detune]):
            fr = f * 2 ** (cents / 1200)
            w = signal.sawtooth(TWO_PI * fr * t + g.random() * TWO_PI)
            if k == 0:
                outL += w
            elif k == 2:
                outR += w
            else:
                outL += w * 0.7
                outR += w * 0.7
        sub = np.sin(TWO_PI * f / 2 * t) * 0.22
        outL += sub
        outR += sub
    env = attack(n, att_ms)
    s_ = int(SR * dur)
    env[s_:] *= np.exp(-np.arange(n - s_) / (SR * rel_ms / 1000 / 3))
    out = np.stack([lp(outL, cutoff), lp(outR, cutoff)], axis=1) / (3 * len(freqs) + 1)
    return out * env[:, None] * vel * 0.45


def strings(freqs: list[float], dur: float, vel: float = 1.0, att_ms: float = 600, seed: int = 40) -> np.ndarray:
    n = int(SR * (dur + 1.2))
    t = t_axis(n)
    g = rng(seed)
    outL = np.zeros(n)
    outR = np.zeros(n)
    for f in freqs:
        for k in range(4):
            fr = f * 2 ** ((g.random() - 0.5) * 14 / 1200)
            vib = 1 + 0.004 * np.sin(TWO_PI * (5 + g.random()) * t + g.random() * 6) * np.minimum(1, t / 0.8)
            w = signal.square(TWO_PI * fr * vib * t + g.random() * 6, duty=0.3 + 0.2 * g.random())
            if k % 2:
                outL += w
            else:
                outR += w
    env = attack(n, att_ms)
    s = int(SR * dur)
    env[s:] *= np.exp(-np.arange(n - s) / (SR * 0.35))
    out = np.stack([lp(outL, 2600), lp(outR, 2600)], axis=1) / (2.5 * len(freqs))
    out = hp(out, 120)
    return out * env[:, None] * vel * 0.6


def flute(f: float, dur: float, vel: float = 1.0, seed: int = 50) -> np.ndarray:
    n = int(SR * (dur + 0.4))
    t = t_axis(n)
    vib = 1 + 0.006 * np.sin(TWO_PI * 5.3 * t) * np.minimum(1, np.maximum(0, (t - 0.25) / 0.4))
    out = np.sin(np.cumsum(TWO_PI * f * vib / SR)) + 0.25 * np.sin(np.cumsum(TWO_PI * 2 * f * vib / SR)) + 0.08 * np.sin(np.cumsum(TWO_PI * 3 * f * vib / SR))
    breath = bp(rng(seed).standard_normal(n), f * 0.8, f * 6) * 0.12
    env = attack(n, 60)
    s = int(SR * dur)
    env[s:] *= np.exp(-np.arange(n - s) / (SR * 0.12))
    return (out + breath) * env * vel * 0.35


# ----------------------------------------------------------------------------- sequencer
VEL = {"X": 1.0, "x": 0.78, "o": 0.42, "g": 0.26, ".": 0.0}


@dataclass
class Track:
    name: str
    bus: str  # drums | perc | bass | keys | pad | lead
    pan: float = 0.0
    gain: float = 1.0
    delay_send: float = 0.0
    reverb_send: float = 0.0
    width: float = 0.0
    buf: np.ndarray | None = None


@dataclass
class Song:
    bpm: float
    bars: int
    beats_per_bar: int = 4
    steps_per_beat: int = 4
    swing: float = 0.57
    humanize_ms: float = 4.0
    seed: int = 1
    loop: bool = True
    tail_seconds: float = 0.0  # for one-shots: room after the last event
    tracks: dict[str, Track] = field(default_factory=dict)
    kick_env: np.ndarray | None = None

    def __post_init__(self) -> None:
        self.g = rng(self.seed)
        self.step_len = 60.0 / self.bpm / self.steps_per_beat
        self.bar_len = self.step_len * self.steps_per_beat * self.beats_per_bar
        seconds = self.bar_len * self.bars + (0 if self.loop else self.tail_seconds)
        self.n = int(round(seconds * SR))
        self.kick_trig = np.zeros(self.n)

    @property
    def steps_per_bar(self) -> int:
        return self.steps_per_beat * self.beats_per_bar

    def track(self, name: str, bus: str, **kw) -> Track:
        tr = Track(name, bus, **kw)
        tr.buf = np.zeros((self.n, 2))
        self.tracks[name] = tr
        return tr

    def time(self, bar: int, step: float, swing: bool = True) -> float:
        """Seconds for a step in a bar, with the groove's swing on the off-16ths."""
        t = bar * self.bar_len + step * self.step_len
        if swing and self.steps_per_beat in (2, 4) and int(step) % 2 == 1 and step == int(step):
            t += (self.swing - 0.5) * 2 * self.step_len
        return t

    def place(self, track: Track, t: float, audio: np.ndarray, pan: float | None = None, gain: float = 1.0, humanize: bool = True) -> None:
        if humanize and self.humanize_ms > 0:
            t += self.g.normal(0, self.humanize_ms / 1000)
        if audio.ndim == 1:
            audio = stereo(audio, track.pan if pan is None else pan, track.width)
        start = int(round(t * SR))
        m = len(audio)
        buf = track.buf
        assert buf is not None
        if self.loop:
            idx = (np.arange(m) + start) % self.n
            np.add.at(buf, idx, audio * gain)
        else:
            if start < 0:
                audio = audio[-start:]
                start = 0
            end = min(self.n, start + len(audio))
            if end > start:
                buf[start:end] += audio[: end - start] * gain

    def trig_kick(self, t: float) -> None:
        s = int(round(t * SR)) % self.n if self.loop else min(self.n - 1, max(0, int(round(t * SR))))
        self.kick_trig[s] = 1.0

    # -- pattern helpers
    def drums(self, track: Track, synth, patterns: list[str], bars: range, vel_scale: float = 1.0, swing: bool = True, vel_jitter: float = 0.08, **synth_kw) -> None:
        """`patterns` cycle bar by bar; chars X x o g . per step."""
        for i, bar in enumerate(bars):
            pat = patterns[i % len(patterns)]
            for step, ch in enumerate(pat):
                v = VEL.get(ch, 0.0)
                if v <= 0:
                    continue
                v = v * vel_scale * (1 + self.g.normal(0, vel_jitter))
                v = max(0.05, min(1.2, v))
                t = self.time(bar, step, swing)
                aud = synth(v, seed=int(self.g.integers(0, 10000)), **synth_kw) if "seed" in synth.__code__.co_varnames else synth(v, **synth_kw)
                self.place(track, t, aud)
                if track.name == "kick":
                    self.trig_kick(t)

    def notes(self, track: Track, synth, events: list[tuple[int, float, float, float | list[float], float]], swing: bool = True, strum_ms: float = 0.0, **synth_kw) -> None:
        """events: (bar, step, dur_steps, freq or [freqs], vel)."""
        for bar, step, dur_steps, fr, vel in events:
            t = self.time(bar, step, swing)
            dur = dur_steps * self.step_len
            freqs = fr if isinstance(fr, list) else [fr]
            for k, f in enumerate(freqs):
                aud = synth(f, dur, vel, **synth_kw)
                self.place(track, t + k * strum_ms / 1000, aud)

    def chord(self, track: Track, synth, bar: int, step: float, dur_steps: float, freqs: list[float], vel: float, **kw) -> None:
        t = self.time(bar, step)
        aud = synth(freqs, dur_steps * self.step_len, vel, **kw)
        self.place(track, t, aud)

    # -- render
    def render(self, bus_gain: dict[str, float] | None = None, drums_lp: float = 10500.0, drums_drive: float = 1.5, sidechain: float = 0.45, delay_steps: float = 3.0, delay_fb: float = 0.42, reverb_rt: float = 1.6, reverb_lp: float = 4200.0, crackle: float = 0.08, width: float = 1.0) -> np.ndarray:
        bg = {"drums": 1.0, "perc": 0.8, "bass": 0.9, "keys": 0.75, "pad": 0.6, "lead": 0.7, "fx": 0.7}
        if bus_gain:
            bg.update(bus_gain)
        # sidechain envelope from the kicks: instant attack, ~180 ms release, the max of overlapping ones
        sc = np.zeros(self.n)
        trig = np.flatnonzero(self.kick_trig > 0)
        # vectorised release: for each trigger, an exponential; the max of overlapping ones
        for s in trig:
            m = min(self.n, s + int(SR * 0.6))
            seg = np.exp(-np.arange(m - s) / (SR * 0.18))
            sc[s:m] = np.maximum(sc[s:m], seg)
        if self.loop and len(trig):
            # the last kick's envelope wraps
            s = trig[-1]
            m = s + int(SR * 0.6)
            if m > self.n:
                over = m - self.n
                seg = np.exp(-np.arange(self.n - s, self.n - s + over) / (SR * 0.18))
                sc[:over] = np.maximum(sc[:over], seg)
        duck = 1 - sidechain * sc
        buses: dict[str, np.ndarray] = {}
        delay_in = np.zeros((self.n, 2))
        verb_in = np.zeros((self.n, 2))
        for tr in self.tracks.values():
            assert tr.buf is not None
            b = tr.buf * tr.gain
            buses[tr.bus] = buses.get(tr.bus, np.zeros((self.n, 2))) + b
            if tr.delay_send:
                delay_in += b * tr.delay_send
            if tr.reverb_send:
                verb_in += b * tr.reverb_send
        mix = np.zeros((self.n, 2))
        for name, b in buses.items():
            if name == "drums":
                b = saturate(b * drums_drive, 1.4) / drums_drive
                b = lp(b, drums_lp)
                b = peak_eq(b, 90, 2.0, 0.9)
                b = peak_eq(b, 2800, 1.5, 1.2)
            elif name == "perc":
                b = lp(saturate(b * 1.2, 1.3) / 1.2, 12000)
            elif name == "bass":
                b = lp(b, 1800) * duck[:, None]
            elif name in ("keys", "lead"):
                b = hp(b, 150) * (1 - (1 - duck[:, None]) * 0.6)
            elif name == "pad":
                b = hp(b, 110) * duck[:, None]
            mix += b * bg.get(name, 0.8)
        # dub delay (dotted-eighth by default), circular on loops
        if np.any(delay_in):
            mix += self.dub_delay(delay_in, delay_steps * self.step_len, delay_fb) * bg["fx"]
        if np.any(verb_in):
            mix += self.reverb(verb_in, reverb_rt, reverb_lp) * bg["fx"]
        if crackle > 0:
            cr = vinyl(self.n, seed=self.seed + 99)
            mix += np.stack([cr, np.roll(cr, 137)], axis=1) * crackle
        # width
        if width != 1.0:
            mid = (mix[:, 0] + mix[:, 1]) / 2
            side = (mix[:, 0] - mix[:, 1]) / 2 * width
            mix = np.stack([mid + side, mid - side], axis=1)
        mix = hp(mix, 28)
        return mix

    def bus_levels(self) -> dict[str, tuple[float, float]]:
        """RMS and peak (dBFS) per bus before processing, for balancing."""
        out = {}
        for tr in self.tracks.values():
            assert tr.buf is not None
            b = tr.buf * tr.gain
            r, p = rms_db(b), 20 * math.log10(max(1e-9, float(np.max(np.abs(b)))))
            out[f"{tr.bus}/{tr.name}"] = (round(r, 1), round(p, 1))
        return out

    def dub_delay(self, x: np.ndarray, seconds: float, fb: float, lp_hz: float = 2800.0, hp_hz: float = 320.0, pingpong: bool = True) -> np.ndarray:
        d = max(1, int(round(seconds * SR)))
        n = self.n
        passes = 2 if self.loop else 1
        y = np.zeros((n, 2))
        fbuf = np.zeros((d, 2))
        bl, al = signal.butter(1, lp_hz / (SR / 2), "low")
        bh, ah = signal.butter(1, hp_hz / (SR / 2), "high")
        zl = [signal.lfilter_zi(bl, al) * 0 for _ in range(2)]
        zh = [signal.lfilter_zi(bh, ah) * 0 for _ in range(2)]
        for _p in range(passes):
            pos = 0
            while pos < n:
                m = min(d, n - pos)
                blk = x[pos : pos + m] + fbuf[:m] * fb
                out_blk = np.zeros((m, 2))
                for c in range(2):
                    f1, zl[c] = signal.lfilter(bl, al, blk[:, c], zi=zl[c])
                    f2, zh[c] = signal.lfilter(bh, ah, f1, zi=zh[c])
                    out_blk[:, c] = f2
                if pingpong:
                    out_blk = out_blk[:, ::-1]
                y[pos : pos + m] = out_blk
                # the delayed signal feeds the next block
                if m == d:
                    fbuf = out_blk.copy()
                else:
                    fbuf = np.concatenate([out_blk, fbuf[m:]])
                pos += m
        return y * 0.9

    def reverb(self, x: np.ndarray, rt: float = 1.6, lp_hz: float = 4200.0, predelay_ms: float = 18.0) -> np.ndarray:
        g = rng(self.seed + 7)
        m = int(SR * rt * 2.2)
        t = t_axis(m)
        ir = np.stack([g.standard_normal(m), g.standard_normal(m)], axis=1) * np.exp(-t * 6.9 / rt)[:, None]
        ir = lp(ir, lp_hz)
        ir[: int(SR * 0.01)] *= np.linspace(0, 1, int(SR * 0.01))[:, None]
        pre = int(SR * predelay_ms / 1000)
        ir = np.concatenate([np.zeros((pre, 2)), ir])
        ir /= np.sqrt(np.sum(ir**2, axis=0))[None, :] * 2.2
        if self.loop:
            n = self.n
            out = np.zeros((n, 2))
            for c in range(2):
                X = np.fft.rfft(x[:, c], n)
                H = np.fft.rfft(np.resize(ir[:, c], n) if len(ir) > n else np.concatenate([ir[:, c], np.zeros(n - len(ir))]), n)
                out[:, c] = np.fft.irfft(X * H, n)
            return out
        out = np.zeros((self.n, 2))
        for c in range(2):
            y = signal.fftconvolve(x[:, c], ir[:, c])[: self.n]
            out[:, c] = y
        return out


# ----------------------------------------------------------------------------- master
def limiter(x: np.ndarray, ceiling: float = 0.85, lookahead_ms: float = 4.0, release_ms: float = 90.0) -> np.ndarray:
    la = max(1, int(SR * lookahead_ms / 1000))
    peak = np.max(np.abs(x), axis=1)
    peak = maximum_filter1d(peak, la * 2, mode="nearest")
    need = np.minimum(1.0, ceiling / np.maximum(peak, 1e-9))
    # release: the gain may rise only slowly
    rel = math.exp(-1 / (SR * release_ms / 1000))
    # the gain may rise only slowly (release) but drops at once: min(need, smoothed need)
    sm = signal.lfilter([1 - rel], [1, -rel], need - 1) + 1
    g = np.minimum(need, sm)
    g = np.concatenate([g[la:], np.full(la, g[-1])])  # lookahead: apply the reduction early
    return x * g[:, None]


def rms_db(x: np.ndarray) -> float:
    return 20 * math.log10(max(1e-9, float(np.sqrt(np.mean(x**2)))))


def write_wav24(path: str, x: np.ndarray) -> None:
    x = np.clip(x, -1, 1)
    ints = (x * 8388607).astype(np.int32)
    b = bytearray()
    flat = ints.reshape(-1)
    raw = flat.astype("<i4").tobytes()
    # take the low 3 bytes of each little-endian int32
    arr = np.frombuffer(raw, dtype=np.uint8).reshape(-1, 4)[:, :3]
    data = arr.tobytes()
    nch = x.shape[1]
    with open(path, "wb") as f:
        f.write(b"RIFF" + struct.pack("<I", 36 + len(data)) + b"WAVE")
        f.write(b"fmt " + struct.pack("<IHHIIHH", 16, 1, nch, SR, SR * nch * 3, nch * 3, 24))
        f.write(b"data" + struct.pack("<I", len(data)) + data)
    _ = b
