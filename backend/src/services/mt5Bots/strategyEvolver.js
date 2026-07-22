'use strict';

/**
 * strategyEvolver — "STRATEJİ GELİŞTİREN" bot çekirdeği (walk-forward şampiyon).
 *
 * Kullanıcı isteği: "MT5'te emir açan VE strateji geliştiren bot istiyorum."
 * Bu bot sabit bir stratejiyle işlem yapmaz; her enstrüman×TF hücresi için bir
 * VARYANT HAVUZUNU (klasik motorlar + indikatör kombinasyonları) son ~240
 * kapalı bar üzerinde yürüyerek (walk-forward) test eder, hücrenin ŞAMPİYONUNU
 * seçer ve yalnız şampiyonun güncel sinyalini verir.
 *
 * Overfitting korumaları (adversaryal inceleme bulgularıyla sertleştirildi —
 * ilk sürümde saf gürültüde hücrelerin %57'si "şampiyon" üretiyordu):
 *  - HOLDOUT: pencere %60 seçim (IS) + %40 doğrulama (OOS) bölünür; şampiyon
 *    IS'te seçilir, OOS'ta POZİTİF netR + ≥2 işlemle TEYİT edilmeden olamaz.
 *  - MALİYET: her işlemden SIM_COST_R (0.1R) sürtünme düşülür — sıfır-kenar
 *    varyantların beklentisi negatife döner (spread/slippage/cron gecikmesi).
 *  - PF=99 deliği kapalı: IS'te en az bir KAYIP görülmeden (grossLoss>0)
 *    şampiyonluk yok — küçük sıfır-kayıplı örneklem otomatik geçemez.
 *  - Seçim skoru netR/√işlem (SQN vekili) — yüksek-frekans varyantın salt
 *    fırsat-sayısı avantajı törpülenir.
 *  - Açık kalan son işlem mark-to-market SAYILIR (iyimser kesim yok).
 *  - Aynı barda SL+TP çakışması KÖTÜMSER sayılır (SL kabul edilir).
 *  - İnce veri koruması: seri < MIN_OPT_BARS ise yeniden-optimizasyon YAPILMAZ,
 *    mevcut şampiyon korunur (Yahoo kısa dönüş olayları iyi şampiyonu silmesin).
 *  - Şampiyon 6 saatte bir tazelenir; turda en çok MAX_CELLS_PER_RUN hücre.
 *
 * Durum kalıcıdır: data/mt5-bots/learning.json + botPersistence('mt5-bots').
 */

const fs = require('fs');
const path = require('path');

const { evaluate } = require('../botBuilder/customBotEngine');
const { evaluateStrategy } = require('./strategyEngines');
const { getInstrument } = require('../forex/forexInstruments');
const botPersistence = require('../botPersistence');

// botPersistence DATA_ROOT (BOT_DATA_DIR) ile AYNI kökü kullan — aksi halde
// prod'da restore edilen learning.json evolver'ın okumadığı yola iner.
const DATA_DIR = process.env.MT5_BOTS_DATA_DIR
  || path.join(process.env.BOT_DATA_DIR || path.join(__dirname, '..', '..', 'data'), 'mt5-bots');
const STATE_FILE = path.join(DATA_DIR, 'learning.json');

const REOPT_MS = 6 * 60 * 60 * 1000; // hücre şampiyonu 6 saatte bir tazelenir
const MAX_CELLS_PER_RUN = 6;         // tur başına yeniden-optimizasyon tavanı
const SIM_BARS = 240;                // walk-forward penceresi (kapalı bar)
const WARMUP = 60;                   // simülasyonun başlamadığı ısınma barı
const MIN_OPT_BARS = 280;            // bundan kısa seride yeniden-optimizasyon YOK
const IS_RATIO = 0.6;                // pencerenin ilk %60'ı seçim (IS), kalanı doğrulama (OOS)
const SIM_COST_R = 0.1;             // işlem başına sürtünme kesintisi (R cinsinden)
const MIN_TRADES = 6;                // IS asgari işlem
const MIN_PF = 1.25;                 // toplam asgari profit factor
const IS_MIN_PF = 1.3;               // IS asgari profit factor (seçilim yanlılığı payı)
const OOS_MIN_TRADES = 2;            // OOS asgari işlem (pozitif netR şartıyla)

