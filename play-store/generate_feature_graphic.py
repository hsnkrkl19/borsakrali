from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont


ROOT = Path(r"C:\Users\hsnkr\Desktop\BorsaKrali-Yayin-Paketi-2026-03-31_16-12-57")
SHOTS = ROOT / "gorseller" / "telefon"
OUT = ROOT / "gorseller" / "tanitim" / "BorsaKrali-feature-graphic-1024x500.png"
LOGO = Path(r"C:\Users\hsnkr\Desktop\site\borsasanati-clone\frontend\public\logo-borsakrali.png")

W, H = 1024, 500
SCALE = 2
CW, CH = W * SCALE, H * SCALE


def load_font(size: int, bold: bool = False):
  candidates = [
    r"C:\Windows\Fonts\seguisb.ttf" if bold else r"C:\Windows\Fonts\segoeui.ttf",
    r"C:\Windows\Fonts\segoeuib.ttf" if bold else r"C:\Windows\Fonts\segoeui.ttf",
    r"C:\Windows\Fonts\arialbd.ttf" if bold else r"C:\Windows\Fonts\arial.ttf",
  ]
  for path in candidates:
    try:
      return ImageFont.truetype(path, size * SCALE)
    except Exception:
      continue
  return ImageFont.load_default()


def rounded_mask(size, radius):
  mask = Image.new("L", size, 0)
  ImageDraw.Draw(mask).rounded_rectangle(
    (0, 0, size[0] - 1, size[1] - 1),
    radius=radius,
    fill=255,
  )
  return mask


def add_shadow(base: Image.Image, alpha_bbox, blur=28, offset=(0, 18), color=(0, 0, 0, 108)):
  shadow = Image.new("RGBA", base.size, (0, 0, 0, 0))
  draw = ImageDraw.Draw(shadow)
  x0, y0, x1, y1 = alpha_bbox
  draw.rounded_rectangle(
    (x0 + offset[0], y0 + offset[1], x1 + offset[0], y1 + offset[1]),
    radius=52 * SCALE,
    fill=color,
  )
  shadow = shadow.filter(ImageFilter.GaussianBlur(blur))
  base.alpha_composite(shadow)


def fit_text(draw: ImageDraw.ImageDraw, text: str, max_width: int, size: int, bold: bool):
  current_size = size
  while current_size >= 18:
    font = load_font(current_size, bold)
    bbox = draw.textbbox((0, 0), text, font=font)
    if (bbox[2] - bbox[0]) <= max_width:
      return font
    current_size -= 1
  return load_font(18, bold)


