from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageOps


ROOT = Path(r"C:\Users\hsnkr\Desktop\BorsaKrali-Yayin-Paketi-2026-03-31_16-12-57")
PHONE_DIR = ROOT / "gorseller" / "telefon"
PROMO_DIR = ROOT / "gorseller" / "tanitim"
PDF_OUT = ROOT / "BorsaKrali-GooglePlay-YayinPaketi.pdf"
ICON = ROOT / "BorsaKrali-icon-512x512.png"
FEATURE = PROMO_DIR / "BorsaKrali-feature-graphic-1024x500.png"

PAGE_W, PAGE_H = 1654, 2339
MARGIN = 96


def font(size: int, bold: bool = False):
  candidates = [
    r"C:\Windows\Fonts\seguisb.ttf" if bold else r"C:\Windows\Fonts\segoeui.ttf",
    r"C:\Windows\Fonts\segoeuib.ttf" if bold else r"C:\Windows\Fonts\segoeui.ttf",
    r"C:\Windows\Fonts\arialbd.ttf" if bold else r"C:\Windows\Fonts\arial.ttf",
  ]
  for path in candidates:
    try:
      return ImageFont.truetype(path, size)
    except Exception:
      continue
  return ImageFont.load_default()


def create_page():
  page = Image.new("RGB", (PAGE_W, PAGE_H), "#f7f8fb")
  draw = ImageDraw.Draw(page)
  draw.rectangle((0, 0, PAGE_W, 168), fill="#0b1324")
  draw.text((MARGIN, 54), "Borsa Krali Play Store Yayin Paketi", font=font(42, True), fill="white")
  return page


def draw_section_title(draw: ImageDraw.ImageDraw, y: int, title: str, subtitle: str | None = None):
  draw.text((MARGIN, y), title, font=font(36, True), fill="#0f172a")
  if subtitle:
    draw.text((MARGIN, y + 52), subtitle, font=font(20, False), fill="#64748b")


def fit_cover():
  page = Image.new("RGBA", (PAGE_W, PAGE_H), "#091120")
  draw = ImageDraw.Draw(page)

  feature = Image.open(FEATURE).convert("RGB")
  feature = ImageOps.fit(feature, (PAGE_W, 808), method=Image.Resampling.LANCZOS)
  page.paste(feature, (0, 0))

  overlay = Image.new("RGBA", (PAGE_W, PAGE_H), (0, 0, 0, 0))
  od = ImageDraw.Draw(overlay)
  od.rounded_rectangle((78, 878, PAGE_W - 78, 2170), radius=40, fill=(255, 255, 255, 245))
  page.alpha_composite(overlay)

  icon = Image.open(ICON).convert("RGBA").resize((110, 110), Image.Resampling.LANCZOS)
  page.paste(icon, (118, 928), icon)
  draw.text((250, 942), "Borsa Krali", font=font(52, True), fill="white")
  draw.text((118, 1110), "Teslim Paketi", font=font(54, True), fill="#0f172a")
  draw.text((118, 1184), "Google Play Console icin hazir dosyalar, gorseller ve yayin notlari", font=font(24, False), fill="#64748b")

  bullets = [
    "AAB ve APK ciktilari",
    "Yenilenmis 1024x500 kapak gorseli",
    "12 adet telefon ekran goruntusu",
    "Gizlilik, kullanim kosullari ve hesap silme baglantilari",
    "Play Console metinleri ve kullanim notlari",
  ]
  y = 1288
  for item in bullets:
    draw.rounded_rectangle((120, y + 12, 140, y + 32), radius=10, fill="#f59e0b")
    draw.text((164, y), item, font=font(28, False), fill="#111827")
    y += 78

  draw.text((118, 1738), "Paket Konumu", font=font(28, True), fill="#0f172a")
  draw.rounded_rectangle((118, 1790, PAGE_W - 118, 1976), radius=28, fill="#0f172a")
  draw.text((148, 1844), str(ROOT), font=font(21, False), fill="white")

  draw.text((118, 2044), "Olcu Ozetleri", font=font(28, True), fill="#0f172a")
  specs = [
    "App icon: 512x512 PNG",
    "Feature graphic: 1024x500 PNG",
    "Telefon ekranlari: 1082x2202 PNG",
  ]
  sy = 2092
  for spec in specs:
    draw.text((124, sy), spec, font=font(24, False), fill="#334155")
    sy += 42

  return page.convert("RGB")


