"""Generates a starter poster template at assets/template.png.

It is deliberately plain — replace it with a real design from Canva when you
have one. Keep the middle band clear, since that is where the name is drawn
(see NAME_BOX in src/poster.py).

    python tools/make_template.py
"""

import sys
from pathlib import Path

from PIL import Image, ImageDraw

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src import poster  # noqa: E402  (needs the path tweak above)

WIDTH, HEIGHT = 1200, 800
TOP = (34, 40, 96)
BOTTOM = (146, 52, 122)
OUT = Path(__file__).resolve().parent.parent / "assets" / "template.png"


def gradient():
    image = Image.new("RGB", (WIDTH, HEIGHT))
    draw = ImageDraw.Draw(image)
    for y in range(HEIGHT):
        ratio = y / HEIGHT
        draw.line(
            [(0, y), (WIDTH, y)],
            fill=tuple(round(TOP[i] + (BOTTOM[i] - TOP[i]) * ratio) for i in range(3)),
        )
    return image


def confetti(draw):
    colors = [(255, 209, 102), (255, 107, 107), (6, 214, 160), (17, 138, 178)]
    # Fixed layout rather than random, so regenerating gives the same file.
    for i in range(60):
        x = (i * 197) % WIDTH
        y = (i * 89) % HEIGHT
        if 0.45 * HEIGHT < y < 0.75 * HEIGHT:
            continue  # keep the name band clear
        size = 8 + (i % 4) * 4
        draw.ellipse([x, y, x + size, y + size], fill=colors[i % len(colors)])


def main():
    image = gradient()
    draw = ImageDraw.Draw(image)
    confetti(draw)

    title = "HAPPY BIRTHDAY"
    font = poster._load_font(88)
    left, top, right, bottom = draw.textbbox((0, 0), title, font=font)
    x = (WIDTH - (right - left)) / 2 - left
    draw.text((x + 3, 0.30 * HEIGHT + 3), title, font=font, fill=(0, 0, 0))
    draw.text((x, 0.30 * HEIGHT), title, font=font, fill=(255, 255, 255))

    OUT.parent.mkdir(parents=True, exist_ok=True)
    image.save(OUT)
    print(f"Wrote {OUT} ({WIDTH}x{HEIGHT})")


if __name__ == "__main__":
    main()
