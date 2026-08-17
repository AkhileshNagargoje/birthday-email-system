"""Draws the birthday banner as a real image.

Everything is generated - there is no template file to keep in sync, and the
student's name is set as part of the composition rather than pasted over it.

Rendered at 2x and downscaled, which is what stops the text looking soft on
phone screens. The email embeds it inline (a cid: attachment), so it travels
with the message rather than being fetched from a server.
"""

import io
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

from . import config

WIDTH, HEIGHT = 1200, 500          # displayed at 600x250
SCALE = 2                          # drawn at 2x, then resized down

# Forest palette, dark at the top so pale text sits comfortably on it.
DEEP = (13, 61, 43)
MID = (23, 87, 60)
LIGHT = (44, 122, 79)
CANOPY = [(28, 94, 62), (37, 112, 74), (48, 132, 87), (61, 150, 100)]
TRUNK = (74, 56, 38)
CREAM = (245, 250, 246)
PALE = (150, 205, 173)
GOLD = (226, 191, 106)

SYSTEM_FONTS = [
    r"C:\Windows\Fonts\segoeuib.ttf",
    r"C:\Windows\Fonts\arialbd.ttf",
    r"C:\Windows\Fonts\calibrib.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
]
SERIF_FONTS = [
    r"C:\Windows\Fonts\georgiab.ttf",
    r"C:\Windows\Fonts\timesbd.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationSerif-Bold.ttf",
]


def _font(size, serif=False):
    from PIL import ImageFont
    for candidate in (SERIF_FONTS if serif else SYSTEM_FONTS):
        if Path(candidate).exists():
            try:
                return ImageFont.truetype(candidate, size)
            except OSError:
                continue
    for candidate in SYSTEM_FONTS:
        if Path(candidate).exists():
            try:
                return ImageFont.truetype(candidate, size)
            except OSError:
                continue
    return ImageFont.load_default()


def _gradient(size):
    """Vertical gradient, drawn small and scaled up so it stays smooth."""
    w, h = size
    strip = Image.new("RGB", (1, h))
    for y in range(h):
        t = y / max(1, h - 1)
        # Ease the middle so the band does not look like a linear ramp.
        t = t * t * (3 - 2 * t)
        if t < 0.55:
            u = t / 0.55
            colour = tuple(round(DEEP[i] + (MID[i] - DEEP[i]) * u) for i in range(3))
        else:
            u = (t - 0.55) / 0.45
            colour = tuple(round(MID[i] + (LIGHT[i] - MID[i]) * u) for i in range(3))
        strip.putpixel((0, y), colour)
    return strip.resize(size, Image.BILINEAR)


def _tree(draw, cx, base_y, scale):
    """A simple flat-illustration tree: trunk, then overlapping canopy discs."""
    trunk_w = int(16 * scale)
    draw.rounded_rectangle(
        [cx - trunk_w // 2, base_y - int(120 * scale), cx + trunk_w // 2, base_y],
        radius=int(6 * scale), fill=TRUNK,
    )
    # Two branches, so the trunk does not read as a post.
    draw.line([(cx, base_y - int(74 * scale)), (cx - int(30 * scale), base_y - int(104 * scale))],
              fill=TRUNK, width=int(7 * scale))
    draw.line([(cx, base_y - int(88 * scale)), (cx + int(28 * scale), base_y - int(114 * scale))],
              fill=TRUNK, width=int(7 * scale))

    discs = [
        (cx, base_y - int(178 * scale), int(66 * scale), CANOPY[0]),
        (cx - int(52 * scale), base_y - int(140 * scale), int(52 * scale), CANOPY[1]),
        (cx + int(54 * scale), base_y - int(144 * scale), int(55 * scale), CANOPY[2]),
        (cx - int(16 * scale), base_y - int(196 * scale), int(44 * scale), CANOPY[3]),
        (cx + int(24 * scale), base_y - int(190 * scale), int(40 * scale), CANOPY[3]),
    ]
    for x, y, r, colour in discs:
        draw.ellipse([x - r, y - r, x + r, y + r], fill=colour)


def _leaves(draw, scale):
    """A few drifting leaves.

    Fixed positions, so the image is byte-identical every run - and all of them
    kept clear of the left text column, because a leaf landing on the "G" of
    GCOERC turned it into "6COERC".
    """
    spots = [(902, 78, 6), (988, 148, 7), (1096, 96, 5), (1158, 214, 6),
             (1046, 300, 5), (1148, 372, 6), (868, 196, 4), (1186, 132, 4)]
    for x, y, r in spots:
        x, y, r = int(x * scale), int(y * scale), int(r * scale)
        draw.ellipse([x - r, y - r * 2, x + r, y + r * 2], fill=PALE)


def _tracked(draw, xy, text, font, fill, tracking):
    """Letter-spaced text. Pillow has no tracking, so glyphs are placed one at
    a time - worth it, because wide tracking is most of what makes small caps
    read as designed rather than shouted."""
    x, y = xy
    for ch in text:
        draw.text((x, y), ch, font=font, fill=fill)
        x += draw.textlength(ch, font=font) + tracking
    return x


def _tracked_width(draw, text, font, tracking):
    return sum(draw.textlength(c, font=font) for c in text) + tracking * (len(text) - 1)


def make_banner(name: str) -> bytes:
    """Returns the banner as PNG bytes, with `name` set into it."""
    s = SCALE
    size = (WIDTH * s, HEIGHT * s)
    image = _gradient(size)
    draw = ImageDraw.Draw(image)

    _leaves(draw, s)

    # Ground: a wide, very flat ellipse reads as a horizon without a hard edge.
    ground_top = int(HEIGHT * 0.74) * s
    draw.ellipse([-int(200 * s), ground_top, size[0] + int(200 * s),
                  ground_top + int(260 * s)], fill=(16, 70, 49))

    _tree(draw, int(WIDTH * 0.845) * s, ground_top + int(14 * s), s)

    left = int(84 * s)
    college = _font(int(17 * s))
    label = _font(int(21 * s))
    serif = _font(int(74 * s), serif=True)
    small = _font(int(20 * s), serif=True)

    y = int(96 * s)
    _tracked(draw, (left, y), config.EMAIL_FROM_NAME.upper(), college, PALE, int(5 * s))

    y += int(52 * s)
    _tracked(draw, (left, y), "HAPPY BIRTHDAY", label, GOLD, int(9 * s))

    # The name: shrink to fit rather than overflow, since some are long.
    y += int(46 * s)
    max_w = int(WIDTH * 0.62) * s
    font_px = int(74 * s)
    while font_px > int(30 * s):
        serif = _font(font_px, serif=True)
        if draw.textlength(name, font=serif) <= max_w:
            break
        font_px -= int(2 * s)
    draw.text((left, y), name, font=serif, fill=CREAM)

    bbox = draw.textbbox((left, y), name, font=serif)
    rule_y = bbox[3] + int(26 * s)
    draw.rounded_rectangle([left, rule_y, left + int(66 * s), rule_y + int(4 * s)],
                           radius=int(2 * s), fill=GOLD)

    draw.text((left, rule_y + int(26 * s)),
              f"\u2022  {config.INITIATIVE_NAME}", font=small, fill=PALE)

    # Downscale: the whole point of drawing at 2x.
    image = image.resize((WIDTH, HEIGHT), Image.LANCZOS)
    image = image.filter(ImageFilter.SMOOTH)

    buffer = io.BytesIO()
    image.save(buffer, format="PNG", optimize=True)
    return buffer.getvalue()
