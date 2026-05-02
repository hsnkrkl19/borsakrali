"""
Premium Borsa Krali Icon Generator
Generates 1024x1024 master icon, then resizes for all Android mipmap densities.
Theme: Royal gold gradient + 'BK' monogram + crown accent + bull silhouette.
"""

from PIL import Image, ImageDraw, ImageFilter, ImageFont
import os
import math

OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "..", "android", "app", "src", "main", "res")
MASTER_PATH = os.path.join(os.path.dirname(__file__), "..", "public", "icon-master.png")

SIZE = 1024


def make_gold_gradient_circle(size):
    """Create a circular gold gradient background."""
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Background dark navy
    bg = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    bg_draw = ImageDraw.Draw(bg)

    # Outer ring: dark navy
    bg_draw.ellipse([0, 0, size, size], fill=(10, 12, 28, 255))

    # Inner gold radial gradient (simulated by concentric circles)
    cx, cy = size / 2, size / 2
    max_r = size / 2

    for i in range(int(max_r), 0, -2):
        ratio = i / max_r
        # Gold: from #FFC56B (outer) to #B8860B (inner) to #6B4F00 (deep)
        if ratio > 0.85:
            # Outer ring - dark gold edge
            r, g, b = 184, 134, 11
        elif ratio > 0.5:
            # Mid - bright gold
            t = (ratio - 0.5) / 0.35
            r = int(255 - 71 * t)
            g = int(197 - 63 * t)
            b = int(107 - 96 * t)
        else:
            # Center - rich amber
            t = ratio / 0.5
            r = int(255)
            g = int(180 + 17 * t)
            b = int(60 + 47 * t)
        bg_draw.ellipse(
            [cx - i, cy - i, cx + i, cy + i],
            fill=(r, g, b, 255),
        )

    return bg


def add_inner_dark(img, size):
    """Add inner dark navy disc to make text pop."""
    draw = ImageDraw.Draw(img)
    inset = int(size * 0.10)
    # Inner ring
    draw.ellipse(
        [inset, inset, size - inset, size - inset],
        fill=(15, 20, 40, 255),
    )

    # Subtle inner gold glow ring
    glow_inset = inset + 8
    draw.ellipse(
        [glow_inset, glow_inset, size - glow_inset, size - glow_inset],
        outline=(255, 200, 80, 180),
        width=4,
    )
    return img


def draw_bk_monogram(img, size):
    """Draw stylized BK monogram in gold."""
    draw = ImageDraw.Draw(img)

    # Try to find a good bold font
    font_paths = [
        "C:/Windows/Fonts/arialbd.ttf",
        "C:/Windows/Fonts/segoeuib.ttf",
        "C:/Windows/Fonts/calibrib.ttf",
    ]
    font = None
    for fp in font_paths:
        if os.path.exists(fp):
            font = ImageFont.truetype(fp, int(size * 0.42))
            break

    if font is None:
        font = ImageFont.load_default()

    text = "BK"

    # Get text bounding box
    bbox = draw.textbbox((0, 0), text, font=font)
    tw = bbox[2] - bbox[0]
    th = bbox[3] - bbox[1]

    cx = size // 2
    cy = size // 2

    tx = cx - tw // 2 - bbox[0]
    ty = cy - th // 2 - bbox[1] - int(size * 0.02)

    # Shadow
    draw.text((tx + 6, ty + 6), text, font=font, fill=(0, 0, 0, 180))
    # Main gold text
    draw.text((tx, ty), text, font=font, fill=(255, 215, 80, 255))
    # Inner highlight
    draw.text((tx - 2, ty - 2), text, font=font, fill=(255, 245, 180, 220))

    return img


