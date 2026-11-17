#!/usr/bin/env python3
"""
Generate Dukhata's icon set, header mark and social card FROM THE OWNER'S LOGO.

Source of truth: `public/logo.png` (the owner's artwork — a light mark on a black
tile). The original issue was that the mark occupies only ~55% x 33% of that
canvas, so scaling the file as-is produced an almost-empty square at 16-32px.

This script trims to the mark's actual bounds, then re-pads it against a black
background so the glyph fills the frame at every size.

Run from the repository root:
    python scripts/generate_icons.py
Requires Pillow.
"""

from PIL import Image, ImageDraw, ImageFont
import os

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.normpath(os.path.join(HERE, "..", "public"))
SOURCE = os.path.join(OUT, "logo.png")

BLACK = (0, 0, 0, 255)
WHITE = (255, 255, 255, 255)
GREY = (170, 170, 170, 255)
# The green used by the mark itself, sampled from the artwork.
ACCENT = (144, 240, 120, 255)
SUPERSAMPLE = 4
GLYPH_THRESHOLD = 45  # luminance above which a pixel belongs to the mark


def load_mark() -> Image.Image:
    """Trim the owner's logo to the mark's real bounds (keeps colour + alpha)."""
    logo = Image.open(SOURCE).convert("RGBA")
    mask = logo.convert("L").point(lambda v: 255 if v > GLYPH_THRESHOLD else 0)
    box = mask.getbbox()
    if not box:
        raise SystemExit("logo.png appears to be blank")
    return logo.crop(box)


def icon(size: int, mark: Image.Image, fill: float = 0.88, maskable: bool = False) -> Image.Image:
    """Black square with the mark centred, sized to `fill` of the width."""
    w = size * SUPERSAMPLE
    img = Image.new("RGBA", (w, w), BLACK)
    scale = (w * (0.66 if maskable else fill)) / mark.width
    if mark.height * scale > w * 0.92:
        scale = (w * 0.92) / mark.height
    resized = mark.resize(
        (max(1, round(mark.width * scale)), max(1, round(mark.height * scale))),
        Image.LANCZOS,
    )
    img.paste(resized, ((w - resized.width) // 2, (w - resized.height) // 2), resized)
    return img.resize((size, size), Image.LANCZOS)


def load_font(bold: bool, size: int) -> ImageFont.FreeTypeFont:
    candidates = (
        ["C:/Windows/Fonts/segoeuib.ttf", "C:/Windows/Fonts/arialbd.ttf"]
        if bold
        else ["C:/Windows/Fonts/segoeui.ttf", "C:/Windows/Fonts/arial.ttf"]
    )
    for path in candidates:
        if os.path.exists(path):
            return ImageFont.truetype(path, size)
    return ImageFont.load_default()


def header_mark(mark: Image.Image) -> Image.Image:
    """Wide tile for the site header: the mark gets room without being squashed."""
    W, H = 336, 200
    img = Image.new("RGBA", (W, H), BLACK)
    scale = (W * 0.88) / mark.width
    resized = mark.resize(
        (max(1, round(mark.width * scale)), max(1, round(mark.height * scale))),
        Image.LANCZOS,
    )
    img.paste(resized, ((W - resized.width) // 2, (H - resized.height) // 2), resized)
    return img


def social_card(mark: Image.Image) -> Image.Image:
    """1200x630 Open Graph / Twitter card on the brand's black."""
    W, H = 1200, 630
    img = Image.new("RGB", (W, H), BLACK[:3])
    d = ImageDraw.Draw(img)

    tile = icon(200, mark)
    img.paste(tile, (90, 215), tile)

    d.text((330, 214), "Dukhata", font=load_font(True, 92), fill=WHITE[:3])
    d.text((332, 330), "Digital khata for Pakistani shops", font=load_font(False, 38), fill=GREY[:3])
    d.text((332, 392), "Record a sale by speaking. Balances stay correct.", font=load_font(False, 28), fill=GREY[:3])
    d.text((332, 470), "Free 14-day trial  ·  dukhata.com", font=load_font(False, 28), fill=ACCENT[:3])
    return img


def main() -> None:
    mark = load_mark()
    print(f"mark trimmed to {mark.size[0]}x{mark.size[1]}")

    for size in (48, 96, 144, 192, 512):
        icon(size, mark).save(os.path.join(OUT, f"icon-{size}.png"))
        print(f"icon-{size}.png")

    icon(512, mark).save(os.path.join(OUT, "icon.png"))
    icon(64, mark).save(os.path.join(OUT, "favicon.png"))
    icon(180, mark).save(os.path.join(OUT, "apple-icon.png"))
    icon(512, mark, maskable=True).save(os.path.join(OUT, "icon-maskable-512.png"))
    print("icon.png, favicon.png, apple-icon.png, icon-maskable-512.png")

    icon(48, mark).save(os.path.join(OUT, "favicon.ico"), format="ICO", sizes=[(16, 16), (32, 32), (48, 48)])
    print("favicon.ico")

    header_mark(mark).save(os.path.join(OUT, "logo-mark.png"))
    print("logo-mark.png (header/footer tile)")

    social_card(mark).save(os.path.join(OUT, "opengraph-image.png"), optimize=True)
    print("opengraph-image.png (1200x630)")


if __name__ == "__main__":
    main()