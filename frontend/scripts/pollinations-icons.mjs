// Generate icon concepts via Pollinations.ai (free, no auth, FLUX model).
// Usage:  node scripts/pollinations-icons.mjs

import { writeFileSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(__dirname, '..', 'public', 'icon-options');
mkdirSync(outDir, { recursive: true });

const STYLE = 'flat vector app icon, ios style rounded square 1024x1024, deep navy midnight background with subtle radial gradient, rich royal gold metallic palette, emerald green and ruby accents only where stated, sharp clean edges, no text no letters no watermark no signature, premium fintech aesthetic, centered subject with breathing room, professional production grade, no photorealism, no 3d render, no human figures';

const concepts = [
  { id: 'G', name: 'crown-throne', prompt: `Majestic royal gold crown with three sharp peaks, the center peak transforms into a sharp upward arrow tip, ruby diamond sapphire jewels on each peak, sitting on a thick gold base band, behind the crown subtle faint translucent stock candlestick chart silhouette, dark navy background. ${STYLE}` },
  { id: 'H', name: 'candle-king', prompt: `One tall bold solid emerald green bullish candlestick centered, with a small ornate gold crown of five peaks placed on top of the candle wick like a king crown on a head, ruby jewel on center peak, faint chart grid lines, dark navy background. ${STYLE}` },
  { id: 'I', name: 'bull-crown', prompt: `Iconic minimalist geometric Wall Street bull head silhouette in solid gold, two wide spreading sharp horns, fierce eyes, strong muzzle, between the horns a small refined three-peak royal gold crown with jewels, dark navy background. ${STYLE}` },
  { id: 'J', name: 'k-monogram', prompt: `One bold elegant solid gold letter K monogram centered, with a small ornate three-peak gold crown sitting on top of the K vertical stroke, upper diagonal of K extends as a small sharp arrow tip suggesting bullish growth, dark navy background. ${STYLE}` },
  { id: 'K', name: 'medallion-seal', prompt: `Large round embossed gold royal medallion coin filling most of the icon, beveled rim, embossed into the coin face an ornate crown at the top, a stylized K monogram in the center, and a tiny rising arrow chart line below, deep navy background, soft metallic highlight upper-left. ${STYLE}` },
  { id: 'L', name: 'crown-of-candles', prompt: `Five candlesticks arranged side by side forming the shape of a royal crown, the central tallest candle is bullish green, two flanking are gold, two outer are smaller red, wicks pointing up like crown spikes each topped with tiny jewel, gold base band beneath, dark navy background. ${STYLE}` },
  { id: 'M', name: 'lion-bull-shield', prompt: `Heraldic gold shield emblem centered, embossed inside the shield a stylized bull head with horns and a royal crown above, two laurel leaves on either side, deep navy background, premium fintech royal coat of arms style. ${STYLE}` },
  { id: 'N', name: 'arrow-crown-skyline', prompt: `Stylized gold city skyline silhouette of three tall geometric finance towers at the bottom, the tallest center tower has a royal crown integrated as its peak, an upward green bullish arrow rising on the right side, dark navy background with faint chart grid. ${STYLE}` },
];

const BASE = 'https://image.pollinations.ai/prompt/';

async function generate(c) {
  const encoded = encodeURIComponent(c.prompt);
  const url = `${BASE}${encoded}?width=1024&height=1024&model=flux&nologo=true&enhance=true&seed=${Math.floor(Math.random() * 9999999)}`;
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${c.id}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 5000) throw new Error(`Suspiciously small output for ${c.id}: ${buf.length} bytes`);
  const path = resolve(outDir, `icon-${c.id}.png`);
  writeFileSync(path, buf);
  console.log(`✓ icon-${c.id}.png (${c.name}, ${(buf.length / 1024).toFixed(0)} KB)`);
}

const args = process.argv.slice(2);
const selected = args.length ? concepts.filter(c => args.includes(c.id)) : concepts;
console.log(`Generating ${selected.length} icons via Pollinations (FLUX)…`);

// Run in parallel batches of 3
for (let i = 0; i < selected.length; i += 3) {
  const batch = selected.slice(i, i + 3);
  await Promise.all(batch.map(async c => {
    try { await generate(c); } catch (e) { console.error(`✗ ${c.id}: ${e.message}`); }
  }));
}
console.log('done');