def draw_crown(img, size):
    """Draw a small crown above the BK monogram."""
    draw = ImageDraw.Draw(img)
    cx = size // 2
    cy_top = int(size * 0.20)

    # Crown base + 3 spikes
    crown_w = int(size * 0.22)
    crown_h = int(size * 0.10)
    left = cx - crown_w // 2
    right = cx + crown_w // 2

    # Spikes (triangular)
    spike_pts = [
        (left, cy_top + crown_h),
        (left, cy_top + crown_h // 2),
        (left + crown_w // 6, cy_top),
        (left + crown_w // 3, cy_top + crown_h // 3),
        (cx, cy_top - crown_h // 4),
        (right - crown_w // 3, cy_top + crown_h // 3),
        (right - crown_w // 6, cy_top),
        (right, cy_top + crown_h // 2),
        (right, cy_top + crown_h),
    ]
    draw.polygon(spike_pts, fill=(255, 215, 80, 255), outline=(180, 130, 30, 255))

    # Gem dots
    gem_y = cy_top + crown_h // 2 + 4
    gem_size = int(size * 0.012)
    for x_off in [-crown_w // 3, 0, crown_w // 3]:
        draw.ellipse(
            [cx + x_off - gem_size, gem_y - gem_size, cx + x_off + gem_size, gem_y + gem_size],
            fill=(255, 80, 80, 255),
        )

    return img


def draw_chart_arrow(img, size):
    """Draw a small upward arrow / candle accent at bottom."""
    draw = ImageDraw.Draw(img)
    cx = size // 2
    cy_bottom = int(size * 0.78)

    # Three rising bars
    bar_w = int(size * 0.04)
    gap = int(size * 0.018)
    base_y = cy_bottom + int(size * 0.06)

    bars = [
        (cx - bar_w * 2 - gap, base_y, bar_w, int(size * 0.04), (50, 200, 120)),
        (cx - bar_w // 2,       base_y, bar_w, int(size * 0.06), (60, 220, 140)),
        (cx + bar_w + gap,      base_y, bar_w, int(size * 0.085),(80, 240, 160)),
    ]

    for x, y, w, h, color in bars:
        draw.rectangle(
            [x, y - h, x + w, y],
            fill=(*color, 230),
            outline=(255, 255, 255, 90),
            width=1,
        )

    # Up arrow above bars
    arrow_y = base_y - int(size * 0.10)
    arrow_pts = [
        (cx - bar_w * 2, arrow_y + int(size * 0.025)),
        (cx + bar_w + gap + bar_w, arrow_y - int(size * 0.025)),
    ]
    draw.line(arrow_pts, fill=(80, 240, 160, 255), width=int(size * 0.008))

    # Arrow head
    head_x = arrow_pts[1][0]
    head_y = arrow_pts[1][1]
    head_size = int(size * 0.025)
    draw.polygon(
        [
            (head_x, head_y),
            (head_x - head_size, head_y - head_size // 2),
            (head_x - head_size, head_y + head_size + head_size // 2),
        ],
        fill=(80, 240, 160, 255),
    )

    return img


def generate_master():
    img = make_gold_gradient_circle(SIZE)
    img = add_inner_dark(img, SIZE)
    img = draw_crown(img, SIZE)
    img = draw_bk_monogram(img, SIZE)
    img = draw_chart_arrow(img, SIZE)
    img.save(MASTER_PATH)
    print(f"[OK] Master icon: {MASTER_PATH}")
    return img


# Android mipmap densities
DENSITIES = {
    "mdpi": 48,
    "hdpi": 72,
    "xhdpi": 96,
    "xxhdpi": 144,
    "xxxhdpi": 192,
}


def generate_mipmaps(master):
    for density, size in DENSITIES.items():
        out_dir = os.path.join(OUTPUT_DIR, f"mipmap-{density}")
        os.makedirs(out_dir, exist_ok=True)

        resized = master.resize((size, size), Image.LANCZOS)
        # Square launcher
        resized.save(os.path.join(out_dir, "ic_launcher.png"))
        # Round launcher (same square will work since image is already round)
        resized.save(os.path.join(out_dir, "ic_launcher_round.png"))

        # Foreground (adaptive icon) - needs ~108dp at this density, with safe area in center 72dp
        # We embed the same icon centered with padding so it fits the masked area.
        fg_size = int(size * 1.5)  # 1.5x for adaptive foreground
        fg_canvas = Image.new("RGBA", (fg_size, fg_size), (0, 0, 0, 0))
        inner = master.resize((size, size), Image.LANCZOS)
        offset = (fg_size - size) // 2
        fg_canvas.paste(inner, (offset, offset), inner)
        fg_canvas.save(os.path.join(out_dir, "ic_launcher_foreground.png"))

        print(f"[OK] mipmap-{density}: ic_launcher*.png ({size}x{size})")


def update_play_store_icon(master):
    """Generate 512x512 Play Store icon."""
    play = master.resize((512, 512), Image.LANCZOS)
    play_path = os.path.join(os.path.dirname(__file__), "..", "..", "play-store", "icon-512.png")
    os.makedirs(os.path.dirname(play_path), exist_ok=True)
    play.save(play_path)
    print(f"[OK] Play Store 512: {play_path}")


def update_web_favicon(master):
    """Generate 192/512 PWA icons."""
    public = os.path.join(os.path.dirname(__file__), "..", "public")
    for s in [192, 512]:
        master.resize((s, s), Image.LANCZOS).save(
            os.path.join(public, f"icon-{s}.png")
        )
        print(f"[OK] PWA icon-{s}.png")
    # Favicon
    master.resize((64, 64), Image.LANCZOS).save(os.path.join(public, "favicon.png"))


if __name__ == "__main__":
    master = generate_master()
    generate_mipmaps(master)
    update_play_store_icon(master)
    update_web_favicon(master)
    print("\n[DONE] All icons generated.")
