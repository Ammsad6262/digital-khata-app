#!/usr/bin/env python3
"""
Dukhata brand generator.

Builds the ENTIRE icon / logo / social system from the owner's logo
(`public/logo.png`) and the app's real theme (warm graphite + cream + emerald,
read from `src/app/globals.css`).

Why this exists: the owner's artwork is a bright spring-green mark on a flat
BLACK tile, and the mark only fills ~55% x 33% of that canvas. Dropped straight
onto the site's cream background it read as a harsh black box with a neon band
inside — the thing the owner called "bad". This rebuilds the mark properly:

  * trims the mark to its true bounds,
  * re-colours it where needed so it works on light and dark,
  * seats it in a rounded, gradient, softly-lit tile that matches the theme,
  * and emits every size plus a matching 1200x630 social card.

Run from the repo root:   python scripts/generate_icons.py
Optional preview sheet:   set BRAND_PREVIEW_DIR to a folder (default .brand-preview)
Requires Pillow.
"""

from __future__ import annotations

import os
from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, ".."))
OUT = os.path.join(ROOT, "public")
SOURCE = os.path.join(OUT, "logo.png")
PREVIEW_DIR = os.environ.get(
    "BRAND_PREVIEW_DIR", os.path.join(ROOT, ".brand-preview")
)

SS = 4  # supersample factor — everything is drawn big, then downscaled once

# --- theme, sampled from src/app/globals.css -------------------------------
GRAPHITE_TOP = (54, 49, 45)  # warm graphite highlight
GRAPHITE_BOT = (20, 17, 15)  # warm graphite shadow
EMERALD_TOP = (16, 185, 129)  # #10B981  (theme success family)
EMERALD_BOT = (4, 120, 87)  # #047857
MARK_GREEN = (162, 252, 138)  # the owner mark's own green
CREAM = (250, 248, 244)  # --bg
CREAM_2 = (243, 239, 232)
INK = (28, 25, 23)  # --ink
INK_MUTED = (120, 113, 105)  # --brand-500
INK_SUBTLE = (150, 143, 134)
ACCENT = (249, 115, 22)  # --accent-500

FONTS = {
    "bold": ["C:/Windows/Fonts/segoeuib.ttf", "C:/Windows/Fonts/arialbd.ttf"],
    "semi": ["C:/Windows/Fonts/seguisb.ttf", "C:/Windows/Fonts/segoeuib.ttf"],
    "reg": ["C:/Windows/Fonts/segoeui.ttf", "C:/Windows/Fonts/arial.ttf"],
}

GLYPH_THRESHOLD = 45


# --------------------------------------------------------------------------
# mark extraction
# --------------------------------------------------------------------------
def load_mark() -> Image.Image:
    """Trim the owner's logo to the mark's real bounds, as an RGBA glyph.

    Alpha comes from the green channel (the background is pure black, so 0),
    which keeps the anti-aliased edges smooth. Colour is left as-is; use
    `recolour` to paint it.
    """
    logo = Image.open(SOURCE).convert("RGBA")
    lum = logo.convert("L")
    box = lum.point(lambda v: 255 if v > GLYPH_THRESHOLD else 0).getbbox()
    if not box:
        raise SystemExit("logo.png appears to be blank")
    glyph = logo.crop(box)
    alpha = glyph.getchannel("G")  # 0 on black bg, up to 255 on the mark
    glyph.putalpha(alpha)
    return glyph


def recolour(glyph: Image.Image, colour: tuple[int, int, int]) -> Image.Image:
    """Return a copy of the glyph painted a single colour (keeps its alpha)."""
    out = Image.new("RGBA", glyph.size, colour + (0,))
    out.putalpha(glyph.getchannel("A"))
    return out


# --------------------------------------------------------------------------
# gradients / masks
# --------------------------------------------------------------------------
def vgrad(size: int, top: tuple, bottom: tuple) -> Image.Image:
    base = Image.new("RGB", (1, size))
    px = base.load()
    for y in range(size):
        t = y / max(1, size - 1)
        px[0, y] = tuple(round(top[i] + (bottom[i] - top[i]) * t) for i in range(3))
    return base.resize((size, size), Image.BILINEAR)


