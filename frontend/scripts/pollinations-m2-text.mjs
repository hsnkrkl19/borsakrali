// Generate M2-style variants — one batch with text prompt, one with blank banner.
import { writeFileSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(__dirname, '..', 'public', 'icon-options');
mkdirSync(outDir, { recursive: true });

const STYLE = 'ios style rounded square app icon 1024x1024, deep navy midnight background subtle radial gradient, rich royal gold metallic, emerald green bullish candlestick accents, ruby red crown jewels, sharp clean professional edges, premium fintech royal heraldic aesthetic, centered balanced composition, production grade, ultra detailed';

const variants = [
  // With explicit text — FLUX sometimes nails short caps text
  {
    id: 'M2T1',
    prompt: `Royal heraldic emblem on dark navy background: a fierce geometric gold bull head with wide sweeping horns wearing an ornate red-and-gold royal crown, flanking the bull on left and right are tall slender bullish green stock candlesticks with thin wicks (3 each side ascending), at the bottom a wide elegant gold ribbon banner with two-letter words clearly readable bold serif capital text "BORSA KRALI", deep navy background. ${STYLE}`,
  },
  {
    id: 'M2T2',
    prompt: `Premium turkish stock market emblem: front-facing geometric gold bull head with horns and royal gold crown on top, two columns of rising green bullish candlesticks flanking the bull like pillars, large gold curved ribbon banner across the bottom with bold clean serif capital letters spelling "BORSA KRALI" perfectly readable, dark navy background. ${STYLE}`,
  },
  // Blank banner — for overlay fallback
  {
    id: 'M2B1',
    prompt: `Royal heraldic emblem on dark navy: fierce geometric gold bull head with sweeping horns and ornate red-gold royal crown, two columns of rising bullish green stock candlesticks (thin wicks, rectangular bodies, ascending heights) flanking on left and right like pillars, at the bottom a large empty smooth elegant gold ribbon banner with no text and no letters, just clean polished gold surface ready for typography overlay. ${STYLE}`,
  },
  {
    id: 'M2B2',
    prompt: `Premium turkish fintech heraldic logo: centered geometric gold bull head with wide horns and royal crown above, flanked by vertical stacks of three rising green bullish stock candlesticks each side, large wide blank gold ribbon banner at the bottom completely empty with no characters no letters no text, just smooth metallic gold surface for clean typography placement, dark navy background. ${STYLE}`,
  },
  {
    id: 'M2B3',
    prompt: `Royal coat of arms: gold bull head with curving horns and small jeweled crown, two vertical green candlestick chart pillars left and right (4 candles each, ascending in height like a bullish trend), an unadorned gold scroll banner ribbon at the bottom completely blank with no writing no glyphs no characters, just shiny embossed gold ready for text, deep navy background. ${STYLE}`,
  },
  {
    id: 'M2B4',
    prompt: `Premium dark fintech badge: gold bull head with horns crowned by detailed royal crown with red ruby gems, vertical columns of three green bullish candlestick bars on each side framing the bull, plain unmarked horizontal gold ribbon banner across the bottom with absolutely no text and no letters, smooth polished gold metal, deep navy background with subtle grid. ${STYLE}`,
  },
];

const BASE = 'https://image.pollinations.ai/prompt/';
const sleep = ms => new Promise(r => setTimeout(r, ms));

for (const v of variants) {
  let ok = false;
  for (let a = 1; a <= 4 && !ok; a++) {
    try {
      const seed = Math.floor(Math.random() * 9999999);
      const url = `${BASE}${encodeURIComponent(v.prompt)}?width=1024&height=1024&model=flux&nologo=true&enhance=true&seed=${seed}`;
      const res = await fetch(url, { redirect: 'follow' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < 5000) throw new Error(`too small`);
      writeFileSync(resolve(outDir, `icon-${v.id}.png`), buf);
      console.log(`✓ icon-${v.id}.png (${(buf.length / 1024).toFixed(0)} KB)`);
      ok = true;
    } catch (e) {
      console.log(`  ${v.id} attempt ${a}: ${e.message}`);
      await sleep(6000 * a);
    }
  }
  await sleep(2500);
}
console.log('done');