// ── VARYANT HAVUZU ────────────────────────────────────────────────────────────
// kind:'classic' → strategyEngines.evaluateStrategy(strategyId, candles, params+ctx)
// kind:'votes'   → customBotEngine.evaluate(candles, def)
const VARIANTS = [
  { id: 'turtle-20', kind: 'classic', strategyId: 'turtle', params: { fast: 20, slow: 55 } },
  { id: 'turtle-40', kind: 'classic', strategyId: 'turtle', params: { fast: 40, slow: 55 } },
  { id: 'squeeze-4', kind: 'classic', strategyId: 'squeeze', params: { minBars: 4 } },
  { id: 'squeeze-6', kind: 'classic', strategyId: 'squeeze', params: { minBars: 6 } },
  { id: 'rsi2', kind: 'classic', strategyId: 'rsi2', params: {} },
  { id: 'tsmom-90', kind: 'classic', strategyId: 'tsmom', params: { lookback: 90 } },
  { id: 'tsmom-60', kind: 'classic', strategyId: 'tsmom', params: { lookback: 60 } },
  { id: 'holygrail-30', kind: 'classic', strategyId: 'holygrail', params: { adxMin: 30 } },
  { id: 'holygrail-25', kind: 'classic', strategyId: 'holygrail', params: { adxMin: 25 } },
  { id: 'heikin-3', kind: 'classic', strategyId: 'heikin', params: { streak: 3 } },
  { id: 'alligator', kind: 'classic', strategyId: 'alligator', params: {} },
  { id: 'votes-trend', kind: 'votes', def: { indicators: ['ema', 'adx', 'supertrend'], logic: 'all', atrSlMult: 1.8, atrTpMult: 3.2 } },
  { id: 'votes-momentum', kind: 'votes', def: { indicators: ['macd', 'rsi', 'adx'], logic: 'majority', atrSlMult: 1.5, atrTpMult: 2.8 } },
  { id: 'votes-reversion', kind: 'votes', def: { indicators: ['bollinger', 'stoch', 'rsi'], logic: 'all', atrSlMult: 1.5, atrTpMult: 2.5 } },
];
const VARIANT_BY_ID = new Map(VARIANTS.map((v) => [v.id, v]));

// ctx = { tf, cls } — klasik motorlara İLETİLMEK ZORUNDA: aksi halde TSMOM'un
// kripto-long-only kapısı ve RSI2'nin TF-eşiği bypass olur (inceleme bulgusu).
function evalVariant(variant, candles, ctx) {
  if (variant.kind === 'classic') {
    return evaluateStrategy(variant.strategyId, candles, { ...variant.params, ...(ctx || {}) });
  }
  try { return evaluate(candles, variant.def); } catch (_) { return null; }
}

// ── durum ─────────────────────────────────────────────────────────────────────
let state = null;

function load() {
  if (state) return state;
  try {
    state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    if (!state || typeof state !== 'object' || !state.cells) state = { version: 2, cells: {} };
  } catch (_) {
    state = { version: 2, cells: {} };
  }
  return state;
}

function persist() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(STATE_FILE, JSON.stringify(state), 'utf8');
  } catch (_) { /* disk hatası sinyal turunu düşürmesin */ }
  try { botPersistence.save('mt5-bots', 'learning.json', state); } catch (_) {}
}

function cellKey(instrumentId, tf) { return `${instrumentId}:${tf}`; }

