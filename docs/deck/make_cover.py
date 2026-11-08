"""Cover assets: the kirana photo as a full-bleed, softly blurred background with a dark-red fade on the left
for text, plus the Airtel, SYNC and Unstop marks lifted off the official template backgrounds."""
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

D = Path(__file__).parent
A = D / "assets"


def color_to_alpha(rgb: np.ndarray, bg=255.0, boost=1.0) -> np.ndarray:
    """Remove a white background: alpha is the least opacity that explains each pixel over white."""
    f = rgb.astype(float)
    a = np.clip(((bg - f) / bg).max(axis=2) * boost, 0, 1)
    fg = np.where(a[..., None] > 0, (f - bg * (1 - a[..., None])) / np.maximum(a[..., None], 1e-6), 0)
    return np.dstack([np.clip(fg, 0, 255), a * 255]).astype(np.uint8)


def white_mark(rgb: np.ndarray, lo: int, hi: int) -> np.ndarray:
    """Bright marks on a dark background -> white with alpha from brightness."""
    lum = rgb.astype(float).mean(axis=2)
    a = np.clip((lum - lo) / (hi - lo), 0, 1)
    out = np.full(rgb.shape[:2] + (4,), 255, np.uint8)
    out[..., 3] = (a * 255).astype(np.uint8)
    return out


content = np.array(Image.open(A / "bg_content.jpg").convert("RGB"))
cover = np.array(Image.open(A / "bg_cover.jpg").convert("RGB"))

# Airtel: red mark on white -> solid white mark
airtel = color_to_alpha(content[30:130, 30:232], boost=1.4)
airtel[..., :3] = 255
Image.fromarray(airtel).save(A / "logo_airtel_white.png")

# SYNC: chrome mark on white, keep its colours
Image.fromarray(color_to_alpha(content[48:112, 1685:1892], boost=1.15)).save(A / "logo_sync.png")

# Unstop: white text and mark on the dark cover
Image.fromarray(white_mark(cover[985:1050, 1495:1895], 110, 200)).save(A / "logo_unstop_white.png")

# Background: soft blur + left-to-right fade from deep red-black so text reads cleanly
hero = Image.open(A / "hero_owner.png").convert("RGB").resize((1920, 1080), Image.LANCZOS)
hero = hero.filter(ImageFilter.GaussianBlur(2.2))
x = np.linspace(0, 1, 1920)
fade = np.clip(1 - (x - 0.18) / 0.42, 0, 1) ** 1.3 * 0.88          # strong on the left, gone by ~60% width
fade = np.maximum(fade, 0.18)                                        # light veil over the whole photo
shade = np.array([28, 6, 8], float)
h = np.array(hero, float)
h = h * (1 - fade[None, :, None]) + shade * fade[None, :, None]
Image.fromarray(h.astype(np.uint8)).save(A / "cover_bg.jpg", quality=92)
print("cover assets written")
