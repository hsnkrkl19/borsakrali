// Logo processing pipeline:
// 1. app-icon.png'den K+taç bölümünü kare crop ile çıkar → app-icon-mark.png
// 2. Mark'tan tüm favicon/PWA boyutlarını public/ köküne üret
// 3. Diğer 4 logo (bull-color, bull-mono, crown-wordmark, k-wordmark) olduğu gibi kalır,
//    marka kiti sayfasında ve farklı kullanım yerlerinde referans verilecek

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const ROOT = path.resolve(__dirname, '..');
const LOGOS = path.join(ROOT, 'public', 'logos');
const PUBLIC = path.join(ROOT, 'public');

(async () => {
  // app-icon.png: 2814x1536 yatay (K+taç üstte, BORSAKRALI altta)
  // Mark region: ortala, üst %65 (wordmark hariç), kare yap.
  const src = path.join(LOGOS, 'app-icon.png');
  const meta = await sharp(src).metadata();
  console.log(`Kaynak: ${meta.width}x${meta.height}`);

  // K+taç region (wordmark öncesi). Dikdörtgen extract → kare canvasa pad.
  // app-icon.png yatay 2814x1536, K+taç görsel olarak x≈900-1900, y≈80-900 arası.
  const extractBox = { left: 900, top: 80, width: 1000, height: 820 };

  console.log(`Extract box: x=${extractBox.left}, y=${extractBox.top}, ${extractBox.width}x${extractBox.height}`);

  const markPath = path.join(LOGOS, 'app-icon-mark.png');
  await sharp(src)
    .extract(extractBox)
    .resize(1024, 1024, {
      fit: 'contain',
      background: { r: 255, g: 255, b: 255, alpha: 0 },
    })
    .png({ compressionLevel: 9 })
    .toFile(markPath);

  const markStat = fs.statSync(markPath);
  console.log(`✓ app-icon-mark.png  1024x1024  ${(markStat.size/1024).toFixed(0)}KB`);

  // Icon paketi mark'tan üret
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
