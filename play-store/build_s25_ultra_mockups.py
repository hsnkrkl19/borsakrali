from pathlib import Path
from textwrap import wrap

from PIL import Image, ImageDraw, ImageFilter, ImageFont


ROOT = Path(r"C:\Users\hsnkr\Desktop\BorsaKrali-Yayin-Paketi-2026-03-31_16-12-57")
RAW_DIR = ROOT / "gorseller" / "s25-raw"
OUT_DIR = ROOT / "gorseller" / "s25-ultra-mockup"
LOGO = Path(r"C:\Users\hsnkr\Desktop\site\borsasanati-clone\frontend\public\logo-borsakrali.png")

WIDTH, HEIGHT = 1440, 3200

SCREENS = [
  {
    "file": "01-giris-ekrani.png",
    "title": "H\u0131zl\u0131 ve G\u00fcvenli Giri\u015f",
    "subtitle": "Demo eri\u015fim ve kullan\u0131c\u0131 hesab\u0131 ile birka\u00e7 saniyede ba\u015flay\u0131n.",
  },
  {
    "file": "02-gizlilik-politikasi.png",
    "title": "\u015eeffaf Gizlilik Politikas\u0131",
    "subtitle": "Veri i\u015fleme s\u00fcreci, saklama mant\u0131\u011f\u0131 ve kullan\u0131c\u0131 haklar\u0131 tek sayfada.",
  },
  {
    "file": "03-hesap-silme.png",
    "title": "Hesap Silme Talebi",
    "subtitle": "Kullan\u0131c\u0131 kontrol\u00fc ve veri haklar\u0131 i\u00e7in temiz bir silme ak\u0131\u015f\u0131 sunulur.",
  },
  {
    "file": "04-piyasa-kokpiti.png",
    "title": "Piyasa Kokpiti",
    "subtitle": "BIST, emtia ve \u00f6ne \u00e7\u0131kan hisseleri tek bak\u0131\u015fta izleyin.",
  },
  {
    "file": "05-teknik-analiz-ai.png",
    "title": "Teknik Analiz AI",
    "subtitle": "RSI, MACD, Bollinger ve EMA g\u00f6stergelerini mobil uyumlu ak\u0131\u015fta yorumlay\u0131n.",
  },
  {
    "file": "06-temel-analiz-ai.png",
    "title": "Temel Analiz AI",
    "subtitle": "Akademik skor modelleri ile hisseleri daha derin ve anla\u015f\u0131l\u0131r inceleyin.",
  },
  {
    "file": "07-hisse-ai-skor.png",
    "title": "Hisse AI Skor",
    "subtitle": "Teknik ve temel verileri ayn\u0131 ekranda puanlayan pratik analiz alan\u0131.",
  },
  {
    "file": "08-mali-tablolar.png",
    "title": "Mali Tablolar",
    "subtitle": "Gelir tablosu, bilan\u00e7o ve oran analizlerini okunakl\u0131 yap\u0131da g\u00f6r\u00fcn.",
  },
  {
    "file": "09-kap-analitik.png",
    "title": "KAP Analitik",
    "subtitle": "KAP bildirimlerini pozitif, n\u00f6tr ve anomali filtreleri ile taray\u0131n.",
  },
  {
    "file": "10-ekonomik-takvim.png",
    "title": "Ekonomik Takvim",
    "subtitle": "T\u00fcrkiye ve ABD veri ak\u0131\u015f\u0131n\u0131 g\u00fcn baz\u0131nda takip edin.",
  },
  {
    "file": "11-ema34-takip.png",
    "title": "EMA34 Takip",
    "subtitle": "Trend devam\u0131 ve k\u0131r\u0131l\u0131m sinyallerini tek ekrandan y\u00f6netin.",
  },
  {
    "file": "12-piyasa-radari.png",
    "title": "Piyasa Radar\u0131",
    "subtitle": "Strateji bazl\u0131 taramalar ile yeni f\u0131rsatlar\u0131 h\u0131zl\u0131ca bulun.",
  },
  {
    "file": "13-algoritma-performans.png",
    "title": "Algoritma Performans",
    "subtitle": "Sinyal ba\u015far\u0131lar\u0131n\u0131 ve aktif takibi g\u00fcncel performans kartlar\u0131yla izleyin.",
  },
  {
    "file": "14-finansal-notlar.png",
    "title": "Finansal Notlar",
    "subtitle": "Kendi g\u00f6zlemlerinizi sembol bazl\u0131 notlar ile kaydedin ve d\u00fczenli tutun.",
  },
  {
    "file": "15-pro-analiz.png",
    "title": "Pro Analiz",
    "subtitle": "Daha yo\u011fun veri panelleri ve ileri analiz alanlar\u0131 ile g\u00fc\u00e7l\u00fc bir deneyim sunar.",
  },
]


