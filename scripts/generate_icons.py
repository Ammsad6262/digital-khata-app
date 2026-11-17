#!/usr/bin/env python3
"""
Generate Dukhata's icon set and social image from the ledger mark.

Why this exists: the previous favicon was a small mark inside a large black
square, which renders as an unreadable smudge at the 16-32px size a browser tab
or a Google result uses, and there was no /favicon.ico at all (Google's
fallback). These are generated at 4x and downsampled so edges stay clean, with a
full-bleed background and a bold mark that survives 16px.

Run from the repository root:
    python scripts/generate_icons.py
Requires Pillow (already used by the project's tooling).
"""

from PIL import Image, ImageDraw, ImageFont
import os

EMERALD = (5, 150, 105, 255)      # brand-600 (emerald theme)
CREAM = (250, 248, 244, 255)      # app background "paper"
INK = (41, 37, 36, 255)           # brand-700 (ink theme)
WHITE = (255, 255, 255, 255)

OUT = os.path.join(os.path.dirname(__file__), "..", "public")
SUPERSAMPLE = 4


def draw_mark(size: int, bg=EMERALD, fg=WHITE, maskable: bool = False) -> Image.Image:
    """Square icon: rounded background + ledger mark, drawn at 4x then shrunk."""
    w = size * SUPERSAMPLE
    img = Image.new("RGBA", (w, w), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    if maskable:
        # Full bleed: the platform applies its own mask.
        d.rectangle([0, 0, w, w], fill=bg)
    else:
        d.rounded_rectangle([0, 0, w - 1, w - 1], radius=int(w * 0.22), fill=bg)

    k = w / 512.0  # design space is 512

    def xy(x, y):
        return (x * k, y * k)

    def lw(v):
        return max(1, int(round(v * k)))

    # Book cover
    d.rounded_rectangle(
        [120 * k, 96 * k, 392 * k, 416 * k],
        radius=int(36 * k),
        outline=fg,
        width=lw(26),
    )
    # Spine
    d.line([xy(196, 96), xy(196, 416)], fill=fg, width=lw(26))
    # Ruled ledger lines
    d.line([xy(238, 188), xy(352, 188)], fill=fg, width=lw(22))
    d.line([xy(238, 250), xy(352, 250)], fill=fg, width=lw(22))
    # Ticked entry
    d.line([xy(232, 330), xy(268, 366), xy(348, 272)], fill=fg, width=lw(32), joint="curve")

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


def make_social_card() -> Image.Image:
    """1200x630 Open Graph / Twitter card."""
    W, H = 1200, 630
    img = Image.new("RGB", (W, H), CREAM)
    d = ImageDraw.Draw(img)

    # Thin emerald rule along the top for a little identity.
    d.rectangle([0, 0, W, 10], fill=EMERALD)

    icon = draw_mark(180)
    img.paste(icon, (90, 225), icon)

    title_font = load_font(True, 92)
    body_font = load_font(False, 38)
    small_font = load_font(False, 28)

    d.text((310, 214), "Dukhata", font=title_font, fill=INK)
    d.text((312, 330), "Digital khata for Pakistani shops", font=body_font, fill=(87, 83, 78))
    d.text((312, 392), "Record a sale by speaking. Balances stay correct.", font=small_font, fill=(102, 96, 92))
    d.text((312, 470), "Free 14-day trial  ·  dukhata.com", font=small_font, fill=EMERALD)

    return img


def main() -> None:
    os.makedirs(OUT, exist_ok=True)

    # Google asks for a favicon that is a multiple of 48px; browsers use 16-32.
    for size in (48, 96, 144, 192, 512):
        draw_mark(size).save(os.path.join(OUT, f"icon-{size}.png"))
        print(f"icon-{size}.png")

    # Compatibility names the app's metadata already used.
    draw_mark(512).save(os.path.join(OUT, "icon.png"))
    draw_mark(64).save(os.path.join(OUT, "favicon.png"))
    draw_mark(180).save(os.path.join(OUT, "apple-icon.png"))
    print("icon.png, favicon.png, apple-icon.png")

    # /favicon.ico — the fallback Google and old browsers request directly.
    ico_sizes = [(16, 16), (32, 32), (48, 48)]
    draw_mark(48).save(os.path.join(OUT, "favicon.ico"), format="ICO", sizes=ico_sizes)
    print("favicon.ico")

    # Maskable variant (safe zone: content within the inner 80%).
    draw_mark(512, maskable=True).save(os.path.join(OUT, "icon-maskable-512.png"))
    print("icon-maskable-512.png")

    make_social_card().save(os.path.join(OUT, "opengraph-image.png"), optimize=True)
    print("opengraph-image.png (1200x630)")


if __name__ == "__main__":
    main()