def vgrad_a(size: int, a_top: int, a_bot: int, stop: float = 1.0) -> Image.Image:
    """Vertical ALPHA ramp (L mode) from a_top at the top to a_bot at `stop`."""
    base = Image.new("L", (1, size))
    px = base.load()
    for y in range(size):
        t = min(1.0, (y / max(1, size - 1)) / stop)
        px[0, y] = round(a_top + (a_bot - a_top) * t)
    return base.resize((size, size), Image.BILINEAR)


def radial(size: int, cx: float, cy: float, r: float, peak: float,
           tight: float = 1.6) -> Image.Image:
    """Soft radial falloff (L mode), drawn small then blurred and scaled up."""
    small = 160
    m = Image.new("L", (small, small), 0)
    d = ImageDraw.Draw(m)
    sx, sy, sr = cx / size * small, cy / size * small, r / size * small
    steps = 40
    for i in range(steps, 0, -1):
        a = int(peak * (1 - i / steps) ** tight)
        rr = sr * i / steps
        d.ellipse([sx - rr, sy - rr, sx + rr, sy + rr], fill=a)
    m = m.filter(ImageFilter.GaussianBlur(small * 0.05))
    return m.resize((size, size), Image.LANCZOS)


def squircle(size: int, radius: float) -> Image.Image:
    m = Image.new("L", (size, size), 0)
    d = ImageDraw.Draw(m)
    d.rounded_rectangle(
        [0, 0, size - 1, size - 1], radius=int(radius * size), fill=255
    )
    return m


# --------------------------------------------------------------------------
# the tile
# --------------------------------------------------------------------------
def build_tile(
    S: int,
    *,
    bg_top: tuple,
    bg_bot: tuple,
    mark_colour: tuple,
    glow_colour: tuple,
    fill: float,
    accent: bool = False,
) -> Image.Image:
    """A rounded, gradient, softly-lit tile with the mark centred.

    `S` is the supersampled square size. Returns RGBA with the squircle baked
    in (transparent outside), so it sits on any background.
    """
    glyph = load_mark()
    mark = recolour(glyph, mark_colour)

    tile = vgrad(S, bg_top, bg_bot).convert("RGBA")

    # ambient glow behind the mark
    layer = Image.new("RGBA", (S, S), glow_colour + (0,))
    layer.putalpha(
        radial(S, S * 0.5, S * 0.54, S * 0.60, 78 if accent else 60)
    )
    tile = Image.alpha_composite(tile, layer)

    if accent:
        # a warm ember low in the tile, for depth
        ember = Image.new("RGBA", (S, S), ACCENT + (0,))
        ember.putalpha(radial(S, S * 0.22, S * 0.92, S * 0.55, 60))
        tile = Image.alpha_composite(tile, ember)

    # fit the mark
    tw = max(1, round(S * fill))
    th = max(1, round(mark.height * tw / mark.width))
    if th > S * 0.72:
        th = round(S * 0.72)
        tw = round(mark.width * th / mark.height)
    m2 = mark.resize((tw, th), Image.LANCZOS)
    canvas = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    ox, oy = (S - tw) // 2, (S - th) // 2
    canvas.paste(m2, (ox, oy), m2)

    # mark glow
    ga = canvas.getchannel("A").filter(ImageFilter.GaussianBlur(S * 0.022))
    gl = Image.new("RGBA", (S, S), glow_colour + (0,))
    gl.putalpha(ga.point(lambda v: int(v * 0.8)))
    tile = Image.alpha_composite(tile, gl)
    tile = Image.alpha_composite(tile, canvas)

    # top sheen + inner rim for the "3D" lift
    sheen = Image.new("RGBA", (S, S), (255, 255, 255, 0))
    sheen.putalpha(vgrad_a(S, 30, 0, stop=0.46))
    tile = Image.alpha_composite(tile, sheen)

    rim = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    rd = ImageDraw.Draw(rim)
    rd.rounded_rectangle(
        [1, 1, S - 2, S - 2],
        radius=int(0.225 * S) - 2,
        outline=(255, 255, 255, 26),
        width=max(1, int(S * 0.005)),
    )
    tile = Image.alpha_composite(tile, rim)

    # cut the squircle
    mask = squircle(S, 0.225)
    alpha = ImageChops.multiply(tile.getchannel("A"), mask)
    tile.putalpha(alpha)
    return tile