def load_font(size: int, bold: bool = False):
  candidates = [
    r"C:\Windows\Fonts\seguisb.ttf" if bold else r"C:\Windows\Fonts\segoeui.ttf",
    r"C:\Windows\Fonts\segoeuib.ttf" if bold else r"C:\Windows\Fonts\segoeui.ttf",
    r"C:\Windows\Fonts\arialbd.ttf" if bold else r"C:\Windows\Fonts\arial.ttf",
  ]
  for candidate in candidates:
    try:
      return ImageFont.truetype(candidate, size)
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


def wrap_text(draw: ImageDraw.ImageDraw, text: str, max_width: int, font: ImageFont.FreeTypeFont):
  words = text.split()
  lines = []
  current = []
  for word in words:
    trial = " ".join(current + [word])
    bbox = draw.textbbox((0, 0), trial, font=font)
    if bbox[2] - bbox[0] <= max_width:
      current.append(word)
      continue
    if current:
      lines.append(" ".join(current))
    current = [word]
  if current:
    lines.append(" ".join(current))
  return lines


def build_background():
  bg = Image.new("RGBA", (WIDTH, HEIGHT), "#08111f")
  pixels = bg.load()
  for y in range(HEIGHT):
    t = y / max(HEIGHT - 1, 1)
    r = int(9 + (18 - 9) * t)
    g = int(17 + (30 - 17) * t)
    b = int(31 + (54 - 31) * t)
    for x in range(WIDTH):
      pixels[x, y] = (r, g, b, 255)

  overlay = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 0))
  draw = ImageDraw.Draw(overlay)

  for x in range(0, WIDTH, 72):
    draw.line((x, 0, x, HEIGHT), fill=(255, 255, 255, 9), width=1)
  for y in range(0, HEIGHT, 72):
    draw.line((0, y, WIDTH, y), fill=(255, 255, 255, 7), width=1)

  glows = [
    ((-140, -80, 460, 520), (245, 158, 11, 62), 90),
    ((860, 0, 1540, 840), (37, 99, 235, 72), 110),
    ((680, 2140, 1520, 3140), (16, 185, 129, 58), 130),
  ]
  for bbox, color, blur in glows:
    glow = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 0))
    ImageDraw.Draw(glow).ellipse(bbox, fill=color)
    overlay.alpha_composite(glow.filter(ImageFilter.GaussianBlur(blur)))

  chart = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 0))
  cd = ImageDraw.Draw(chart)
  points = [
    (170, 2400),
    (320, 2260),
    (470, 2320),
    (620, 2140),
    (780, 2210),
    (930, 2040),
    (1100, 2140),
    (1260, 1940),
  ]
  cd.line([(x, y + 10) for x, y in points], fill=(245, 158, 11, 28), width=24)
  cd.line([(x, y + 5) for x, y in points], fill=(245, 158, 11, 54), width=16)
  cd.line(points, fill=(250, 204, 21, 210), width=8)
  for x, y in points:
    cd.ellipse((x - 11, y - 11, x + 11, y + 11), fill=(250, 204, 21, 255))
    cd.ellipse((x - 22, y - 22, x + 22, y + 22), fill=(250, 204, 21, 38))
  overlay.alpha_composite(chart)

  bg.alpha_composite(overlay)
  return bg


def draw_header(base: Image.Image, item: dict, index: int):
  draw = ImageDraw.Draw(base)

  chip = Image.new("RGBA", (520, 112), (0, 0, 0, 0))
  cd = ImageDraw.Draw(chip)
  cd.rounded_rectangle((0, 0, 519, 111), radius=56, fill=(255, 255, 255, 18), outline=(255, 255, 255, 20))
  base.alpha_composite(chip, (92, 96))

  logo = Image.open(LOGO).convert("RGBA").resize((82, 82), Image.Resampling.LANCZOS)
  base.alpha_composite(logo, (114, 111))
  draw.text((220, 126), "BORSA KRALI", font=load_font(44, True), fill=(255, 196, 67, 255))

  count_box = Image.new("RGBA", (126, 62), (0, 0, 0, 0))
  cbd = ImageDraw.Draw(count_box)
  cbd.rounded_rectangle((0, 0, 125, 61), radius=31, fill=(255, 255, 255, 18), outline=(255, 255, 255, 24))
  draw_count = f"{index:02d}/15"
  cbd.text((26, 14), draw_count, font=load_font(26, True), fill=(255, 255, 255, 255))
  base.alpha_composite(count_box, (1222, 124))

  title_font = load_font(96, True)
  subtitle_font = load_font(40, False)
  title_lines = wrap_text(draw, item["title"], 1180, title_font)
  subtitle_lines = wrap_text(draw, item["subtitle"], 1120, subtitle_font)

  y = 272
  for line in title_lines[:2]:
    draw.text((104, y), line, font=title_font, fill=(255, 255, 255, 255))
    y += 104

  y += 26
  for line in subtitle_lines[:3]:
    draw.text((108, y), line, font=subtitle_font, fill=(198, 209, 223, 255))
    y += 52