// ── walk-forward simülasyonu ─────────────────────────────────────────────────
// Varyantı geçmiş barlarda "o gün görebileceği veriyle" değerlendirir; sinyal
// çıkan bardan ileriye SL/TP taramasıyla sonucu (R cinsinden, SIM_COST_R
// düşülmüş) bulur. Pozisyon açıkken yeni sinyal alınmaz. Pencere sonunda hâlâ
// açık işlem mark-to-market kapatılıp SAYILIR (iyimser kesim yapılmaz).
function simulate(variant, candles, ctx) {
  const n = candles.length;
  const start = Math.max(WARMUP, n - SIM_BARS);
  const trades = []; // { entryIdx, outcome }

  let j = start;
  while (j < n - 1) {
    const sig = evalVariant(variant, candles.slice(0, j + 1), ctx);
    if (!sig || !(sig.entry > 0) || !(sig.stop > 0) || !(sig.target1 > 0)) { j++; continue; }
    const risk = Math.abs(sig.entry - sig.stop);
    const reward = Math.abs(sig.target1 - sig.entry);
    if (!(risk > 0) || !(reward > 0)) { j++; continue; }
    const rr = reward / risk;
    const dir = sig.direction === 'long' ? 1 : -1;

    let outcome = null, exitAt = n - 1;
    for (let k = j + 1; k < n; k++) {
      const barK = candles[k];
      const hitSL = sig.direction === 'long' ? barK.low <= sig.stop : barK.high >= sig.stop;
      const hitTP = sig.direction === 'long' ? barK.high >= sig.target1 : barK.low <= sig.target1;
      if (hitSL) { outcome = -1; exitAt = k; break; }      // SL+TP aynı barda → KÖTÜMSER: SL sayılır
      if (hitTP) { outcome = rr; exitAt = k; break; }
    }
    if (outcome === null) {
      // Pencere bitti, işlem açık → mark-to-market (gerçekleşmemiş K/Z sayılır).
      const mtm = ((candles[n - 1].close - sig.entry) / risk) * dir;
      outcome = Math.max(-1, Math.min(rr, mtm));
      exitAt = n - 1;
    }
    trades.push({ entryIdx: j, outcome: outcome - SIM_COST_R });
    j = exitAt + 1;
  }

  return { trades, stats: aggregate(trades) };
}

function aggregate(trades) {
  let grossWin = 0, grossLoss = 0, wins = 0, netR = 0;
  for (const t of trades) {
    netR += t.outcome;
    if (t.outcome > 0) { wins++; grossWin += t.outcome; } else { grossLoss += -t.outcome; }
  }
  const pf = grossLoss > 0 ? grossWin / grossLoss : (grossWin > 0 ? 99 : 0);
  return {
    trades: trades.length, wins,
    netR: Math.round(netR * 100) / 100,
    pf: Math.round(pf * 100) / 100,
    grossLoss: Math.round(grossLoss * 100) / 100,
  };
}

/**
 * Hücre için tüm varyantları yarıştır → şampiyon | null (kanıt yoksa SUSAR).
 * Seçim IS'te (pencerenin ilk %60'ı), teyit OOS'ta (kalan %40) yapılır.
 */
function optimizeCell(candles, ctx) {
  const n = candles.length;
  const start = Math.max(WARMUP, n - SIM_BARS);
  const boundary = start + Math.floor((n - start) * IS_RATIO);

  let best = null;
  const scores = [];
  for (const variant of VARIANTS) {
    const { trades, stats } = simulate(variant, candles, ctx);
    const isStats = aggregate(trades.filter((t) => t.entryIdx < boundary));
    const oosStats = aggregate(trades.filter((t) => t.entryIdx >= boundary));
    scores.push({ id: variant.id, trades: stats.trades, netR: stats.netR, pf: stats.pf });

    // KAPILAR (hepsi birden): IS kanıtı + OOS teyidi + toplam kalite.
    if (isStats.trades < MIN_TRADES) continue;
    if (isStats.pf < IS_MIN_PF || isStats.netR <= 0) continue;
    // PF=99 deliği: sıfır-kayıp yalnız KÜÇÜK örneklemde şüphelidir (gürültüde
    // 6-8 işlemlik şanslı seriler); IS'te ≥10 işlemle sıfır-kayıp gerçek
    // kanıttır ve güçlü trend hücresini susturmamak gerekir.
    if (!(isStats.grossLoss > 0) && isStats.trades < 10) continue;
    if (oosStats.trades < OOS_MIN_TRADES || oosStats.netR <= 0) continue;
    if (stats.pf < MIN_PF || stats.netR <= 0) continue;

    const score = isStats.netR / Math.sqrt(isStats.trades); // SQN vekili
    if (!best || score > best.score) {
      best = {
        variantId: variant.id, score: Math.round(score * 100) / 100,
        trades: stats.trades, wins: stats.wins, netR: stats.netR, pf: stats.pf,
        is: isStats, oos: oosStats,
      };
    }
  }
  return { champion: best, scores };
}

