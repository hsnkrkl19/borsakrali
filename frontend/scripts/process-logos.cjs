// Logo processing pipeline:
// 1. app-icon.png yatay format (2814x1536). Alt kısımda BORSAKRALI wordmark var.
//    Üst yarıyı (y=0..1080) al → trim ile içeriğin gerçek bbox'unu bul →
//    kare canvasa uniform padding ile ortala → mark olarak kaydet.
// 2. Mark'tan tüm icon boyutlarını public/ köküne üret.
//
// Çalıştırma: cd frontend && node scripts/process-logos.cjs

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const ROOT = path.resolve(__dirname, '..');
const LOGOS = path.join(ROOT, 'public', 'logos');
const PUBLIC = path.join(ROOT, 'public');

(async () => {
  const src = path.join(LOGOS, 'app-icon.png');
  const srcMeta = await sharp(src).metadata();
  console.log(`Kaynak: ${srcMeta.width}x${srcMeta.height}`);

  // 1) Üst kısmı çıkar — BORSAKRALI wordmark altta y≈900 civarında başlıyor.
  //    Wordmark'tan önce kes ki trim() sadece K+taç+çizgileri kapsasın.
  const upperBuf = await sharp(src)
    .extract({ left: 0, top: 0, width: srcMeta.width, height: 900 })
    .toBuffer();

  // 2) Trim ile içeriğin gerçek sınırlarını bul.
  //    Görsel beyaz arka planlı (köşe pixel: 255,255,255,255), saydam değil.
  //    Beyaz pixelleri kes, threshold 20 ile yumuşak kenarları da yakalayalım.
  const trimmedBuf = await sharp(upperBuf)
    .trim({ background: '#ffffff', threshold: 20 })
    .toBuffer();
  const trimmedMeta = await sharp(trimmedBuf).metadata();
  console.log(`Trim sonrası içerik: ${trimmedMeta.width}x${trimmedMeta.height}`);

  // 3) Kare canvasa uniform padding ile ortala.
  //    En büyük kenarı al, %6 margin ekle.
  const contentMax = Math.max(trimmedMeta.width, trimmedMeta.height);
  const margin = Math.round(contentMax * 0.06);
  const canvasSize = contentMax + margin * 2;

  const padX = Math.round((canvasSize - trimmedMeta.width) / 2);
  const padY = Math.round((canvasSize - trimmedMeta.height) / 2);

  console.log(`Canvas: ${canvasSize}x${canvasSize}, pad x=${padX} y=${padY}`);

  const markPath = path.join(LOGOS, 'app-icon-mark.png');
  await sharp(trimmedBuf)
    .extend({
      top: padY,
      bottom: canvasSize - trimmedMeta.height - padY,
      left: padX,
      right: canvasSize - trimmedMeta.width - padX,
      background: { r: 255, g: 255, b: 255, alpha: 0 },
    })
    .resize(1024, 1024, { fit: 'fill' })  // canvas zaten kare, fill=lossless
    .png({ compressionLevel: 9 })
    .toFile(markPath);

  const markStat = fs.statSync(markPath);
  console.log(`✓ app-icon-mark.png  1024x1024  ${(markStat.size / 1024).toFixed(0)}KB`);

  // 4) Icon paketi mark'tan üret.
  const OUTPUTS = [
    { name: 'icon-512.png',         size: 512 },
    { name: 'icon-192.png',         size: 192 },
    { name: 'apple-touch-icon.png', size: 180 },
    { name: 'favicon.png',          size: 32 },
    { name: 'favicon-32.png',       size: 32 },
    { name: 'favicon-16.png',       size: 16 },
  ];

  for (const out of OUTPUTS) {
    const dest = path.join(PUBLIC, out.name);
    await sharp(markPath)
      .resize(out.size, out.size, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } })
      .png({ compressionLevel: 9 })
      .toFile(dest);
    const stat = fs.statSync(dest);
    console.log(`✓ ${out.name.padEnd(24)} ${out.size}x${out.size}  ${(stat.size/1024).toFixed(1)}KB`);
  }

  console.log('\nDone.');
})().catch(e => { console.error(e); process.exit(1); });