def add_device(canvas: Image.Image, raw_path: Path):
  device = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
  draw = ImageDraw.Draw(device)

  body_x = 150
  body_y = 640
  body_w = 1140
  body_h = 2460
  radius = 108

  shadow = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
  sd = ImageDraw.Draw(shadow)
  sd.rounded_rectangle(
    (body_x + 10, body_y + 30, body_x + body_w + 14, body_y + body_h + 40),
    radius=120,
    fill=(0, 0, 0, 130),
  )
  shadow = shadow.filter(ImageFilter.GaussianBlur(40))
  canvas.alpha_composite(shadow)

  draw.rounded_rectangle(
    (body_x, body_y, body_x + body_w, body_y + body_h),
    radius=radius,
    fill=(10, 16, 28, 255),
    outline=(75, 108, 168, 82),
    width=4,
  )
  draw.rounded_rectangle(
    (body_x + 8, body_y + 8, body_x + body_w - 8, body_y + body_h - 8),
    radius=100,
    outline=(255, 255, 255, 18),
    width=2,
  )

  screen_x = body_x + 42
  screen_y = body_y + 84
  screen_w = 1056
  screen_h = 2288

  raw = Image.open(raw_path).convert("RGBA")
  fitted = raw.resize((screen_w, screen_h), Image.Resampling.LANCZOS)
  mask = rounded_mask((screen_w, screen_h), 86)
  rounded_screen = Image.new("RGBA", (screen_w, screen_h), (0, 0, 0, 0))
  rounded_screen.paste(fitted, (0, 0), mask)
  device.alpha_composite(rounded_screen, (screen_x, screen_y))

  gloss = Image.new("RGBA", (screen_w, screen_h), (0, 0, 0, 0))
  gd = ImageDraw.Draw(gloss)
  gd.rounded_rectangle(
    (14, 14, screen_w - 14, screen_h // 2),
    radius=82,
    fill=(255, 255, 255, 16),
  )
  gloss = gloss.filter(ImageFilter.GaussianBlur(22))
  device.alpha_composite(gloss, (screen_x, screen_y))

  camera_draw = ImageDraw.Draw(device)
  camera_x = screen_x + screen_w // 2
  camera_y = screen_y + 28
  camera_draw.ellipse(
    (camera_x - 17, camera_y - 17, camera_x + 17, camera_y + 17),
    fill=(7, 11, 19, 242),
  )

  speaker = Image.new("RGBA", (120, 12), (0, 0, 0, 0))
  sd = ImageDraw.Draw(speaker)
  sd.rounded_rectangle((0, 0, 119, 11), radius=6, fill=(6, 10, 17, 220))
  device.alpha_composite(speaker, (body_x + (body_w - 120) // 2, body_y + 26))

  button_draw = ImageDraw.Draw(device)
  button_draw.rounded_rectangle((body_x + body_w - 8, body_y + 520, body_x + body_w + 6, body_y + 820), radius=7, fill=(25, 36, 54, 255))
  button_draw.rounded_rectangle((body_x - 8, body_y + 680, body_x + 4, body_y + 900), radius=6, fill=(25, 36, 54, 255))

  canvas.alpha_composite(device)


def build_single(item: dict, index: int):
  canvas = build_background()
  draw_header(canvas, item, index)
  add_device(canvas, RAW_DIR / item["file"])
  OUT_DIR.mkdir(parents=True, exist_ok=True)
  output_path = OUT_DIR / item["file"]
  canvas.convert("RGB").save(output_path, quality=96)
  return output_path


def main():
  generated = []
  for index, item in enumerate(SCREENS, start=1):
    generated.append(build_single(item, index))
  for path in generated:
    print(path)


if __name__ == "__main__":
  main()
