#!/usr/bin/env python3
"""
Dukhata brand generator — builds every asset from the owner's artwork.

Two treatments, by decision:

  1. ICONS (app icon, favicon, Apple icon, maskable, Android launcher, splash)
     The owner's own logo, untouched: the lime mark centred on pure black.
     No glow, no gradient, no rounding, no recolouring.

  2. EVERY OTHER PLACEMENT (site header, footer, sign-in screens, social card)
     "Outline + soft fill": a contour stroke drawn ON the shape boundary, with a
     whisper of the same ink inside it.

Only Pillow is required (the contour is morphology via Min/MaxFilter).

Run from the repo root:  python scripts/generate_icons.py
"""

from __future__ import annotations

import os

from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, ".."))
OUT = os.path.join(ROOT, "public")
SOURCE = os.path.join(OUT, "logo.png")

SS = 4  # supersample factor

# --- theme, from src/app/globals.css ---------------------------------------
BG = (250, 248, 244)
CREAM_2 = (243, 239, 232)
LINE = (235, 231, 225)
INK = (28, 25, 23)
INK_MUTED = (120, 113, 105)
INK_SUBTLE = (150, 143, 134)
ACCENT = (249, 115, 22)
BLACK = (0, 0, 0)

#: Fill opacity of the "soft fill" inside the contour (of 255).
SOFT_FILL_ALPHA = 38

FONTS = {
    "bold": ["C:/Windows/Fonts/segoeuib.ttf", "C:/Windows/Fonts/arialbd.ttf"],
    "semi": ["C:/Windows/Fonts/seguisb.ttf", "C:/Windows/Fonts/segoeuib.ttf"],
    "reg": ["C:/Windows/Fonts/segoeui.ttf", "C:/Windows/Fonts/arial.ttf"],
}

GLYPH_THRESHOLD = 45


# ─────────────────────────────────────────────────────────────────────────────
# the owner's mark
# ─────────────────────────────────────────────────────────────────────────────
def mark_rgba() -> Image.Image:
    """The mark as the owner drew it: original colour, alpha from the green
    channel (the backing is pure black, so green is 0 there). Never recoloured."""
    logo = Image.open(SOURCE).convert("RGBA")
    lum = logo.convert("L")
    box = lum.point(lambda v: 255 if v > GLYPH_THRESHOLD else 0).getbbox()
    if not box:
        raise SystemExit("logo.png appears to be blank")
    glyph = logo.crop(box)
    glyph.putalpha(glyph.getchannel("G"))
    return glyph


def mark_alpha() -> Image.Image:
    return mark_rgba().getchannel("A")


