// Generate all Android splash.png variants from icon-master.png.
// Layout: deep navy background #091722, centered icon at ~38% of shorter side.
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const frontend = resolve(__dirname, '..');
const androidRes = resolve(frontend, 'android', 'app', 'src', 'main', 'res');

const sourceB64 = readFileSync(resolve(frontend, 'public', 'icon-master.png')).toString('base64');

const targets = [
  { dir: 'drawable',                w: 480,  h: 320  },
  { dir: 'drawable-port-mdpi',      w: 320,  h: 480  },
  { dir: 'drawable-port-hdpi',      w: 480,  h: 800  },
  { dir: 'drawable-port-xhdpi',     w: 720,  h: 1280 },
  { dir: 'drawable-port-xxhdpi',    w: 960,  h: 1600 },
  { dir: 'drawable-port-xxxhdpi',   w: 1280, h: 1920 },
  { dir: 'drawable-land-mdpi',      w: 480,  h: 320  },
  { dir: 'drawable-land-hdpi',      w: 800,  h: 480  },
  { dir: 'drawable-land-xhdpi',     w: 1280, h: 720  },
  { dir: 'drawable-land-xxhdpi',    w: 1600, h: 960  },
  { dir: 'drawable-land-xxxhdpi',   w: 1920, h: 1280 },
];

const browser = await chromium.launch();
const page = await browser.newPage();

for (const t of targets) {
  const iconPx = Math.round(Math.min(t.w, t.h) * 0.38);
  const html = `<!DOCTYPE html><html><head><style>
    html,body{margin:0;padding:0;}
    .stage{position:relative;width:${t.w}px;height:${t.h}px;background:radial-gradient(circle at 50% 50%, #0F2D45 0%, #091722 60%, #04101B 100%);display:flex;align-items:center;justify-content:center;}
    .stage img{width:${iconPx}px;height:${iconPx}px;display:block;border-radius:${Math.round(iconPx * 0.22)}px;box-shadow:0 12px 40px rgba(245,180,36,0.18);}
  </style></head><body>
    <div class="stage"><img src="data:image/png;base64,${sourceB64}"></div>
  </body></html>`;
  await page.setViewportSize({ width: t.w, height: t.h });
  await page.setContent(html);
  await page.waitForTimeout(200);
  const buf = await page.locator('.stage').screenshot();
  const out = resolve(androidRes, t.dir, 'splash.png');
  writeFileSync(out, buf);
  console.log(`  ${t.w}×${t.h} → ${t.dir}/splash.png (${(buf.length / 1024).toFixed(0)} KB)`);
}

await browser.close();
console.log(`\nDone. ${targets.length} splash files written.`);