# --------------------------------------------------------------------------
# variants
# --------------------------------------------------------------------------
def variant(name: str, S: int) -> Image.Image:
    if name == "graphite":
        return build_tile(
            S,
            bg_top=GRAPHITE_TOP,
            bg_bot=GRAPHITE_BOT,
            mark_colour=MARK_GREEN,
            glow_colour=(150, 245, 130),
            fill=0.70,
        )
    if name == "graphite-ember":
        return build_tile(
            S,
            bg_top=GRAPHITE_TOP,
            bg_bot=GRAPHITE_BOT,
            mark_colour=MARK_GREEN,
            glow_colour=(150, 245, 130),
            fill=0.70,
            accent=True,
        )
    if name == "emerald":
        return build_tile(
            S,
            bg_top=EMERALD_TOP,
            bg_bot=EMERALD_BOT,
            mark_colour=(255, 255, 255),
            glow_colour=(255, 255, 255),
            fill=0.70,
        )
    if name == "paper":
        return build_tile(
            S,
            bg_top=(255, 255, 255),
            bg_bot=CREAM_2,
            mark_colour=EMERALD_BOT,
            glow_colour=(16, 185, 129),
            fill=0.70,
        )
    raise SystemExit(f"unknown variant {name}")


DEFAULT_VARIANT = "graphite"
ALL_VARIANTS = ["graphite", "graphite-ember", "emerald", "paper"]


def icon_bytes(variant_name: str, size: int, fill: float = 0.70) -> bytes:
    """Render one squircle icon at `size` and return PNG bytes."""
    import io

    S = size * SS
    img = variant(variant_name, S)
    img = img.resize((size, size), Image.LANCZOS)
    buf = io.BytesIO()
    img.save(buf, format="PNG", optimize=True)
    return buf.getvalue()


def save_icons(variant_name: str) -> None:
    for size in (48, 96, 144, 192, 512):
        with open(os.path.join(OUT, f"icon-{size}.png"), "wb") as fh:
            fh.write(icon_bytes(variant_name, size))
        print(f"icon-{size}.png")

    with open(os.path.join(OUT, "icon.png"), "wb") as fh:
        fh.write(icon_bytes(variant_name, 512))
    with open(os.path.join(OUT, "favicon.png"), "wb") as fh:
        fh.write(icon_bytes(variant_name, 64))
    with open(os.path.join(OUT, "apple-icon.png"), "wb") as fh:
        fh.write(icon_bytes(variant_name, 180))

    # maskable: keep the mark inside Android's safe zone
    S = 512 * SS
    mask_img = build_tile(
        S,
        bg_top=GRAPHITE_TOP if variant_name != "emerald" else EMERALD_TOP,
        bg_bot=GRAPHITE_BOT if variant_name != "emerald" else EMERALD_BOT,
        mark_colour=MARK_GREEN if variant_name != "emerald" else (255, 255, 255),
        glow_colour=(150, 245, 130) if variant_name != "emerald" else (255, 255, 255),
        fill=0.46,
    ).resize((512, 512), Image.LANCZOS)
    mask_img.save(os.path.join(OUT, "icon-maskable-512.png"), optimize=True)
    print("icon.png, favicon.png, apple-icon.png, icon-maskable-512.png")

    # multi-size .ico
    ico = variant(variant_name, 48 * SS).resize((48, 48), Image.LANCZOS)
    ico.save(
        os.path.join(OUT, "favicon.ico"),
        format="ICO",
        sizes=[(16, 16), (32, 32), (48, 48)],
    )
    print("favicon.ico")


def save_header_mark(variant_name: str) -> None:
    """The header/footer lockup tile — same squircle as the favicon."""
    img = variant(variant_name, 256 * SS).resize((256, 256), Image.LANCZOS)
    img.save(os.path.join(OUT, "logo-mark.png"), optimize=True)
    print("logo-mark.png (header/footer tile)")


# --------------------------------------------------------------------------
# social card
# --------------------------------------------------------------------------
def font(kind: str, size: int) -> ImageFont.FreeTypeFont:
    for path in FONTS[kind]:
        if os.path.exists(path):
            return ImageFont.truetype(path, size)
    return ImageFont.load_default()