/**
 * Bir enstrüman×TF hücresi için sinyal üret. Şampiyon bayatsa (REOPT_MS), tur
 * bütçesi izin veriyorsa VE veri yeterliyse (MIN_OPT_BARS) önce yeniden
 * optimize eder; veri kısaysa mevcut şampiyon korunur.
 * Dönüş: sinyal | null. Sinyalde strategy = 'evolver' (positionKey sabit),
 * variantId + championStats şeffaflık için taşınır.
 */
function evaluateCell(instrumentId, tf, candles, budget, nowMs) {
  if (!Array.isArray(candles) || candles.length < WARMUP + 40) return null;
  load();
  const key = cellKey(instrumentId, tf);
  const now = nowMs || Date.now();
  const ctx = { tf, cls: getInstrument(instrumentId)?.class };
  let cell = state.cells[key];

  const stale = !cell || !(now - (cell.optimizedAt || 0) < REOPT_MS);
  if (stale && budget.cells > 0 && candles.length >= MIN_OPT_BARS) {
    budget.cells--;
    const { champion, scores } = optimizeCell(candles, ctx);
    cell = state.cells[key] = { optimizedAt: now, champion, scores };
    persist();
  }
  if (!cell || !cell.champion) return null;

  const variant = VARIANT_BY_ID.get(cell.champion.variantId);
  if (!variant) return null;
  const sig = evalVariant(variant, candles, ctx);
  if (!sig) return null;

  // Güven: motor tabanı + şampiyonun kanıt gücü (netR + PF katkısı).
  const bonus = Math.min(12, cell.champion.netR * 1.5) + Math.min(6, (cell.champion.pf - 1) * 5);
  return {
    ...sig,
    confidence: Math.max(0, Math.min(100, Math.round((sig.confidence || 55) * 0.6 + 25 + bonus))),
    // strategy SABİT kalır: positionKey (strateji|sembol|TF) şampiyon değişince
    // kaymasın — aksi halde aynı hücrede iki açık pozisyon (iç hedge) oluşabilir.
    strategy: 'evolver',
    variantId: variant.id,
    championStats: { ...cell.champion },
  };
}

/** Tur bütçesi — runEvolver her turda bunu bir kez yaratıp hücrelere geçirir. */
function newBudget() { return { cells: MAX_CELLS_PER_RUN }; }

/** Panel/rapor için hücre durum özeti. */
function summary() {
  load();
  const cells = Object.entries(state.cells).map(([key, cell]) => ({
    cell: key,
    champion: cell.champion ? cell.champion.variantId : null,
    netR: cell.champion ? cell.champion.netR : null,
    pf: cell.champion ? cell.champion.pf : null,
    trades: cell.champion ? cell.champion.trades : null,
    oosNetR: cell.champion?.oos ? cell.champion.oos.netR : null,
    optimizedAt: cell.optimizedAt ? new Date(cell.optimizedAt).toISOString() : null,
  }));
  return { cells, variants: VARIANTS.map((v) => v.id) };
}

function _dangerouslyResetForTest() { state = { version: 2, cells: {} }; }

module.exports = {
  evaluateCell, newBudget, summary, simulate, optimizeCell, evalVariant, aggregate,
  VARIANTS, REOPT_MS, MIN_TRADES, MIN_PF, IS_MIN_PF, OOS_MIN_TRADES, MIN_OPT_BARS, SIM_COST_R,
  _dangerouslyResetForTest,
};
