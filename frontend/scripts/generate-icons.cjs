// SVG → PNG icon generator
// Usage: node scripts/generate-icons.cjs
// Kaynak: public/logos/app-icon.svg
// Çıktılar: public/ köküne icon-512, icon-192, favicon-32/16, apple-touch-icon, favicon.png

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const ROOT = path.resolve(__dirname, '..');
const SVG_PATH = path.join(ROOT, 'public', 'logos', 'app-icon.svg');
const PUBLIC = path.join(ROOT, 'public');

if (!fs.existsSync(SVG_PATH)) {
  console.error('SVG bulunamadı:', SVG_PATH);
  process.exit(1);
}

const svg = fs.readFileSync(SVG_PATH);

const OUTPUTS = [
  { name: 'icon-512.png', size: 512 },
  { name: 'icon-192.png', size: 192 },
  { name: 'favicon-32.png', size: 32 },
  { name: 'favicon-16.png', size: 16 },
  { name: 'favicon.png', size: 32 },
  { name: 'apple-touch-icon.png', size: 180 },
];

(async () => {
  for (const out of OUTPUTS) {
    const dest = path.join(PUBLIC, out.name);
    // density=512 — küçük viewBox'lı SVG'yi yüksek çözünürlükte raster'a alır,
    // sonra resize. Soft gradient/aura için kritik.
    await sharp(svg, { density: 512 })
      .resize(out.size, out.size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png({ compressionLevel: 9 })
      .toFile(dest);
    const stat = fs.statSync(dest);
    console.log(`✓ ${out.name.padEnd(24)} ${out.size}x${out.size}  ${(stat.size/1024).toFixed(1)}KB`);
  }
  console.log('\nDone — PNG paketi public/ köküne yazıldı.');
})().catch(e => { console.error(e); process.exit(1); });
