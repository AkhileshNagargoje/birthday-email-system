"""Draws the student's name onto the poster template."""

import io
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

from . import config

# Where the name sits, as fractions of the image (left, top, right, bottom).
# Tweak these to match wherever your template leaves blank space.
NAME_BOX = (0.08, 0.52, 0.92, 0.68)
NAME_COLOR = (255, 255, 255)
NAME_SHADOW = (0, 0, 0, 90)

MAX_FONT_SIZE = 200
MIN_FONT_SIZE = 18

# Fallbacks if assets/font.ttf is absent — these ship with Windows.
SYSTEM_FONTS = [
    r"C:\Windows\Fonts\segoeuib.ttf",
    r"C:\Windows\Fonts\arialbd.ttf",
    r"C:\Windows\Fonts\calibrib.ttf",
    r"C:\Windows\Fonts\arial.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
]


def _font_path():
    if config.POSTER_FONT.exists():
        return str(config.POSTER_FONT)
    for candidate in SYSTEM_FONTS:
        if Path(candidate).exists():
            return candidate
    return None


def _load_font(size):
    path = _font_path()
    if path is None:
        # Last resort: bitmap default. Ugly, but it still produces a poster.
        return ImageFont.load_default()
    return ImageFont.truetype(path, size)


def _fit_font(draw, text, max_w, max_h):
    """Largest font size at which `text` fits inside the box."""
    for size in range(MAX_FONT_SIZE, MIN_FONT_SIZE - 1, -2):
        font = _load_font(size)
        left, top, right, bottom = draw.textbbox((0, 0), text, font=font)
        if (right - left) <= max_w and (bottom - top) <= max_h:
            return font
    return _load_font(MIN_FONT_SIZE)


def make_poster(name, template_path=None):
    """Returns the finished poster as PNG bytes, or None in HTML banner mode."""
    if config.POSTER_MODE != "image":
        return None

    template_path = Path(template_path or config.POSTER_TEMPLATE)
    if not template_path.exists():
        raise FileNotFoundError(
            f"Poster template not found: {template_path}\n"
            "Run:  python tools/make_template.py   to generate a starter one, "
            "or drop your own design there."
        )

    image = Image.open(template_path).convert("RGB")
    draw = ImageDraw.Draw(image)

    w, h = image.size
    x0, y0, x1, y1 = (
        NAME_BOX[0] * w, NAME_BOX[1] * h,
        NAME_BOX[2] * w, NAME_BOX[3] * h,
    )
    box_w, box_h = x1 - x0, y1 - y0

    font = _fit_font(draw, name, box_w, box_h)
    left, top, right, bottom = draw.textbbox((0, 0), name, font=font)
    text_w, text_h = right - left, bottom - top

    x = x0 + (box_w - text_w) / 2 - left
    y = y0 + (box_h - text_h) / 2 - top

    # Soft shadow first so the name stays readable on a busy template.
    draw.text((x + 3, y + 3), name, font=font, fill=NAME_SHADOW[:3])
    draw.text((x, y), name, font=font, fill=NAME_COLOR)

    buffer = io.BytesIO()
    image.save(buffer, format="PNG", optimize=True)
    return buffer.getvalue()


def save_poster(name, destination):
    destination = Path(destination)
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_bytes(make_poster(name))
    return destination
