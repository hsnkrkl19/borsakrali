// Overlay 'BORSA KRALI' Turkish-correct text onto banner area of icon-M2B4.png
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dir = resolve(__dirname, '..', 'public', 'icon-options');

const baseB64 = readFileSync(resolve(dir, 'icon-M2B4.png')).toString('base64');

const candidates = [
  {
    id: 'M2-final-1',
    label: 'Cinzel · Dark Brown',
    family: '"Cinzel", "Trajan Pro", "Times New Roman", serif',
    color: '#3d2200',
    shadow: '0 1px 0 rgba(255,230,160,0.55), 0 -1px 0 rgba(40,20,0,0.6)',
    weight: 700,
    size: 62,
    letterSpacing: '0.10em',
    googleFont: 'Cinzel:wght@700',
  },
  {
    id: 'M2-final-2',
    label: 'Cormorant SC · Black',
    family: '"Cormorant SC", "Cinzel", serif',
    color: '#1a0e00',
    shadow: '0 1px 1px rgba(255,230,160,0.4)',
    weight: 700,
    size: 70,
    letterSpacing: '0.06em',
    googleFont: 'Cormorant+SC:wght@700',
  },
  {
    id: 'M2-final-3',
    label: 'Playfair Display · Dark',
    family: '"Playfair Display", "Georgia", serif',
    color: '#2c1500',
    shadow: '0 1px 1px rgba(255,230,160,0.55), 0 -1px 0 rgba(0,0,0,0.4)',
    weight: 900,
    size: 60,
    letterSpacing: '0.12em',
    googleFont: 'Playfair+Display:wght@900',
  },
  {
    id: 'M2-final-4',
    label: 'Cinzel · Embossed Gold',
    family: '"Cinzel", "Times New Roman", serif',
    color: '#FFE39A',
    shadow: '0 1px 0 #5a3000, 0 -1px 0 #ffeaa8, 1px 0 0 #6b3d00, -1px 0 0 #6b3d00',
    weight: 800,
    size: 60,
    letterSpacing: '0.10em',
    googleFont: 'Cinzel:wght@800',
  },
];

const browser = await chromium.launch();
for (const c of candidates) {
  const page = await browser.newPage({ viewport: { width: 1024, height: 1024 } });
  const html = `<!DOCTYPE html><html><head>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=${c.googleFont}&display=swap" rel="stylesheet">
    <style>
      html,body{margin:0;padding:0;width:1024px;height:1024px;background:transparent;}
      .stage{position:relative;width:1024px;height:1024px;}
      .stage img{position:absolute;inset:0;width:1024px;height:1024px;display:block;}
      .text{
        position:absolute;
        left:200px;
        right:200px;
        top:685px;
        height:80px;
        display:flex;
        align-items:center;
        justify-content:center;
        font-family:${c.family};
        font-weight:${c.weight};
        font-size:${c.size}px;
        color:${c.color};
        letter-spacing:${c.letterSpacing};
        text-shadow:${c.shadow};
        text-transform:uppercase;
        white-space:nowrap;
      }
    </style></head><body>
    <div class="stage">
      <img src="data:image/png;base64,${baseB64}">
      <div class="text">BORSA KRALI</div>
    </div>
    </body></html>`;
  await page.setContent(html);
  // Wait for fonts to load
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
  const buf = await page.locator('.stage').screenshot({ omitBackground: false });
  writeFileSync(resolve(dir, `icon-${c.id}.png`), buf);
  console.log(`✓ icon-${c.id}.png (${c.label}, ${(buf.length / 1024).toFixed(0)} KB)`);
  await page.close();
}
await browser.close();
console.log('done');
