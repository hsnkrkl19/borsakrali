// Generate variations of icon M — heraldic Borsa Kralı emblem.
import { writeFileSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(__dirname, '..', 'public', 'icon-options');
mkdirSync(outDir, { recursive: true });

const STYLE = 'ios style rounded square app icon 1024x1024, deep navy midnight background with subtle radial gradient, rich royal gold metallic palette with bright emerald green candlestick accents and small ruby red highlights, sharp clean professional edges, no readable text or letters or watermark or signature, premium fintech royal aesthetic, centered balanced composition with breathing room, production grade, ultra detailed, no photorealism';

const variants = [
  {
    id: 'M1',
    name: 'candle-wreath',
    prompt: `Heraldic royal coat of arms emblem for a premium turkish stock market platform, centered: a fierce geometric gold bull head silhouette with wide spreading sharp horns, an ornate royal gold crown with red ruby jewel on top of the bull head between the horns, surrounding the bull on both sides instead of laurel leaves there are upward bullish green candlesticks arranged like a wreath (3 candles each side, ascending in height toward the top), beneath the bull a clean upward green stock chart line with arrow tip rising right. ${STYLE}`,
  },
  {
    id: 'M2',
    name: 'shield-with-candles',
    prompt: `Royal heraldic emblem: ornate gold shield in the center, embossed onto the shield a bull head with horns wearing a small royal crown, flanking the shield on left and right are three rising bullish green candlesticks each side arranged vertically like decorative pillars, at the bottom a banner with three small stylized candlestick bars (red small, gold medium, green tall) representing market movement, deep navy background. Premium turkish finance brand emblem. ${STYLE}`,
  },
  {
    id: 'M3',
    name: 'candle-laurel-bull',
    prompt: `Heraldic coat of arms for "Borsa Kralı" turkish stock king: front-facing gold geometric bull head with wide horns crowned by a royal red-and-gold crown, on either side instead of laurel leaves there are stylized rising green bullish candlestick branches with wicks pointing outward, at the bottom a small flat gold ribbon and beneath it a sharp green arrow pointing up-right rising over a faint chart line. Dark navy background. ${STYLE}`,
  },
  {
    id: 'M4',
    name: 'minimal-shield-bull',
    prompt: `Minimalist modern royal emblem badge: large round gold medallion frame, inside a stylized geometric bull silhouette in gold with prominent curved horns and a small jeweled crown on top, behind the bull a clean upward green chart line with arrow tip, framing the medallion on each side three vertical green bullish candlesticks like supporting columns. Premium fintech brand mark. Deep navy background. ${STYLE}`,
  },
  {
    id: 'M5',
    name: 'compact-emblem',
    prompt: `Compact royal stock market emblem on dark navy: at the top a small ornate gold crown with red ruby, in the middle a geometric gold bull head with sweeping horns, beneath the bull three rising green candlesticks (small medium tall) forming a podium with a clean white wick on each, on the sides minimal gold laurel sprigs. Balanced symmetric heraldic composition. ${STYLE}`,
  },
  {
    id: 'M6',
    name: 'crown-bull-chart',
    prompt: `Premium stock market royal emblem: a fierce geometric solid gold bull head front view with wide spreading horns wearing a detailed royal gold crown with ruby and emerald jewels, beneath the bull head an arched arrangement of three rising bullish green candlesticks forming a small skyline, at the very bottom a thin elegant gold chart line ascending with arrow tip, framed by subtle ornate gold filigree, deep midnight navy background with faint chart grid. Heraldic. ${STYLE}`,
  },
];

const BASE = 'https://image.pollinations.ai/prompt/';
const sleep = ms => new Promise(r => setTimeout(r, ms));

for (const v of variants) {
  let ok = false;
  for (let attempt = 1; attempt <= 4 && !ok; attempt++) {
    try {
      const seed = Math.floor(Math.random() * 9999999);
      const url = `${BASE}${encodeURIComponent(v.prompt)}?width=1024&height=1024&model=flux&nologo=true&enhance=true&seed=${seed}`;
      const res = await fetch(url, { redirect: 'follow' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < 5000) throw new Error(`too small`);
      writeFileSync(resolve(outDir, `icon-${v.id}.png`), buf);
      console.log(`✓ icon-${v.id}.png (${v.name}, ${(buf.length / 1024).toFixed(0)} KB)`);
      ok = true;
    } catch (e) {
      console.log(`  ${v.id} attempt ${attempt} failed: ${e.message}`);
      await sleep(6000 * attempt);
    }
  }
  if (!ok) console.error(`✗ ${v.id} failed all attempts`);
  await sleep(2500);
}
console.log('done');
