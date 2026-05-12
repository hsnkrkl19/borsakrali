// Big inspection image with thick gridlines every 50px
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dir = resolve(__dirname, '..', 'public', 'icon-options');
const baseB64 = readFileSync(resolve(dir, 'icon-M2B4.png')).toString('base64');

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1024, height: 1024 } });
const html = `<!DOCTYPE html><html><head><style>
  html,body{margin:0;padding:0;}
  .wrap{position:relative;width:1024px;height:1024px;}
  .wrap img{width:1024px;height:1024px;display:block;position:absolute;inset:0;}
  .grid div{position:absolute;left:0;right:0;border-top:2px solid rgba(255,0,0,0.7);font-size:22px;color:#ff0;background:rgba(0,0,0,0.6);padding:2px 6px;font-weight:bold;font-family:monospace;}
</style></head><body>
<div class="wrap">
  <img src="data:image/png;base64,${baseB64}">
  <div class="grid">
    ${Array.from({ length: 21 }, (_, i) => `<div style="top:${i * 50}px">y=${i * 50}</div>`).join('')}
  </div>
</div>
</body></html>`;
await page.setContent(html);
await page.waitForTimeout(400);
const buf = await page.screenshot({ clip: { x: 0, y: 0, width: 1024, height: 1024 } });
writeFileSync(resolve(dir, 'inspect-banner2.png'), buf);
console.log('done');
await browser.close();
