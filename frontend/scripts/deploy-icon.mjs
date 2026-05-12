// Take chosen icon (icon-M2-final-1.png) and generate all required sizes
// for web (favicon, PWA) and Android (mipmaps + adaptive foreground).
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const frontend = resolve(__dirname, '..');
const publicDir = resolve(frontend, 'public');
const androidRes = resolve(frontend, 'android', 'app', 'src', 'main', 'res');

const SOURCE = resolve(publicDir, 'icon-options', 'icon-M2-final-1.png');
const sourceB64 = readFileSync(SOURCE).toString('base64');

async function resize(page, size, opts = {}) {
  const { circular = false, transparent = false, scale = 1 } = opts;
  const innerSize = Math.round(size * scale);
  const offset = Math.round((size - innerSize) / 2);
  const html = `<!DOCTYPE html><html><head><style>
    html,body{margin:0;padding:0;}
    .stage{position:relative;width:${size}px;height:${size}px;background:${transparent ? 'transparent' : 'transparent'};${circular ? `border-radius:50%;overflow:hidden;` : ''}}
    .stage img{position:absolute;left:${offset}px;top:${offset}px;width:${innerSize}px;height:${innerSize}px;display:block;}
  </style></head><body>
    <div class="stage"><img src="data:image/png;base64,${sourceB64}"></div>
  </body></html>`;
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(html);
  await page.waitForTimeout(150);
  const buf = await page.locator('.stage').screenshot({ omitBackground: true });
  return buf;
}

const browser = await chromium.launch();
const page = await browser.newPage();

const tasks = [
  // ---- WEB / PWA ----
  { path: resolve(publicDir, 'icon-master.png'), size: 1024 },
  { path: resolve(publicDir, 'icon-512.png'), size: 512 },
  { path: resolve(publicDir, 'icon-192.png'), size: 192 },
  { path: resolve(publicDir, 'favicon.png'), size: 64 },
  { path: resolve(publicDir, 'logo-borsakrali.png'), size: 256 },
  // ---- ANDROID LEGACY SQUARE ICON ----
  { path: resolve(androidRes, 'mipmap-mdpi', 'ic_launcher.png'), size: 48 },
  { path: resolve(androidRes, 'mipmap-hdpi', 'ic_launcher.png'), size: 72 },
  { path: resolve(androidRes, 'mipmap-xhdpi', 'ic_launcher.png'), size: 96 },
  { path: resolve(androidRes, 'mipmap-xxhdpi', 'ic_launcher.png'), size: 144 },
  { path: resolve(androidRes, 'mipmap-xxxhdpi', 'ic_launcher.png'), size: 192 },
  // ---- ANDROID ROUND ICON ----
  { path: resolve(androidRes, 'mipmap-mdpi', 'ic_launcher_round.png'), size: 48, circular: true },
  { path: resolve(androidRes, 'mipmap-hdpi', 'ic_launcher_round.png'), size: 72, circular: true },
  { path: resolve(androidRes, 'mipmap-xhdpi', 'ic_launcher_round.png'), size: 96, circular: true },
  { path: resolve(androidRes, 'mipmap-xxhdpi', 'ic_launcher_round.png'), size: 144, circular: true },
  { path: resolve(androidRes, 'mipmap-xxxhdpi', 'ic_launcher_round.png'), size: 192, circular: true },
  // ---- ANDROID ADAPTIVE FOREGROUND (scaled 65% to fit safe zone) ----
  { path: resolve(androidRes, 'mipmap-mdpi', 'ic_launcher_foreground.png'), size: 108, scale: 0.65 },
  { path: resolve(androidRes, 'mipmap-hdpi', 'ic_launcher_foreground.png'), size: 162, scale: 0.65 },
  { path: resolve(androidRes, 'mipmap-xhdpi', 'ic_launcher_foreground.png'), size: 216, scale: 0.65 },
  { path: resolve(androidRes, 'mipmap-xxhdpi', 'ic_launcher_foreground.png'), size: 324, scale: 0.65 },
  { path: resolve(androidRes, 'mipmap-xxxhdpi', 'ic_launcher_foreground.png'), size: 432, scale: 0.65 },
];

for (const t of tasks) {
  mkdirSync(dirname(t.path), { recursive: true });
  const buf = await resize(page, t.size, { circular: t.circular, scale: t.scale });
  writeFileSync(t.path, buf);
  console.log(`  ${t.size.toString().padStart(4)}px → ${t.path.replace(frontend, '.')}`);
}

await browser.close();
console.log(`\nDone. Wrote ${tasks.length} files.`);
