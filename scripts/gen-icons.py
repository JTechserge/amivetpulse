#!/usr/bin/env python3
"""Generate PWA icons, maskable icons, apple-touch-icon and iOS splash screens for Amivet Pulse RH."""
import math
import os
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ICONS_DIR = os.path.join(ROOT, "icons")
SPLASH_DIR = os.path.join(ICONS_DIR, "splash")

TEAL = (15, 118, 110, 255)      # #0F766E
SPLASH_BG = (240, 253, 249, 255)  # #F0FDF9
WHITE = (255, 255, 255, 255)
ACCENT = (240, 253, 249, 255)   # light accent on teal for the cross

FONT_BOLD = "/System/Library/Fonts/Supplemental/Arial Bold.ttf"


def draw_vet_cross(draw, cx, cy, size, color):
    """Draw a simple veterinary cross (plus sign) accent, rotated 45deg feel via rounded rect cross."""
    arm = size * 0.32
    thick = size * 0.13
    # horizontal bar
    draw.rounded_rectangle(
        [cx - arm, cy - thick, cx + arm, cy + thick], radius=thick * 0.5, fill=color
    )
    # vertical bar
    draw.rounded_rectangle(
        [cx - thick, cy - arm, cx + thick, cy + arm], radius=thick * 0.5, fill=color
    )


def make_icon(path, size, maskable=False, background_only_apple=False):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    if maskable:
        # Maskable: fill the FULL canvas with background color (no transparency, no rounding)
        # and keep the visual glyph inside the central 80% safe zone.
        draw.rectangle([0, 0, size, size], fill=TEAL)
        safe = size * 0.8
        content_scale = safe / size
    else:
        # Regular icon: rounded-square background (browsers/OS apply their own mask on top)
        radius = size * 0.22
        draw.rounded_rectangle([0, 0, size, size], radius=radius, fill=TEAL)
        content_scale = 0.86

    # Letter "A" centered
    font_size = int(size * content_scale * 0.62)
    font = ImageFont.truetype(FONT_BOLD, font_size)
    text = "A"
    bbox = draw.textbbox((0, 0), text, font=font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    tx = size / 2 - tw / 2 - bbox[0]
    ty = size / 2 - th / 2 - bbox[1] - size * 0.06
    draw.text((tx, ty), text, font=font, fill=WHITE)

    # Small vet cross accent, bottom-right of the letter, inside safe zone
    cross_cy = size / 2 + size * content_scale * 0.30
    cross_cx = size / 2
    draw_vet_cross(draw, cross_cx, cross_cy, size * content_scale * 0.30, ACCENT)

    img.save(path, "PNG")
    print(f"wrote {path} ({size}x{size}{' maskable' if maskable else ''})")


def make_apple_touch_icon(path, size=180):
    # iOS applies its own rounding — deliver an opaque square, no transparency.
    img = Image.new("RGB", (size, size), TEAL[:3])
    draw = ImageDraw.Draw(img)
    font = ImageFont.truetype(FONT_BOLD, int(size * 0.56))
    text = "A"
    bbox = draw.textbbox((0, 0), text, font=font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    tx = size / 2 - tw / 2 - bbox[0]
    ty = size / 2 - th / 2 - bbox[1] - size * 0.06
    draw.text((tx, ty), text, font=font, fill=WHITE[:3])
    draw_vet_cross(draw, size / 2, size / 2 + size * 0.28, size * 0.26, ACCENT[:3])
    img.save(path, "PNG")
    print(f"wrote {path} ({size}x{size})")


def make_splash(path, width, height):
    img = Image.new("RGB", (width, height), SPLASH_BG[:3])
    draw = ImageDraw.Draw(img)

    logo_size = int(min(width, height) * 0.32)
    cx, cy = width // 2, height // 2

    # Teal rounded-square logo mark, centered
    radius = logo_size * 0.22
    draw.rounded_rectangle(
        [cx - logo_size / 2, cy - logo_size / 2, cx + logo_size / 2, cy + logo_size / 2],
        radius=radius,
        fill=TEAL[:3],
    )
    font = ImageFont.truetype(FONT_BOLD, int(logo_size * 0.54))
    text = "A"
    bbox = draw.textbbox((0, 0), text, font=font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    tx = cx - tw / 2 - bbox[0]
    ty = cy - th / 2 - bbox[1] - logo_size * 0.05
    draw.text((tx, ty), text, font=font, fill=WHITE[:3])
    draw_vet_cross(draw, cx, cy + logo_size * 0.27, logo_size * 0.26, ACCENT[:3])

    # App name below the mark
    name_font = ImageFont.truetype(FONT_BOLD, int(logo_size * 0.22))
    name = "Amivet Pulse RH"
    bbox2 = draw.textbbox((0, 0), name, font=name_font)
    nw = bbox2[2] - bbox2[0]
    draw.text((cx - nw / 2 - bbox2[0], cy + logo_size * 0.75), name, font=name_font, fill=TEAL[:3])

    img.save(path, "PNG")
    print(f"wrote {path} ({width}x{height})")


def main():
    os.makedirs(ICONS_DIR, exist_ok=True)
    os.makedirs(SPLASH_DIR, exist_ok=True)

    make_icon(os.path.join(ICONS_DIR, "icon-192.png"), 192)
    make_icon(os.path.join(ICONS_DIR, "icon-512.png"), 512)
    make_icon(os.path.join(ICONS_DIR, "icon-maskable-192.png"), 192, maskable=True)
    make_icon(os.path.join(ICONS_DIR, "icon-maskable-512.png"), 512, maskable=True)
    make_apple_touch_icon(os.path.join(ICONS_DIR, "apple-touch-icon.png"), 180)

    # iOS splash screens: (width, height, filename) — portrait orientation
    splashes = [
        (1170, 2532, "splash-1170x2532.png"),  # iPhone 13/14/15
        (1284, 2778, "splash-1284x2778.png"),  # iPhone Pro Max
        (1125, 2436, "splash-1125x2436.png"),  # iPhone X/XS/11 Pro
        (1242, 2688, "splash-1242x2688.png"),  # iPhone XS Max/11 Pro Max
        (828, 1792, "splash-828x1792.png"),    # iPhone XR/11
        (2048, 2732, "splash-2048x2732.png"),  # iPad Pro 12.9"
    ]
    for w, h, name in splashes:
        make_splash(os.path.join(SPLASH_DIR, name), w, h)


if __name__ == "__main__":
    main()