def make_phone_mockup(image_path: Path, target_height: int, angle: float):
  shot = Image.open(image_path).convert("RGBA")
  ratio = (target_height * SCALE) / shot.height
  screen = shot.resize(
    (int(shot.width * ratio), target_height * SCALE),
    Image.Resampling.LANCZOS,
  )

  bezel = 15 * SCALE
  frame_width = screen.width + bezel * 2
  frame_height = screen.height + bezel * 2
  frame = Image.new("RGBA", (frame_width, frame_height), (0, 0, 0, 0))
  draw = ImageDraw.Draw(frame)

  draw.rounded_rectangle(
    (0, 0, frame_width - 1, frame_height - 1),
    radius=44 * SCALE,
    fill=(9, 16, 30, 255),
    outline=(255, 255, 255, 38),
    width=2 * SCALE,
  )

  rim = Image.new("RGBA", frame.size, (0, 0, 0, 0))
  rd = ImageDraw.Draw(rim)
  rd.rounded_rectangle(
    (5 * SCALE, 5 * SCALE, frame_width - 6 * SCALE, frame_height - 6 * SCALE),
    radius=40 * SCALE,
    outline=(96, 165, 250, 48),
    width=2 * SCALE,
  )
  frame.alpha_composite(rim)

  glass = Image.new("RGBA", frame.size, (0, 0, 0, 0))
  gd = ImageDraw.Draw(glass)
  gd.rounded_rectangle(
    (6 * SCALE, 6 * SCALE, frame_width - 8 * SCALE, (frame_height // 2)),
    radius=40 * SCALE,
    fill=(255, 255, 255, 10),
  )
  glass = glass.filter(ImageFilter.GaussianBlur(12 * SCALE))
  frame.alpha_composite(glass)

  screen_mask = rounded_mask(screen.size, 31 * SCALE)
  rounded_screen = Image.new("RGBA", screen.size, (0, 0, 0, 0))
  rounded_screen.paste(screen, (0, 0), screen_mask)
  frame.alpha_composite(rounded_screen, (bezel, bezel))

  speaker = Image.new("RGBA", (130 * SCALE, 16 * SCALE), (0, 0, 0, 0))
  sd = ImageDraw.Draw(speaker)
  sd.rounded_rectangle(
    (0, 0, speaker.width - 1, speaker.height - 1),
    radius=8 * SCALE,
    fill=(5, 10, 18, 228),
  )
  frame.alpha_composite(speaker, ((frame_width - speaker.width) // 2, 11 * SCALE))

  rotated = frame.rotate(angle, resample=Image.Resampling.BICUBIC, expand=True)
  bbox = rotated.getchannel("A").getbbox()
  return rotated.crop(bbox)


def build_background():
  bg = Image.new("RGBA", (CW, CH), "#08111f")
  px = bg.load()

  for y in range(CH):
    t = y / max(CH - 1, 1)
    r = int(8 + (17 - 8) * t)
    g = int(17 + (28 - 17) * t)
    b = int(31 + (52 - 31) * t)
    for x in range(CW):
      px[x, y] = (r, g, b, 255)

  overlay = Image.new("RGBA", (CW, CH), (0, 0, 0, 0))
  draw = ImageDraw.Draw(overlay)

  for x in range(0, CW, 52 * SCALE):
    draw.line((x, 0, x, CH), fill=(255, 255, 255, 10), width=1)
  for y in range(0, CH, 52 * SCALE):
    draw.line((0, y, CW, y), fill=(255, 255, 255, 8), width=1)

  glows = [
    ((-180 * SCALE, -80 * SCALE, 250 * SCALE, 290 * SCALE), (245, 158, 11, 78), 64),
    ((740 * SCALE, -130 * SCALE, 1180 * SCALE, 230 * SCALE), (37, 99, 235, 92), 62),
    ((810 * SCALE, 230 * SCALE, 1220 * SCALE, 620 * SCALE), (16, 185, 129, 52), 72),
  ]
  for bbox, color, blur in glows:
    glow = Image.new("RGBA", (CW, CH), (0, 0, 0, 0))
    ImageDraw.Draw(glow).ellipse(bbox, fill=color)
    overlay.alpha_composite(glow.filter(ImageFilter.GaussianBlur(blur)))

  chart = Image.new("RGBA", (CW, CH), (0, 0, 0, 0))
  cd = ImageDraw.Draw(chart)
  points = [
    (468 * SCALE, 432 * SCALE),
    (544 * SCALE, 396 * SCALE),
    (622 * SCALE, 414 * SCALE),
    (694 * SCALE, 352 * SCALE),
    (780 * SCALE, 365 * SCALE),
    (852 * SCALE, 312 * SCALE),
    (938 * SCALE, 274 * SCALE),
    (1012 * SCALE, 244 * SCALE),
  ]
  cd.line([(x, y + 9 * SCALE) for x, y in points], fill=(245, 158, 11, 24), width=12 * SCALE, joint="curve")
  cd.line([(x, y + 5 * SCALE) for x, y in points], fill=(245, 158, 11, 44), width=8 * SCALE, joint="curve")
  cd.line(points, fill=(251, 191, 36, 220), width=5 * SCALE, joint="curve")
  for x, y in points:
    cd.ellipse((x - 7 * SCALE, y - 7 * SCALE, x + 7 * SCALE, y + 7 * SCALE), fill=(251, 191, 36, 255))
    cd.ellipse((x - 15 * SCALE, y - 15 * SCALE, x + 15 * SCALE, y + 15 * SCALE), fill=(251, 191, 36, 34))
  overlay.alpha_composite(chart)

  vignette = Image.new("RGBA", (CW, CH), (0, 0, 0, 0))
  vd = ImageDraw.Draw(vignette)
  vd.rectangle((0, 0, CW, CH), fill=(0, 0, 0, 26))
  vignette = vignette.filter(ImageFilter.GaussianBlur(20 * SCALE))
  overlay.alpha_composite(vignette)

  bg.alpha_composite(overlay)
  return bg


def draw_brand_panel(base: Image.Image):
  draw = ImageDraw.Draw(base)

  panel = Image.new("RGBA", (476 * SCALE, 360 * SCALE), (0, 0, 0, 0))
  pd = ImageDraw.Draw(panel)
  pd.rounded_rectangle(
    (0, 0, panel.width - 1, panel.height - 1),
    radius=34 * SCALE,
    fill=(8, 15, 28, 178),
    outline=(255, 255, 255, 18),
    width=1 * SCALE,
  )
  base.alpha_composite(panel, (36 * SCALE, 62 * SCALE))

  brand_chip = Image.new("RGBA", (288 * SCALE, 64 * SCALE), (0, 0, 0, 0))
  bd = ImageDraw.Draw(brand_chip)
  bd.rounded_rectangle(
    (0, 0, brand_chip.width - 1, brand_chip.height - 1),
    radius=32 * SCALE,
    fill=(255, 255, 255, 18),
    outline=(255, 255, 255, 20),
    width=1 * SCALE,
  )
  base.alpha_composite(brand_chip, (58 * SCALE, 88 * SCALE))

  logo = Image.open(LOGO).convert("RGBA").resize((52 * SCALE, 52 * SCALE), Image.Resampling.LANCZOS)
  base.alpha_composite(logo, (70 * SCALE, 94 * SCALE))
  draw.text(
    (138 * SCALE, 107 * SCALE),
    "BORSA KRALI",
    font=load_font(24, True),
    fill=(255, 196, 67, 255),
  )

  draw.text((58 * SCALE, 194 * SCALE), "BIST, Kripto ve", font=load_font(52, True), fill=(255, 255, 255, 255))
  draw.text((58 * SCALE, 254 * SCALE), "AI Destekli Analiz", font=load_font(52, True), fill=(255, 196, 67, 255))

  subtitle = (
    "Teknik analiz, mali tablolar ve\n"
    "AI destekli piyasa takibini\n"
    "tek uygulamada bir araya getir."
  )
  draw.multiline_text(
    (58 * SCALE, 326 * SCALE),
    subtitle,
    font=load_font(24, False),
    fill=(199, 210, 223, 255),
    spacing=8 * SCALE,
  )

  chips = [
    ("Ger\u00e7ek Veri", "#0f766e"),
    ("AI Skor", "#1d4ed8"),
    ("Mobil Uyumlu", "#92400e"),
  ]
  x = 58 * SCALE
  y = 434 * SCALE
  for label, color in chips:
    width = (112 + len(label) * 8) * SCALE
    pill = Image.new("RGBA", (width, 44 * SCALE), (0, 0, 0, 0))
    pd = ImageDraw.Draw(pill)
    rgb = tuple(int(color[i:i + 2], 16) for i in (1, 3, 5))
    pd.rounded_rectangle(
      (0, 0, pill.width - 1, pill.height - 1),
      radius=22 * SCALE,
      fill=rgb + (218,),
    )
    font = fit_text(pd, label, pill.width - (32 * SCALE), 21, True)
    text_box = pd.textbbox((0, 0), label, font=font)
    text_x = (pill.width - (text_box[2] - text_box[0])) // 2
    text_y = (pill.height - (text_box[3] - text_box[1])) // 2 - (2 * SCALE)
    pd.text((text_x, text_y), label, font=font, fill=(255, 255, 255, 255))
    base.alpha_composite(pill, (x, y))
    x += width + 14 * SCALE

  metrics = [
    ("510+", "Hisse"),
    ("BIST", "Analiz"),
    ("Kripto", "Takip"),
  ]
  x = 636 * SCALE
  for number, label in metrics:
    pill = Image.new("RGBA", (112 * SCALE, 74 * SCALE), (0, 0, 0, 0))
    pd = ImageDraw.Draw(pill)
    pd.rounded_rectangle(
      (0, 0, pill.width - 1, pill.height - 1),
      radius=24 * SCALE,
      fill=(255, 255, 255, 16),
      outline=(255, 255, 255, 24),
      width=1 * SCALE,
    )
    pd.text((16 * SCALE, 12 * SCALE), number, font=fit_text(pd, number, 80 * SCALE, 26, True), fill=(255, 255, 255, 255))
    pd.text((16 * SCALE, 42 * SCALE), label, font=load_font(18, False), fill=(196, 206, 220, 255))
    base.alpha_composite(pill, (x, 396 * SCALE))
    x += 122 * SCALE


def main():
  canvas = build_background()
  draw_brand_panel(canvas)

  cluster_glass = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
  gd = ImageDraw.Draw(cluster_glass)
  gd.rounded_rectangle(
    (590 * SCALE, 330 * SCALE, 1000 * SCALE, 492 * SCALE),
    radius=34 * SCALE,
    fill=(255, 255, 255, 10),
    outline=(255, 255, 255, 14),
    width=1 * SCALE,
  )
  cluster_glass = cluster_glass.filter(ImageFilter.GaussianBlur(2 * SCALE))
  canvas.alpha_composite(cluster_glass)

  phones = [
    (SHOTS / "02-dashboard.png", (632 * SCALE, 92 * SCALE), 276, -8),
    (SHOTS / "03-teknik-analiz.png", (772 * SCALE, 52 * SCALE), 304, 2),
    (SHOTS / "08-kap-analitik.png", (888 * SCALE, 110 * SCALE), 248, 9),
  ]

  for image_path, pos, target_height, angle in phones:
    phone = make_phone_mockup(image_path, target_height, angle)
    bbox = (pos[0], pos[1], pos[0] + phone.width, pos[1] + phone.height)
    add_shadow(canvas, bbox, blur=24 * SCALE, offset=(0, 10 * SCALE), color=(0, 0, 0, 92))
    canvas.alpha_composite(phone, pos)

  final = canvas.resize((W, H), Image.Resampling.LANCZOS).convert("RGB")
  final.save(OUT, quality=96)
  print(OUT)


if __name__ == "__main__":
  main()
