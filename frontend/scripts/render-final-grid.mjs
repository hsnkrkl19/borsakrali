import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dir = resolve(__dirname, '..', 'public', 'icon-options');

const items = [
  { id: 'M2-final-1', title: '1 · Cinzel + Koyu Kahve', desc: 'Klasik kraliyet serif, kahverengi → altinla erken kaynasiyor, premium hissi' },
  { id: 'M2-final-2', title: '2 · Cormorant SC + Siyah', desc: 'Daha kalin, daha okunabilir, yuksek kontrast' },
  { id: 'M2-final-3', title: '3 · Playfair + Koyu', desc: 'Yuksek kontrast italyan serif, modern luks' },
  { id: 'M2-final-4', title: '4 · Cinzel + Altin Kabartma', desc: 'Altin uzerine altin embossed, dusuk kontrast ama heraldik' },
];

const html = `<!DOCTYPE html><html><head><style>
  html,body{margin:0;padding:0;background:#0a1220;font-family:Segoe UI,sans-serif;color:#fff;}
  .container{padding:32px;}
  h1{font-size:32px;color:#FFD46B;margin:0 0 8px;}
  p.sub{color:#93a8c2;margin:0 0 28px;font-size:14px;}
  .row{display:grid;grid-template-columns:repeat(2,1fr);gap:28px;max-width:1300px;margin:0 auto;}
  .item{background:rgba(255,212,107,0.05);border:1px solid rgba(255,212,107,0.18);border-radius:20px;padding:24px;text-align:center;}
  .item img{width:100%;height:auto;display:block;border-radius:38px;box-shadow:0 16px 40px rgba(0,0,0,0.6);}
  .lbl{margin-top:18px;font-weight:800;color:#FFD46B;font-size:22px;}
  .desc{font-size:13px;color:#cfd7e3;margin-top:8px;line-height:1.5;}
</style></head><body><div class="container">
<h1>BORSA KRALI — Tipografi Secenekleri</h1>
<p class="sub">Aynı kompozisyon (M2B4), farklı font/renk uygulamalari · Hangisi sence en güzel?</p>
<div class="row">
  ${items.map(v => {
    const buf = readFileSync(resolve(dir, `icon-${v.id}.png`));
    return `<div class="item"><img src="data:image/png;base64,${buf.toString('base64')}"><div class="lbl">${v.title}</div><div class="desc">${v.desc}</div></div>`;
  }).join('')}
</div></div></body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setViewportSize({ width: 1400, height: 1500 });
await page.setContent(html);
await page.waitForLoadState('networkidle');
await page.waitForTimeout(500);
const buf = await page.screenshot({ fullPage: true });
writeFileSync(resolve(dir, 'final-typography-grid.png'), buf);
console.log(`grid: ${(buf.length / 1024).toFixed(0)} KB`);
await browser.close();
