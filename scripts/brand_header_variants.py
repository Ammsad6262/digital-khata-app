#!/usr/bin/env python3
"""
Preview header-mark treatments for the owner's logo, on the site's cream.

The first logo the site shipped was a flat, monochrome, LINE-DRAWN mark in the
theme brand colour (see git ffa7e14). The owner wants that same design language
applied to their own mark. This renders the candidates side by side so the
choice can be made by eye. It writes only to the preview folder — nothing live.

Run:  python scripts/brand_header_variants.py
"""

from __future__ import annotations

import os
from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, ".."))
SOURCE = os.path.join(ROOT, "public", "logo.png")
PREVIEW_DIR = os.environ.get(
    "BRAND_PREVIEW_DIR", os.path.join(ROOT, ".brand-preview")
)

CREAM = (250, 248, 244)
INK = (28, 25, 23)
INK_MUTED = (120, 113, 105)
GRAPHITE = (41, 37, 36)      # --brand-700
EMERALD = (4, 120, 87)       # --brand success dark
GREEN = (22, 163, 74)
ACCENT = (249, 115, 22)

FONT_BOLD = "C:/Windows/Fonts/segoeuib.ttf"
FONT_SEMI = "C:/Windows/Fonts/seguisb.ttf"
FONT_REG = "C:/Windows/Fonts/segoeui.ttf"


def load_alpha() -> Image.Image:
    logo = Image.open(SOURCE).convert("RGBA")
    lum = logo.convert("L")
    box = lum.point(lambda v: 255 if v > 45 else 0).getbbox()
    g = logo.crop(box)
    return g.getchannel("G")  # 0 on black bg, up to 255 on the mark


def solid(colour, a) -> Image.Image:
    im = Image.new("RGBA", a.size, colour + (0,))
    im.putalpha(a)
    return im


def line(colour, a, weight: int) -> Image.Image:
    """Outline (line-art) version: keep only a band at the shape's boundary."""
    m = a.point(lambda v: 255 if v > 110 else 0)
    er = m.filter(ImageFilter.MinFilter(2 * weight + 1))
    ring = ImageChops.subtract(m, er)
    ring = ring.filter(ImageFilter.GaussianBlur(0.7))
    im = Image.new("RGBA", a.size, colour + (0,))
    im.putalpha(ring)
    return im


def fit(mark: Image.Image, target_w: int) -> Image.Image:
    h = max(1, round(mark.height * target_w / mark.width))
    return mark.resize((target_w, h), Image.LANCZOS)


def font(kind, size):
    for p in {"bold": [FONT_BOLD], "semi": [FONT_SEMI], "reg": [FONT_REG]}[kind]:
        if os.path.exists(p):
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()


def tile(mark, size, bg, pad=0.80):
    """Rounded graphite/emerald tile with the mark inside (for the favicon)."""
    SS = 4
    S = size * SS
    base = Image.new("RGBA", (S, S), bg + (255,))
    m = fit(mark, int(S * pad))
    if m.height > S * 0.6:
        m = fit(mark, int(mark.width * (S * 0.6) / mark.height))
    canvas = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    canvas.paste(m, ((S - m.width) // 2, (S - m.height) // 2), m)
    out = Image.alpha_composite(base, canvas)
    mask = Image.new("L", (S, S), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, S - 1, S - 1], radius=int(0.225 * S), fill=255)
    out.putalpha(ImageChops.multiply(out.getchannel("A"), mask))
    return out.resize((size, size), Image.LANCZOS)


def main() -> None:
    os.makedirs(PREVIEW_DIR, exist_ok=True)
    a = load_alpha()
    print("glyph:", a.size)

    STYLES = [
        ("solid graphite (flat, theme)", solid(GRAPHITE, a), GRAPHITE, "none"),
        ("line graphite (outline 9px)", line(GRAPHITE, a, 9), GRAPHITE, "none"),
        ("line graphite (outline 6px)", line(GRAPHITE, a, 6), GRAPHITE, "none"),
        ("solid emerald", solid(EMERALD, a), EMERALD, "none"),
        ("line emerald (outline 9px)", line(EMERALD, a, 9), EMERALD, "none"),
        ("solid green (own colour)", solid(GREEN, a), GREEN, "none"),
    ]

    row_h = 150
    W = 1080
    sheet = Image.new("RGB", (W, 60 + row_h * len(STYLES)), CREAM)
    d = ImageDraw.Draw(sheet)
    d.text((40, 22), "Header mark treatments for your logo — on the site's cream", font=font("bold", 26), fill=INK)
    d.text((40, 54), "first logo's design = flat / line-drawn, in the theme colour, no box", font=font("reg", 18), fill=INK_MUTED)

    for i, (name, mark, colour, _) in enumerate(STYLES):
        y = 96 + i * row_h
        # 1) big, to see the shape
        big = fit(mark, 104)
        sheet.paste(big, (40, y + 8), big)
        # 2) real header lockup: mark 28px + wordmark, on cream
        lock_x = 200
        small = fit(mark, 28)
        sheet.paste(small, (lock_x, y + 46), small)
        d.text((lock_x + 38, y + 47), "Dukhata", font=font("semi", 24), fill=INK)
        # 3) 56px
        med = fit(mark, 56)
        sheet.paste(med, (lock_x + 170, y + 32), med)
        # 4) favicon treatment (mark on a graphite tile, 48px)
        ic = tile(mark, 48, GRAPHITE)
        sheet.paste(ic, (lock_x + 260, y + 36), ic)
        ic2 = tile(mark, 48, (28, 25, 23))
        sheet.paste(ic2, (lock_x + 320, y + 36), ic2)
        d.text((lock_x + 392, y + 48), name, font=font("reg", 20), fill=INK_MUTED)
        d.line([(40, y + row_h - 1), (W - 40, y + row_h - 1)], fill=(230, 226, 219))

    out = os.path.join(PREVIEW_DIR, "header-styles.png")
    sheet.save(out, optimize=True)
    print("preview:", out)

    # also: how the solid-graphite mark looks as a favicon at real sizes
    for nm, mark in [("solid", solid(GRAPHITE, a)), ("line9", line(GRAPHITE, a, 9))]:
        strip = Image.new("RGB", (300, 90), CREAM)
        ds = ImageDraw.Draw(strip)
        x = 20
        for s in (16, 24, 32, 48, 64):
            m = fit(mark, s)
            strip.paste(m, (x, 30 + (64 - s) // 2), m)
            x += s + 14
        ds.text((20, 6), f"{nm} mark at 16/24/32/48/64px", font=font("reg", 16), fill=INK_MUTED)
        strip.save(os.path.join(PREVIEW_DIR, f"mark-sizes-{nm}.png"), optimize=True)
        print("preview:", os.path.join(PREVIEW_DIR, f"mark-sizes-{nm}.png"))


if __name__ == "__main__":
    main()
