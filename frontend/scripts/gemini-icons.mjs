// Generate Borsa Krali app icons via Gemini 2.5 Flash Image (Nano Banana).
// Usage:  GEMINI_API_KEY=xxx node scripts/gemini-icons.mjs

import { writeFileSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(__dirname, '..', 'public', 'icon-options');
mkdirSync(outDir, { recursive: true });

const KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
if (!KEY) {
  console.error('Missing GEMINI_API_KEY env var. Get one at https://aistudio.google.com/apikey');
  process.exit(2);
}

const MODEL = process.env.GEMINI_MODEL || 'gemini-2.0-flash-preview-image-generation';
const URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${KEY}`;

const BRAND = `
Brand: "Borsa Kralı" — Turkish premium stock market analysis platform (turkish word "kral" = king).
Style mandate: ultra clean modern fintech app icon. Vector-feel, flat-with-soft-shading. Bold silhouette readable at 48px.
Color system: deep navy/midnight background (#091A2A → #04101A radial), rich gold metallic (#FFE39A → #F2A41A → #8E4D00 vertical),
optional accent emerald (#22D17E) and ruby (#FF4D6D) for jewels or candle bullishness.
Shape: rounded square iOS-style 1024×1024, ~22% corner radius. Centered subject with breathing room.
Quality: pixel-perfect edges, no text, no letters except an optional stylized "K", no watermarks, no photorealism, no 3D rendering, no shadows leaking outside the rounded square. Production-ready.
`.trim();

const concepts = [
  {
    name: 'gemini-1-crown-arrow',
    prompt: `${BRAND}\nSubject: A regal three-point gold crown centered. The central tallest peak transforms into a sharp upward arrow tip. Three jewels on the crown peaks: ruby left, sapphire center top, emerald right. Below the crown, a solid gold base band. Subtle faint horizontal chart grid lines in the navy background. Premium royal feel. No bull, no candles.`,
  },
  {
    name: 'gemini-2-bull-crown',
    prompt: `${BRAND}\nSubject: Iconic minimalist geometric Wall Street bull head in solid gold, viewed front-on with two sweeping curved horns. A small refined 3-peak crown sits between the horns. Bull eyes are tiny ruby dots. Whole composition centered, balanced, recognizable instantly as a bull. Premium stock market royalty vibe.`,
  },
  {
    name: 'gemini-3-candle-crown',
    prompt: `${BRAND}\nSubject: A single tall thick bullish green candlestick (gradient emerald top to deep green bottom) centered. On top of the candle's upper wick sits a small ornate 5-peak gold crown with tiny gem dots. The candle body has a faint highlight stripe. Background has very subtle horizontal price grid lines. Strong stock-market-royalty symbolism.`,
  },
  {
    name: 'gemini-4-k-monogram',
    prompt: `${BRAND}\nSubject: A bold elegant gold letter "K" centered (serif modern, thick strokes). A small 3-peak gold crown perched on top of the K's vertical stroke. The upper diagonal of the K extends upward into a small arrow tip suggesting bullish growth. Clean monogram, balanced, readable at small sizes. No other letters.`,
  },
  {
    name: 'gemini-5-gold-medallion',
    prompt: `${BRAND}\nSubject: A round embossed gold royal medallion / coin filling most of the icon, with a slightly darker bevel rim and inner highlight. Embossed into the medallion: a small crown at the top center, a stylized "K" letter in the middle, and a tiny rising chart line with arrow at the bottom. Heritage, prestige, collectible feel. Subtle radial highlight upper-left for metal sheen.`,
  },
  {
    name: 'gemini-6-skyline-crown',
    prompt: `${BRAND}\nSubject: A simplified gold city skyline silhouette at the bottom (3–5 abstract building towers, like Istanbul finance district), and rising from behind the central tallest tower, a 3-peak crown integrated as the tower's top. Subtle upward green arrow on the right side. Bottom navy with thin chart grid. Sophisticated, modern fintech.`,
  },
];

async function generate(name, prompt) {
  const body = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: { responseModalities: ['TEXT', 'IMAGE'] },
  };
  const res = await fetch(URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`HTTP ${res.status} for ${name}: ${txt.slice(0, 400)}`);
  }
  const json = await res.json();
  const parts = json.candidates?.[0]?.content?.parts ?? [];
  const imgPart = parts.find(p => p.inlineData || p.inline_data);
  if (!imgPart) {
    throw new Error(`No image in response for ${name}: ${JSON.stringify(json).slice(0, 400)}`);
  }
  const data = imgPart.inlineData || imgPart.inline_data;
  const buf = Buffer.from(data.data, 'base64');
  const ext = (data.mimeType || data.mime_type || 'image/png').includes('jpeg') ? 'jpg' : 'png';
  const path = resolve(outDir, `${name}.${ext}`);
  writeFileSync(path, buf);
  console.log(`✓ ${name}.${ext} (${buf.length} bytes)`);
  return path;
}

const args = process.argv.slice(2);
const selected = args.length ? concepts.filter(c => args.some(a => c.name.includes(a))) : concepts;

console.log(`Generating ${selected.length} icon(s) via ${MODEL}…`);
for (const c of selected) {
  try {
    await generate(c.name, c.prompt);
  } catch (e) {
    console.error(`✗ ${c.name}: ${e.message}`);
  }
}
console.log('done');
