import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = resolve(__dirname, '..', 'public', 'icon-options');

const variants = [
  { id: 'M1', title: 'Defne Cellengi', desc: 'Boga + tac + defne yapraklari + gizli yesil oklar' },
  { id: 'M2', title: 'Pillarlı Arma', desc: 'Boga + 2 gercek mum (sutun gibi) + flama' },
  { id: 'M3', title: 'Klasik Heraldik', desc: 'Boga + buyuk taç + defne dallari + flama' },
  { id: 'M4', title: 'Modern Cember', desc: 'Boga + cember + altta YESIL MUM SUTUNLARI (en spesifik!)' },
  { id: 'M5', title: 'Sade Tac', desc: 'Boga + ayri taç + 4 mum + defne' },
  { id: 'M6', title: 'Gercek Grafik', desc: 'Boga + buyuk taç + altta MUM GRAFIGI (premium!)' },
];

const html = `<!DOCTYPE html><html><head><style>
  html,body{margin:0;padding:0;background:#0a1220;font-family:Segoe UI,sans-serif;color:#fff;}
  .container{padding:32px;}
  h1{font-size:30px;color:#FFD46B;margin:0 0 8px;}
  p.sub{color:#93a8c2;margin:0 0 24px;font-size:14px;}
  .row{display:grid;grid-template-columns:repeat(3,1fr);gap:22px;}
  .item{background:rgba(255,212,107,0.05);border:1px solid rgba(255,212,107,0.18);border-radius:18px;padding:18px;text-align:center;}
  .item img{width:100%;height:auto;display:block;border-radius:36px;box-shadow:0 12px 32px rgba(0,0,0,0.5);}
  .lbl{margin-top:14px;font-weight:800;color:#FFD46B;font-size:20px;}
  .desc{font-size:12px;color:#cfd7e3;margin-top:6px;line-height:1.5;}
</style></head><body><div class="container">
<h1>M Konsepti — 6 Varyasyon</h1>
<p class="sub">Boga + Kraliyet Taci + Yukselis Mumlari + Grafik</p>
<div class="row">
  ${variants.map(v => {
    const buf = readFileSync(resolve(publicDir, `icon-${v.id}.png`));
    const b64 = buf.toString('base64');
    return `<div class="item"><img src="data:image/png;base64,${b64}"><div class="lbl">${v.id} · ${v.title}</div><div class="desc">${v.desc}</div></div>`;
  }).join('')}
</div></div></body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setViewportSize({ width: 1400, height: 1300 });
await page.setContent(html);
await page.waitForLoadState('networkidle');
await page.waitForTimeout(500);
const buf = await page.screenshot({ fullPage: true, type: 'png' });
writeFileSync(resolve(publicDir, 'm-variants-grid.png'), buf);
console.log(`grid: ${(buf.length / 1024).toFixed(0)} KB`);
await browser.close();