# ─────────────────────────────────────────────────────────────────────────────
# treatment 1 — icons: the artwork exactly, lime on black
# ─────────────────────────────────────────────────────────────────────────────
def icon(size: int, fill: float = 0.62) -> Image.Image:
    """Pure black square with the owner's mark centred. Nothing else."""
    S = size * SS
    base = Image.new("RGB", (S, S), BLACK)
    mark = mark_rgba()
    tw = max(1, round(S * fill))
    th = max(1, round(mark.height * tw / mark.width))
    scaled = mark.resize((tw, th), Image.LANCZOS)
    base.paste(scaled, ((S - tw) // 2, (S - th) // 2), scaled)
    return base.resize((size, size), Image.LANCZOS)


def save_icons() -> None:
    for size in (48, 96, 144, 192, 512):
        icon(size).save(os.path.join(OUT, f"icon-{size}.png"), optimize=True)
        print(f"icon-{size}.png")

    icon(512).save(os.path.join(OUT, "icon.png"), optimize=True)
    icon(64).save(os.path.join(OUT, "favicon.png"), optimize=True)
    icon(180).save(os.path.join(OUT, "apple-icon.png"), optimize=True)
    # Maskable: the mark must sit inside Android's safe zone, so it is smaller
    # here while the black still bleeds to every edge.
    icon(512, fill=0.46).save(os.path.join(OUT, "icon-maskable-512.png"), optimize=True)
    print("icon.png, favicon.png, apple-icon.png, icon-maskable-512.png")

    icon(48).save(
        os.path.join(OUT, "favicon.ico"),
        format="ICO",
        sizes=[(16, 16), (32, 32), (48, 48)],
    )
    print("favicon.ico")


# ─────────────────────────────────────────────────────────────────────────────
# treatment 2 — outline + soft fill
# ─────────────────────────────────────────────────────────────────────────────
def outline_fill(stroke_px: int, colour=INK, fill_alpha: int = SOFT_FILL_ALPHA) -> Image.Image:
    """A contour stroke centred on the boundary, over a soft wash of the same ink.

    Centred (dilate minus erode) rather than inside-only, so the line is the same
    width everywhere and always closes. The artboard is the glyph's exact bounds,
    so the canvas is padded first — otherwise the outer half of the stroke is
    clipped at the edge and the contour breaks.
    """
    radius = max(1, int(round(stroke_px / 2)))
    pad = radius + 8
    alpha = mark_alpha()

    canvas = Image.new("L", (alpha.width + pad * 2, alpha.height + pad * 2), 0)
    canvas.paste(alpha, (pad, pad))

    outer = canvas.filter(ImageFilter.MaxFilter(2 * radius + 1))
    inner = canvas.filter(ImageFilter.MinFilter(2 * radius + 1))
    band = ImageChops.subtract(outer, inner)

    wash = Image.new("RGBA", canvas.size, colour + (0,))
    wash.putalpha(inner.point(lambda v: fill_alpha if v > 110 else 0))

    line = Image.new("RGBA", canvas.size, colour + (0,))
    line.putalpha(band)

    out = Image.alpha_composite(wash, line)
    keep = pad - (radius + 2)
    return out.crop((keep, keep, out.width - keep, out.height - keep))


def square(mark: Image.Image, canvas: int, fill: float = 0.86) -> Image.Image:
    """Centre a wide mark on a square transparent canvas."""
    tw = round(canvas * fill)
    th = round(mark.height * tw / mark.width)
    scaled = mark.resize((tw, th), Image.LANCZOS)
    out = Image.new("RGBA", (canvas, canvas), (0, 0, 0, 0))
    out.paste(scaled, ((canvas - tw) // 2, (canvas - th) // 2), scaled)
    return out


def save_marks() -> None:
    # Small placements (header 28px, dashboard 40px): a lighter stroke, because at
    # these sizes a heavier one would close the gaps between the strokes.
    square(outline_fill(6), 256).save(os.path.join(OUT, "logo-mark.png"), optimize=True)
    # Larger placements (sign-in screens ~64px): a slightly heavier stroke.
    square(outline_fill(5), 256).save(os.path.join(OUT, "logo-mark-lg.png"), optimize=True)
    # The PIN screen sits on a dark brand gradient, so it needs the light ink.
    square(outline_fill(5, colour=(247, 245, 241)), 256).save(
        os.path.join(OUT, "logo-mark-light.png"), optimize=True
    )
    print("logo-mark.png (header/footer), logo-mark-lg.png (sign-in), logo-mark-light.png (dark)")


# ─────────────────────────────────────────────────────────────────────────────
# social card
# ─────────────────────────────────────────────────────────────────────────────
def font(kind: str, size: int) -> ImageFont.FreeTypeFont:
    for path in FONTS[kind]:
        if os.path.exists(path):
            return ImageFont.truetype(path, size)
    return ImageFont.load_default()


def social_card() -> None:
    W, H = 1200, 630
    side = max(W, H)
    card = Image.new("RGBA", (W, H), CREAM_2 + (255,))

    # soft warm wash, very low contrast
    small = 160
    glow = Image.new("L", (small, small), 0)
    gd = ImageDraw.Draw(glow)
    for i in range(40, 0, -1):
        a = int(46 * (1 - i / 40) ** 1.5)
        rr = (W * 0.72 / side) * small * i / 40
        cx, cy = (W * 0.78 / side) * small, (H * 0.10 / side) * small
        gd.ellipse([cx - rr, cy - rr, cx + rr, cy + rr], fill=a)
    glow = glow.filter(ImageFilter.GaussianBlur(small * 0.05)).resize((W, H), Image.LANCZOS)
    wash = Image.new("RGBA", (W, H), (255, 255, 255, 0))
    wash.putalpha(glow)
    card = Image.alpha_composite(card, wash)

    # the outline + soft fill mark, floating
    mark = square(outline_fill(5), 340, fill=0.9)
    mx, my = 110, (H - 340) // 2
    shadow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(shadow).ellipse(
        [mx + 40, my + 250, mx + 300, my + 300], fill=(28, 25, 23, 46)
    )
    card = Image.alpha_composite(card, shadow.filter(ImageFilter.GaussianBlur(26)))
    card.paste(mark, (mx, my), mark)

    d = ImageDraw.Draw(card)
    x = mx + 340 + 60
    d.text((x, 168), "Dukhata", font=font("bold", 104), fill=INK)
    d.text((x, 306), "The digital khata for Pakistani shops", font=font("semi", 37), fill=INK_MUTED)
    d.text(
        (x, 360),
        "Record a sale by speaking. Udhaar and balances stay correct.",
        font=font("reg", 27),
        fill=INK_SUBTLE,
    )
    d.rounded_rectangle([x, 438, x + 104, 446], radius=4, fill=ACCENT)
    d.text((x, 470), "Free 14-day trial  ·  dukhata.com", font=font("semi", 31), fill=INK)

    card.convert("RGB").save(os.path.join(OUT, "opengraph-image.png"), optimize=True)
    print("opengraph-image.png (1200x630)")


def main() -> None:
    print("source mark:", Image.open(SOURCE).size)
    save_icons()
    save_marks()
    social_card()
    print("\ndone — icons are the artwork on black; every other mark is outline + soft fill")


if __name__ == "__main__":
    main()
