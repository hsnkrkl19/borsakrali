import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = resolve(__dirname, '..', 'public', 'icon-options');

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1024, height: 1024 } });

const svgLetters = ['A', 'B', 'C', 'D', 'E', 'F'];
const aiLetters = ['G', 'H', 'I', 'J', 'K', 'L', 'M', 'N'];
const letters = [...svgLetters, ...aiLetters];

for (const L of svgLetters) {
  const svg = readFileSync(resolve(publicDir, `icon-${L}.svg`), 'utf-8');
  const html = `<!DOCTYPE html><html><head><style>html,body{margin:0;padding:0;background:transparent;}svg{display:block;width:1024px;height:1024px;}</style></head><body>${svg}</body></html>`;
  await page.setContent(html);
  await page.waitForLoadState('networkidle');
  const buf = await page.locator('svg').screenshot({ omitBackground: true });
  writeFileSync(resolve(publicDir, `icon-${L}.png`), buf);
  console.log(`rendered icon-${L}.png (${buf.length} bytes)`);
}

const titles = {
  A: 'Soylu Tac', B: 'K Monogram', C: 'Krali Mum', D: 'Mum Taci', E: 'Tac Giymis Boga', F: 'Altin Madalyon',
  G: 'Mucevher Taci', H: 'Tac+Mum', I: 'Krali Boga', J: 'K Monogramli', K: 'Altin Muhur', L: '5 Mum', M: 'Hanedan Armasi', N: 'Sehir+Ok'
};
const descs = {
  A: '3-tepe tac + taslar', B: 'K + tac + bullish ok', C: 'Yesil mum + 5-tepe tac', D: '5 mum tek tac (yeni)', E: 'Boga + tac (yeni)', F: 'Sikke / muhru',
  G: 'AI · Mucevherli krali tac', H: 'AI · Krali yesil mum', I: 'AI · Boga + krali tac', J: 'AI · Altin K + tac + ok', K: 'AI · Krali muhur sikke', L: 'AI · 5 mum (gercek mum)', M: 'AI · Hanedan armasi (boga+tac+defne)', N: 'AI · Finans gokdelenleri + ok'
};

const gridHtml = `<!DOCTYPE html><html><head><style>
  html,body{margin:0;padding:0;background:#0a1220;font-family:Segoe UI,sans-serif;color:#fff;}
  .container{padding:28px;}
  h1{font-size:26px;color:#FFD46B;margin:0 0 8px;}
  h2{font-size:18px;color:#93a8c2;margin:18px 0 14px;text-transform:uppercase;letter-spacing:0.1em;font-weight:600;}
  h2 .badge{background:#FFD46B;color:#1a1004;padding:3px 10px;border-radius:6px;font-size:13px;margin-left:8px;}
  .row{display:grid;grid-template-columns:repeat(4,1fr);gap:18px;}
  .item{background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:16px;padding:14px;text-align:center;}
  .item.ai{border-color:rgba(255,212,107,0.25);background:rgba(255,212,107,0.03);}
  .item svg, .item img{width:100%;height:auto;display:block;border-radius:28px;}
  .lbl{margin-top:12px;font-weight:700;color:#FFD46B;font-size:16px;}
  .desc{font-size:11px;color:#93a8c2;margin-top:4px;line-height:1.4;}
</style></head><body><div class="container">
<h1>Borsa Krali — 14 Ikon Konsepti</h1>
<h2>SVG (Vektor) <span class="badge">A-F</span></h2>
<div class="row">
  ${svgLetters.map(L => {
    const svg = readFileSync(resolve(publicDir, `icon-${L}.svg`), 'utf-8');
    return `<div class="item">${svg}<div class="lbl">${L} · ${titles[L]}</div><div class="desc">${descs[L]}</div></div>`;
  }).join('')}
</div>
<h2>AI Uretildi (FLUX) <span class="badge">G-N</span></h2>
<div class="row">
  ${aiLetters.map(L => {
    const buf = readFileSync(resolve(publicDir, `icon-${L}.png`));
    const b64 = buf.toString('base64');
    return `<div class="item ai"><img src="data:image/png;base64,${b64}"><div class="lbl">${L} · ${titles[L]}</div><div class="desc">${descs[L]}</div></div>`;
  }).join('')}
</div>
</div></body></html>`;

await page.setViewportSize({ width: 1600, height: 1400 });
await page.setContent(gridHtml);
await page.waitForLoadState('networkidle');
await page.waitForTimeout(500);
const gridBuf = await page.screenshot({ fullPage: true, type: 'png' });
writeFileSync(resolve(publicDir, 'grid-preview.png'), gridBuf);
console.log(`rendered grid-preview.png (${gridBuf.length} bytes)`);

await browser.close();
console.log('done');
