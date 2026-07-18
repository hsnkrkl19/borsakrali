/**
 * beastEngine — BEAST Trend canlı sinyal motoru.
 *
 * Her AKTİF (enstrüman, TF) hücresi için: veri çek → göstergeleri kur → üst-TF bias'ı
 * resample ile çöz → SON KAPANMIŞ barı değerlendir (repaint yok) → sinyal varsa
 * seviyeleri canlı fiyata göre kur. Backtest ile birebir aynı mantık.
 *
 * Çıktı: forex/pro motorlarıyla uyumlu sinyal nesneleri (tracker/notifier/frontend tüketir).
 */

'use strict';

const { INSTRUMENTS, SIGNAL_TFS, TF_DEFS } = require('./beastInstruments');
const cfgMod = require('./beastConfig');
const data = require('./beastData');
const S = require('./beastStrategy');
const I = require('./beastIndicators');

let latest = { signals: [], generatedAt: null, generating: false };

function gradeOf(c) { return c >= 75 ? 'MUKEMMEL' : c >= 60 ? 'GUCLU' : c >= 50 ? 'ORTA' : 'ZAYIF'; }

function buildMt5Summary(inst, direction, lv) {
  const t = direction === 'long' ? 'AL (BUY)' : 'SAT (SELL)';
  const f = (v) => Number(v).toFixed(inst.precision);
  return `${t} ${inst.short} @PİYASA · SL ${f(lv.stop)} · TP1 ${f(lv.target1)} · TP2 ${f(lv.target2)}`;
}

// Tek (enstrüman, TF) değerlendir → sinyal nesnesi | null
async function analyzeCell(inst, tf) {
  const candles = await data.fetchCandles(inst, tf);
  if (!candles || candles.length < 150) return null;
  if (!data.isFresh(candles, tf)) return null; // metal hafta sonu → yeni sinyal yok

  const cfg = cfgMod.resolveConfig(inst, tf);
  const ind = S.prepare(candles, cfg);
  const factor = TF_DEFS[tf].htfFactor;
  const htfCandles = factor > 1 ? I.resample(candles, factor) : candles;
  const htf = S.prepareHTF(htfCandles, cfg);

  const n = candles.length;
  const idx = n - 2; // son KAPANMIŞ bar (forming bar n-1 değerlendirilmez)
  const htfIdx = htf ? Math.floor(idx / factor) - 1 : -1;
  const sig = S.evaluateAt(candles, ind, cfg, idx, tf, S.htfSnapshot(htf, htfIdx), inst.precision);
  if (!sig) return null;

  // Seviyeleri CANLI fiyata göre yeniden kur (giriş = güncel kapanış)
  const livePrice = candles[n - 1].close;
  const atr = ind.atr[idx];
  const swing = I.recentSwing(candles, idx, cfg.swingLeft, cfg.swingRight, cfg.swingLookback);
  const lv = S.buildLevels(sig.direction, livePrice, atr, swing, cfg, inst.precision);
  if (!lv || !(lv.riskDist > 0)) return null;

  const edge = cfgMod.edgeFor(inst.id, tf);
  // Yapısal destek/direnç (son onaylı swing dip/tepe) — mesajda gösterilir
  const support = swing && swing.swingLow != null ? +swing.swingLow.toFixed(inst.precision) : null;
  const resistance = swing && swing.swingHigh != null ? +swing.swingHigh.toFixed(inst.precision) : null;
  const slPct = +(Math.abs(livePrice - lv.stop) / livePrice * 100).toFixed(2);
  const tp1Pct = +(Math.abs(lv.target1 - livePrice) / livePrice * 100).toFixed(2);
  const tp2Pct = +(Math.abs(lv.target2 - livePrice) / livePrice * 100).toFixed(2);

  // signalQuality — fail-safe shadow gözlem (yayın kararını DEĞİŞTİRMEZ)
  try {
    require('../signalQuality/bridge').observe({ engine: 'beast', strategy: inst.id, direction: sig.direction, rawScore: sig.confidence, rawScoreScale: { min: 0, max: 100 }, candles, levels: { entry: lv.entry, stop: lv.stop, target: lv.target1 }, assetClass: inst.class, symbol: inst.symbol });
  } catch (_) {}
  return {
    id: inst.id, symbol: inst.symbol, name: inst.name, short: inst.short,
    class: inst.class, precision: inst.precision, tvSymbol: inst.tvSymbol, prefix: inst.prefix,
    tf, direction: sig.direction, confidence: sig.confidence, score: sig.score, grade: gradeOf(sig.confidence),
    entry: lv.entry, stop: lv.stop, target1: lv.target1, target2: lv.target2,
    support, resistance,
    rr1: lv.rr1, rr2: lv.rr2, atr: lv.atr, trigger: sig.trigger, reasons: sig.reasons, layers: sig.layers,
    htf: sig.htf, adx: sig.adx, zlema: sig.zlema,
    slPct, tp1Pct, tp2Pct,
    edge, mode: cfg.partialMode,
    mt5: buildMt5Summary(inst, sig.direction, lv),
    time: candles[idx].time, issuedAt: new Date().toISOString(),
  };
}

// Tüm aktif hücreleri tara
async function generate() {
  if (latest.generating) return latest;
  latest.generating = true;
  try {
    const out = [];
    for (const inst of INSTRUMENTS) {
      for (const tf of SIGNAL_TFS) {
        if (!cfgMod.isEnabled(inst.id, tf)) continue;
        try {
          const s = await analyzeCell(inst, tf);
          if (s) out.push(s);
        } catch (e) { /* tek hücre hatası diğerlerini düşürmesin */ }
      }
    }
    out.sort((a, b) => b.confidence - a.confidence);
    latest = { signals: out, generatedAt: new Date().toISOString(), generating: false };
    return latest;
  } finally {
    latest.generating = false;
  }
}

function getLatest() { return latest; }

module.exports = { generate, getLatest, analyzeCell };
