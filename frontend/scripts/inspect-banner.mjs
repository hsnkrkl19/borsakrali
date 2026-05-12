// Display M2B4 at full size to find banner coordinates
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dir = resolve(__dirname, '..', 'public', 'icon-options');
const baseB64 = readFileSync(resolve(dir, 'icon-M2B4.png')).toString('base64');

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1100, height: 1100 } });
const html = `<!DOCTYPE html><html><head><style>
  html,body{margin:0;padding:0;background:#222;font-family:monospace;color:#fff;}
  .wrap{position:relative;width:1024px;height:1024px;margin:38px;}
  .wrap img{width:1024px;height:1024px;display:block;}
  .ruler-y{position:absolute;left:-30px;width:24px;font-size:12px;}
  .grid{position:absolute;inset:0;pointer-events:none;}
  .grid div{position:absolute;left:0;right:0;border-top:1px dashed rgba(255,80,80,0.4);font-size:11px;color:#ff8;padding-left:4px;}
</style></head><body>
<div class="wrap">
  <img src="data:image/png;base64,${baseB64}">
  <div class="grid">
    ${Array.from({ length: 11 }, (_, i) => `<div style="top:${i * 100}px">y=${i * 100}</div>`).join('')}
  </div>
</div>
</body></html>`;
await page.setContent(html);
await page.waitForTimeout(400);
const buf = await page.screenshot({ fullPage: true, type: 'png' });
writeFileSync(resolve(dir, 'inspect-banner.png'), buf);
console.log('done');
await browser.close();
