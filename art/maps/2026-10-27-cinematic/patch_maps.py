"""Record of the v0.14.1 map fixes (see NOTES.md). Paths point at the integration session's folders.

Patch the environment layer of the delivered maps, then recomposite the layer stack.

Fixes: white edge strips (Rootkin right edge and bottom band, Chitin right edge) and the
old-layout sockets left in the Lumenari scenery. Only layer-00 (the painted environment) is
touched; the trail, platforms and start/finish layers are composited on top unchanged.
"""
import sys
import numpy as np
import cv2
from PIL import Image

SRC = "/home/claude/incoming/maps-drop/editable"
LAYERS = ["layer-00-painted-environment", "layer-01-ambient-glow", "layer-02-soft-terrain-edges",
          "layer-03-walkable-trail", "layer-04-build-platforms", "layer-05-start-+-finish"]


def load_env(mid):
    return np.asarray(Image.open(f"{SRC}/{mid}/{LAYERS[0]}.png").convert("RGB")).copy()


def locked(mid):
    """Union of the three locked masks (trail, pads, objectives), grown by 6 px."""
    m = None
    for name in ("mask-locked-trail", "mask-locked-pads", "mask-locked-objectives"):
        a = np.asarray(Image.open(f"{SRC}/{mid}/{name}.png").convert("L")) > 127
        m = a if m is None else (m | a)
    return cv2.dilate(m.astype(np.uint8), np.ones((13, 13), np.uint8)) > 0


def fill(env, hole, method="shiftmap", pad=96, blend=True, feather=4.0, avoid=None):
    """Inpaint the pixels where hole is True, working on a local window for speed.

    avoid: pixels that must never be copied into the hole (the trail and the platforms, which the
    environment layer still carries in their old colours under the upper layers). They are handed
    to the inpainter as missing too, and their fill is thrown away.
    """
    ys, xs = np.where(hole)
    y0, y1 = max(0, ys.min() - pad), min(env.shape[0], ys.max() + pad + 1)
    x0, x1 = max(0, xs.min() - pad), min(env.shape[1], xs.max() + pad + 1)
    win = np.ascontiguousarray(env[y0:y1, x0:x1])
    h = hole[y0:y1, x0:x1]
    excl = h if avoid is None else (h | avoid[y0:y1, x0:x1])
    bgr = cv2.cvtColor(win, cv2.COLOR_RGB2BGR)
    if method == "telea":
        out = cv2.inpaint(bgr, h.astype(np.uint8) * 255, 7, cv2.INPAINT_TELEA)
    else:
        valid = (~excl).astype(np.uint8) * 255  # xphoto: non-zero = valid, zero = to fill
        out = np.zeros_like(bgr)
        mode = {"fsr": cv2.xphoto.INPAINT_FSR_FAST, "fsr-best": cv2.xphoto.INPAINT_FSR_BEST, "shiftmap": cv2.xphoto.INPAINT_SHIFTMAP}[method]
        cv2.xphoto.inpaint(bgr, valid, out, mode)
    if method != "telea" and blend:
        # gradient-domain blend of the filled window back into the original, so the tone of the
        # fill meets its surroundings without a visible ring
        m = cv2.dilate(h.astype(np.uint8) * 255, np.ones((9, 9), np.uint8))
        m[:2, :] = 0; m[-2:, :] = 0; m[:, :2] = 0; m[:, -2:] = 0
        ys2, xs2 = np.where(m > 0)
        cx, cy = (xs2.min() + xs2.max()) // 2, (ys2.min() + ys2.max()) // 2
        out = cv2.seamlessClone(out, bgr, m, (int(cx), int(cy)), cv2.NORMAL_CLONE)
    out = cv2.cvtColor(out, cv2.COLOR_BGR2RGB)
    # feather the seam over a few pixels just outside the hole
    soft = cv2.GaussianBlur(h.astype(np.float32), (0, 0), feather)
    soft = np.clip(np.maximum(soft * 1.6, h), 0, 1)[..., None]
    env[y0:y1, x0:x1] = (out * soft + win * (1 - soft)).astype(np.uint8)
    return env


def circle(shape, cx, cy, r, wobble=0.0, seed=1):
    """A disc, optionally with a wobbly edge so a patch seam never traces a perfect ring."""
    yy, xx = np.mgrid[0:shape[0], 0:shape[1]]
    if not wobble:
        return (xx - cx) ** 2 + (yy - cy) ** 2 <= r * r
    rng = np.random.default_rng(seed)
    k = rng.uniform(0, 2 * np.pi, 3)
    ang = np.arctan2(yy - cy, xx - cx)
    rr = r * (1 + wobble * (0.5 * np.sin(3 * ang + k[0]) + 0.3 * np.sin(5 * ang + k[1]) + 0.2 * np.sin(7 * ang + k[2])))
    return (xx - cx) ** 2 + (yy - cy) ** 2 <= rr * rr


def recomposite(mid, env):
    out = Image.fromarray(env).convert("RGBA")
    for name in LAYERS[1:]:
        out.alpha_composite(Image.open(f"{SRC}/{mid}/{name}.png").convert("RGBA"))
    return out.convert("RGB")


def mirror_right(env, x0, lock):
    """Replace columns x0.. with the columns just left of x0, mirrored (no seam at x0)."""
    W = env.shape[1]
    n = W - x0
    src = env[:, x0 - n:x0][:, ::-1]
    keep = lock[:, x0:]
    out = env.copy()
    out[:, x0:] = np.where(keep[..., None], env[:, x0:], src)
    return out


def mirror_bottom(env, y0, lock, telea_cols=()):
    """Replace rows y0.. with the rows just above y0, mirrored; in telea_cols ranges (x0, x1), where the
    rows above hold platform art the mirror would copy, fill smoothly instead and feather between."""
    H = env.shape[0]
    n = H - y0
    out = env.copy()
    out[y0:] = env[y0 - n:y0][::-1]
    if telea_cols:
        hole = np.zeros(env.shape[:2], bool)
        hole[y0:] = True
        smooth = fill(env.copy(), hole & ~lock, "telea", pad=40, blend=False, feather=1.0)
        w = np.zeros(env.shape[1], np.float32)
        for a, b in telea_cols:
            w[a:b] = 1.0
        w = cv2.GaussianBlur(w[None, :], (0, 0), 8)[0]
        out[y0:] = (smooth[y0:] * w[None, :, None] + out[y0:] * (1 - w[None, :, None])).astype(np.uint8)
    out[y0:] = np.where(lock[y0:, :, None], env[y0:], out[y0:])
    return out


def edge_shadow(env, rows_from=None, strength=0.3):
    out = env.astype(np.float32)
    H = env.shape[0]
    if rows_from is not None:
        g = np.ones(H, np.float32)
        g[rows_from:] = 1.0 - strength * np.linspace(0, 1, H - rows_from) ** 1.5
        out *= g[:, None, None]
    return np.clip(out, 0, 255).astype(np.uint8)