def info_page():
  page = create_page()
  draw = ImageDraw.Draw(page)

  draw_section_title(draw, 236, "Play Console Doldurma Ozeti", "Bu metinler ilk yayin akisi icin hazir tutuldu.")

  left_x = MARGIN
  top = 360
  row_gap = 126
  items = [
    ("Kategori", "Finance"),
    ("Uygulama Erisimi", "Demo ile giris acik"),
    ("Reklam", "Evet"),
    ("Hedef Kitle", "18+"),
    ("Finans Ozellikleri", "Financial advice / analiz"),
    ("Fiyat", "Ucretsiz"),
  ]
  for idx, (label, value) in enumerate(items):
    y = top + idx * row_gap
    draw.rounded_rectangle((left_x, y, PAGE_W - MARGIN, y + 88), radius=26, fill="white", outline="#e2e8f0")
    draw.text((left_x + 28, y + 18), label, font=font(24, True), fill="#0f172a")
    draw.text((left_x + 390, y + 20), value, font=font(24, False), fill="#334155")

  draw_section_title(draw, 1188, "Canli Baglantilar")
  links = [
    "https://borsakrali.com/privacy-policy",
    "https://borsakrali.com/terms-of-use",
    "https://borsakrali.com/account-deletion",
  ]
  y = 1270
  for link in links:
    draw.rounded_rectangle((MARGIN, y, PAGE_W - MARGIN, y + 96), radius=28, fill="#ffffff", outline="#dbeafe")
    draw.text((MARGIN + 28, y + 28), link, font=font(23, False), fill="#1d4ed8")
    y += 118

  draw_section_title(draw, 1660, "Veri Guvenligi Ozeti")
  notes = [
    "Toplanan veriler: ad, e-posta, telefon, kullanici kimligi, kullanici tarafindan girilen icerik",
    "Veri aktariminda sifreleme var",
    "Kullanici hesap silme talebi gonderebilir",
    "AdMob icin reklam ve cihaz tanimlayicilari beyan edilmeli",
  ]
  y = 1740
  for note in notes:
    draw.text((MARGIN + 16, y), f"- {note}", font=font(22, False), fill="#334155")
    y += 44

  return page


def prettify_name(path: Path):
  name = path.stem
  name = name.split("-", 1)[-1]
  name = name.replace("-", " ")
  return name.title().replace("Ai", "AI").replace("Kap", "KAP")


def gallery_pages():
  screenshots = sorted(PHONE_DIR.glob("*.png"))
  pages = []

  for start in range(0, len(screenshots), 6):
    page = create_page()
    draw = ImageDraw.Draw(page)
    draw_section_title(draw, 236, "Telefon Ekran Goruntuleri", "Play Console icin PNG formatinda hazirlandi.")

    items = screenshots[start:start + 6]
    slot_w = 672
    slot_h = 575
    x_positions = [MARGIN, PAGE_W - MARGIN - slot_w]
    y_positions = [360, 968, 1576]

    for idx, shot_path in enumerate(items):
      col = idx % 2
      row = idx // 2
      x = x_positions[col]
      y = y_positions[row]

      draw.rounded_rectangle((x, y, x + slot_w, y + slot_h), radius=34, fill="white", outline="#e2e8f0")
      draw.text((x + 28, y + 22), prettify_name(shot_path), font=font(24, True), fill="#0f172a")

      shot = Image.open(shot_path).convert("RGB")
      thumb = ImageOps.contain(shot, (slot_w - 80, slot_h - 110), method=Image.Resampling.LANCZOS)
      thumb_x = x + (slot_w - thumb.width) // 2
      thumb_y = y + 74
      page.paste(thumb, (thumb_x, thumb_y))

      draw.text((x + 28, y + slot_h - 44), shot_path.name, font=font(18, False), fill="#64748b")

    pages.append(page)

  return pages


def main():
  pages = [fit_cover(), info_page(), *gallery_pages()]
  rgb_pages = [page.convert("RGB") for page in pages]
  rgb_pages[0].save(PDF_OUT, save_all=True, append_images=rgb_pages[1:], resolution=144)
  print(PDF_OUT)


if __name__ == "__main__":
  main()
