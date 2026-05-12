// Sequential retry with delay for Pollinations icons.
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(__dirname, '..', 'public', 'icon-options');
mkdirSync(outDir, { recursive: true });

const STYLE = 'flat vector app icon, ios style rounded square 1024x1024, deep navy midnight background with subtle radial gradient, rich royal gold metallic palette, emerald green and ruby accents only where stated, sharp clean edges, no text no letters no watermark no signature, premium fintech aesthetic, centered subject with breathing room, professional production grade, no photorealism, no 3d render, no human figures';

const concepts = [
  { id: 'G', prompt: `Majestic royal gold crown with three sharp peaks, the center peak transforms into a sharp upward arrow tip, ruby diamond sapphire jewels on each peak, sitting on a thick gold base band, behind the crown subtle faint translucent stock candlestick chart silhouette, dark navy background. ${STYLE}` },
  { id: 'I', prompt: `Iconic minimalist geometric Wall Street bull head silhouette in solid gold, two wide spreading sharp horns, fierce eyes, strong muzzle, between the horns a small refined three-peak royal gold crown with jewels, dark navy background. ${STYLE}` },
  { id: 'K', prompt: `Large round embossed gold royal medallion coin filling most of the icon, beveled rim, embossed into the coin face an ornate crown at the top, a stylized K monogram in the center, and a tiny rising arrow chart line below, deep navy background, soft metallic highlight upper-left. ${STYLE}` },
  { id: 'L', prompt: `Five candlesticks arranged side by side forming the shape of a royal crown, the central tallest candle is bullish green, two flanking are gold, two outer are smaller red, wicks pointing up like crown spikes each topped with tiny jewel, gold base band beneath, dark navy background. ${STYLE}` },
  { id: 'N', prompt: `Stylized gold city skyline silhouette of three tall geometric finance towers at the bottom, the tallest center tower has a royal crown integrated as its peak, an upward green bullish arrow rising on the right side, dark navy background with faint chart grid. ${STYLE}` },
];

const BASE = 'https://image.pollinations.ai/prompt/';
const sleep = ms => new Promise(r => setTimeout(r, ms));

for (const c of concepts) {
  const file = resolve(outDir, `icon-${c.id}.png`);
  if (existsSync(file)) {
    const { statSync } = await import('fs');
    if (statSync(file).size > 20000) {
      console.log(`= ${c.id} already exists, skipping`);
      continue;
    }
  }
  let success = false;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const seed = Math.floor(Math.random() * 9999999);
      const url = `${BASE}${encodeURIComponent(c.prompt)}?width=1024&height=1024&model=flux&nologo=true&enhance=true&seed=${seed}`;
      const res = await fetch(url, { redirect: 'follow' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < 5000) throw new Error(`too small (${buf.length}b)`);
      writeFileSync(file, buf);
      console.log(`✓ icon-${c.id}.png (${(buf.length / 1024).toFixed(0)} KB, attempt ${attempt})`);
      success = true;
      break;
    } catch (e) {
      console.log(`  ${c.id} attempt ${attempt} failed: ${e.message}`);
      await sleep(8000 * attempt);
    }
  }
  if (!success) console.error(`✗ ${c.id}: all attempts failed`);
  await sleep(3000);
}
console.log('done');