def social_card(variant_name: str) -> None:
    W, H = 1200, 630
    card = Image.new("RGB", (W, H), CREAM)
    d = ImageDraw.Draw(card)

    # soft warm wash + a cool emerald breath, both very low contrast
    side = max(W, H)
    wash = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    wash.putalpha(
        radial(side, W * 0.78, H * 0.10, W * 0.72, 46).resize((W, H), Image.LANCZOS)
    )
    card_rgba = Image.alpha_composite(card.convert("RGBA"), wash)
    breath = Image.new("RGBA", (W, H), (16, 185, 129, 0))
    breath.putalpha(radial(max(W, H), W * 0.08, H * 1.05, W * 0.5, 40).resize((W, H), Image.LANCZOS))
    card_rgba = Image.alpha_composite(card_rgba, breath)
    card = card_rgba.convert("RGB")
    d = ImageDraw.Draw(card)

    # floating tile with a soft, grounded shadow
    tile_size = 268
    tx, ty = 118, (H - tile_size) // 2
    tile = variant(variant_name, tile_size * 2).resize((tile_size, tile_size), Image.LANCZOS)

    shadow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    sd = ImageDraw.Draw(shadow)
    sd.rounded_rectangle(
        [tx + 6, ty + 22, tx + tile_size - 6, ty + tile_size + 22],
        radius=int(tile_size * 0.225),
        fill=(28, 25, 23, 70),
    )
    shadow = shadow.filter(ImageFilter.GaussianBlur(26))
    card = Image.alpha_composite(card.convert("RGBA"), shadow)
    card.paste(tile, (tx, ty), tile)

    x = tx + tile_size + 74
    d = ImageDraw.Draw(card)
    d.text((x, 150), "Dukhata", font=font("bold", 104), fill=INK)
    d.text((x, 292), "The digital khata for Pakistani shops", font=font("semi", 37), fill=INK_MUTED)
    d.text((x, 348), "Record a sale by speaking. Udhaar and balances stay correct.",
           font=font("reg", 27), fill=INK_SUBTLE)
    d.rounded_rectangle([x, 430, x + 104, 438], radius=4, fill=ACCENT)
    d.text((x, 462), "Free 14-day trial  ·  dukhata.com", font=font("semi", 31), fill=INK)

    card.convert("RGB").save(os.path.join(OUT, "opengraph-image.png"), optimize=True)
    print("opengraph-image.png (1200x630)")


# --------------------------------------------------------------------------
# contact sheet for human review
# --------------------------------------------------------------------------
def contact_sheet() -> None:
    os.makedirs(PREVIEW_DIR, exist_ok=True)
    pad, cell = 40, 300
    W = pad + len(ALL_VARIANTS) * (cell + pad)
    H = 520
    sheet = Image.new("RGB", (W, H), (238, 234, 227))
    d = ImageDraw.Draw(sheet)
    d.text((pad, 32), "Dukhata icon variants — pick one",
           font=font("bold", 30), fill=INK)
    for i, name in enumerate(ALL_VARIANTS):
        cx = pad + i * (cell + pad)
        cy = 110
        img = variant(name, cell * 2).resize((cell, cell), Image.LANCZOS)
        sheet.paste(img, (cx, cy), img)
        d.text((cx, cy + cell + 18), name, font=font("semi", 26), fill=INK)
    sheet.save(os.path.join(PREVIEW_DIR, "icon-variants.png"), optimize=True)
    print(f"preview: {os.path.join(PREVIEW_DIR, 'icon-variants.png')}")

    # header lockup simulation on the site's cream, at real size (28px) and 2x
    sim = Image.new("RGB", (760, 260), CREAM)
    ds = ImageDraw.Draw(sim)
    ds.text((28, 20), "Header lockup, on the site's cream background",
            font=font("semi", 22), fill=INK_MUTED)
    for i, name in enumerate(ALL_VARIANTS):
        bx = 28
        by = 70 + i * 46
        small = variant(name, 28 * 4).resize((28, 28), Image.LANCZOS)
        sim.paste(small, (bx, by), small)
        big = variant(name, 56 * 2).resize((56, 56), Image.LANCZOS)
        sim.paste(big, (bx + 46, by - 14), big)
        ds.text((bx + 118, by + 4), f"{name}  (28px and 56px)",
                font=font("reg", 22), fill=INK)
    sim.save(os.path.join(PREVIEW_DIR, "header-lockup.png"), optimize=True)
    print(f"preview: {os.path.join(PREVIEW_DIR, 'header-lockup.png')}")


def main() -> None:
    print(f"source mark: {Image.open(SOURCE).size}")
    save_icons(DEFAULT_VARIANT)
    save_header_mark(DEFAULT_VARIANT)
    social_card(DEFAULT_VARIANT)
    contact_sheet()
    print(f"\ndone. live variant = {DEFAULT_VARIANT}")


if __name__ == "__main__":
    main()
