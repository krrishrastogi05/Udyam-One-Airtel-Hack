"""Generate one infographic panel with Google's image model (Nano Banana 2) using the Gemini key in .env.
usage: python gen_panel.py <prompt_file.txt> <out.png> [aspect]"""
import base64
import sys
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parents[2]
KEY = next(l.split("=", 1)[1].strip() for l in (ROOT / ".env").read_text(encoding="utf-8-sig").splitlines() if l.startswith("GEMINI_API_KEY="))
MODEL = "gemini-3.1-flash-image"

STYLE = """STYLE (apply exactly): premium consulting-style infographic panel on a pure white background, for an Airtel
hackathon deck. Palette: Airtel red #E40000 as the main accent, charcoal #1D1D1F text, soft light-grey #F5F5F7 cards,
soft red tint #FFF0F0, thin #E3E3E8 card borders; small touches of green #1E8E3E only for checkmarks. Rounded cards,
red numbered circles, flat line icons inside soft circular badges, thin connector arrows. Crisp modern sans-serif
typography (like Inter or Poppins), strong hierarchy: bold card titles, short one-line descriptions. Generous spacing,
perfectly aligned grid, no clutter, no 3D, no gradients on text, no photos unless asked, no watermark.
IMPORTANT: do NOT draw any heading, title or subtitle across the top of the image; start directly with the content
zones. Every word must be spelled exactly as given; do not add any other text, numbers or labels."""


def generate(prompt: str, out: Path, aspect: str = "21:9"):
    r = httpx.post(f"https://generativelanguage.googleapis.com/v1beta/models/{MODEL}:generateContent",
                   headers={"x-goog-api-key": KEY}, timeout=240,
                   json={"contents": [{"role": "user", "parts": [{"text": STYLE + "\n\n" + prompt}]}],
                         "generationConfig": {"responseModalities": ["IMAGE"], "imageConfig": {"aspectRatio": aspect, "imageSize": "2K"}}})
    if r.status_code != 200:
        raise SystemExit(f"{r.status_code}: {r.text[:500]}")
    for part in r.json()["candidates"][0]["content"]["parts"]:
        if "inlineData" in part:
            out.write_bytes(base64.b64decode(part["inlineData"]["data"]))
            print("wrote", out)
            return
    raise SystemExit("no image in response: " + str(r.json())[:400])


if __name__ == "__main__":
    generate(Path(sys.argv[1]).read_text(encoding="utf-8"), Path(sys.argv[2]), sys.argv[3] if len(sys.argv) > 3 else "21:9")
