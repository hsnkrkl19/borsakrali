/**
 * ALTIN · BACKTEST — her TF'in (her stratejinin) GEÇMİŞ KENARINI mevcut tüm
 * geçmiş üzerinde doğrular (botun iddiaları DÜRÜST olsun diye).
 *
 * Her TF × her strateji için: haftalık-yön kapısıyla (altinBias.weeklyBiasAt)
 * altinStrategies.entryAt giriş tetikler, spec.tp/spec.sl/spec.trail ile tek-poz
 * yönetir, intrabar low/high ile çıkar (TUTUCU: aynı barda SL ÖNCE), işlem kaydeder.
 * goldLab top-down validasyonunun BİREBİR mantığı.
 *
 * NO-LOOKAHEAD: bar i girişi yalnız ≤i veriyi görür (entryAt zaten ≤i kullanır,
 * weeklyBiasAt o anki haftalık kapanışa bakar); çıkış yalnız i'den SONRAki barlarda.
 *
 * Metrikler (tf,strateji): trades, winRate, profitFactor, expectancyPct,
 * totalReturnPct, maxDDpct, maxConsecLoss + train/test (zamansal %70/%30) OOS WR.
 *
 * Kalıcılık: data/altin-backtest.json + Supabase 'altin/backtest.json'. Saf/deterministik
 * (Math.random YOK). Ağır iş → cron'la günde 1 kez koşar, canlı yol getHistory okur.
 */

const fs = require('fs');
const path = require('path');
const altinData = require('./altinData');
const altinBias = require('./altinBias');
const altinStrategies = require('./altinStrategies');

let supa = null, supaEnabled = () => false;
try { const m = require('../../lib/supabase'); supa = m.supabaseAdmin; supaEnabled = m.isSupabaseEnabled; } catch (_) {}

const BUCKET = 'bot-state';
const SUPA_KEY = 'altin/backtest.json';
const STORE_FILE = path.join(__dirname, '..', '..', 'data', 'altin-backtest.json');

const TFS = ['1d', '8h', '4h', '1h', '15m', '5m', '1m'];
const START_BAR = 220;        // ema200 + warmup
const TRAIN_FRAC = 0.7;       // ilk %70 zaman = eğitim, son %30 = test (OOS)

let store = null;             // { generatedAt, perTf:{...} }
let saveTimer = null;

function loadStore() {
  if (store) return store;
  try { if (fs.existsSync(STORE_FILE)) store = JSON.parse(fs.readFileSync(STORE_FILE, 'utf8')); } catch (_) {}
  return store || {};
}

function persist() {
  try {
    const dir = path.dirname(STORE_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(STORE_FILE, JSON.stringify(store, null, 2), 'utf8');
  } catch (_) {}
  if (supaEnabled && supaEnabled()) {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      try { await supa.storage.from(BUCKET).upload(SUPA_KEY, Buffer.from(JSON.stringify(store), 'utf8'), { contentType: 'application/json', upsert: true }); } catch (_) {}
    }, 2500);
    if (saveTimer.unref) saveTimer.unref();
  }
}

/**
 * Tek strateji üzerinde geçmişi yürü → işlem listesi.
 * candles: eski→yeni; weekly: haftalık mumlar (bias kapısı).
 * Tek pozisyon: açıkken yeni giriş alınmaz. Çıkış: spec.tp/spec.sl × ATR; trail varsa
 * lehte iz-süren stop. Aynı barda hem SL hem TP → SL (tutucu).
 */
function walkStrategy(candles, weekly, spec) {
  const P = altinStrategies.prep(candles);
  const trades = [];
  let pos = null; // { dir, entry, stop, target, atr, peak, trough, entryIdx }

  for (let i = START_BAR; i < candles.length; i++) {
    const bar = candles[i];

    if (pos) {
      const isLong = pos.dir === 'long';
      // Trailing stop (lehte) — bu barın ekstremiyle güncelle (giriş barından sonra)
      if (spec.trail && pos.atr > 0) {
        if (isLong) {
          if (bar.high > pos.peak) pos.peak = bar.high;
          const ns = pos.peak - spec.sl * pos.atr;
          if (ns > pos.stop) pos.stop = ns;
        } else {
          if (bar.low < pos.trough) pos.trough = bar.low;
          const ns = pos.trough + spec.sl * pos.atr;
          if (ns < pos.stop) pos.stop = ns;
        }
      }
      const slHit = isLong ? bar.low <= pos.stop : bar.high >= pos.stop;
      const tpHit = isLong ? bar.high >= pos.target : bar.low <= pos.target;
      let exit = null, outcome = null;
      if (slHit) { exit = pos.stop; outcome = (isLong ? pos.stop >= pos.entry : pos.stop <= pos.entry) ? 'TRAIL' : 'SL'; }
      else if (tpHit) { exit = pos.target; outcome = 'TP'; }
      if (exit != null) {
        const dir = isLong ? 1 : -1;
        const retPct = ((exit - pos.entry) / pos.entry) * 100 * dir;
        const denom = Math.abs(pos.entry - pos.initialStop);
        const R = denom > 0 ? ((exit - pos.entry) * dir) / denom : 0;
        trades.push({ entryIdx: pos.entryIdx, exitIdx: i, entryTime: candles[pos.entryIdx].time, exitTime: bar.time, direction: pos.dir, entry: pos.entry, exit, retPct, R, outcome, win: retPct > 0 });
        pos = null;
      }
      continue; // bir barda hem çıkış hem yeni giriş yok
    }

    // Yeni giriş arama (poz yokken)
    const atrVal = P.atr14[i];
    if (!(atrVal > 0)) continue;
    const biasDir = altinBias.weeklyBiasAt(weekly, bar.time);
    if (biasDir === 'neutral') continue;
    const dir = altinStrategies.entryAt(P, i, spec.type, biasDir);
    if (!dir) continue;
    const lv = altinStrategies.levelsFor(bar.close, atrVal, spec, dir);
    pos = { dir, entry: lv.entry, stop: lv.stop, initialStop: lv.stop, target: lv.target, atr: atrVal, peak: bar.high, trough: bar.low, entryIdx: i };
  }
  return trades;
}

// İşlem listesinden metrikler (tutucu: açık poz dahil edilmez, simülasyon tam kapanışlarla).
function metricsOf(trades) {
  const n = trades.length;
  if (!n) return { trades: 0, winRate: null, profitFactor: null, expectancyPct: null, totalReturnPct: 0, maxDDpct: 0, maxConsecLoss: 0 };
  let wins = 0, grossWin = 0, grossLoss = 0, sumRet = 0;
  let equity = 0, peak = 0, maxDD = 0, consec = 0, maxConsec = 0;
  for (const t of trades) {
    if (t.win) { wins++; grossWin += t.retPct; consec = 0; }
    else { grossLoss += Math.abs(t.retPct); consec++; if (consec > maxConsec) maxConsec = consec; }
    sumRet += t.retPct;
    equity += t.retPct; // additive equity curve (%)
    if (equity > peak) peak = equity;
    const dd = peak - equity;
    if (dd > maxDD) maxDD = dd;
  }
  let pf = null;
  if (grossLoss > 0) pf = +(grossWin / grossLoss).toFixed(3);
  else if (grossWin > 0) pf = 999; // kayıpsız
  return {
    trades: n,
    winRate: +(wins / n * 100).toFixed(1),
    profitFactor: pf,
    expectancyPct: +(sumRet / n).toFixed(3),
    totalReturnPct: +sumRet.toFixed(2),
    maxDDpct: +maxDD.toFixed(2),
    maxConsecLoss: maxConsec,
  };
}

// Zamansal %70/%30 bölüm → test (son %30) WR (OOS dayanıklılığı). Giriş zamanına göre.
function oosWinRate(trades, candles) {
  if (!trades.length || candles.length < 2) return null;
  const t0 = candles[0].time, t1 = candles[candles.length - 1].time;
  const cut = t0 + (t1 - t0) * TRAIN_FRAC;
  const test = trades.filter(t => t.entryTime >= cut);
  if (!test.length) return null;
  const wins = test.filter(t => t.win).length;
  return +(wins / test.length * 100).toFixed(1);
}

async function backtestTf(tf) {
  const candles = await altinData.getCandles(tf);
  const weekly = await altinData.getCandles('1wk');
  const specs = altinStrategies.TF_STRATEGIES[tf] || [];
  const out = { tf, strategies: [], bestWinRate: null };
  if (!candles || candles.length < START_BAR + 5 || !specs.length) return out;

  for (const spec of specs) {
    const trades = walkStrategy(candles, weekly, spec);
    const m = metricsOf(trades);
    const oos = oosWinRate(trades, candles);
    out.strategies.push({ type: spec.type, label: spec.label, wrEst: spec.wrEst, scalp: !!spec.scalp, tp: spec.tp, sl: spec.sl, trail: !!spec.trail, ...m, oosWinRate: oos });
  }
  const wrs = out.strategies.map(s => s.winRate).filter(w => w != null);
  out.bestWinRate = wrs.length ? Math.max(...wrs) : null;
  return out;
}

async function runAll() {
  loadStore();
  store = store || {};
  const perTf = {};
  for (const tf of TFS) {
    try { perTf[tf] = await backtestTf(tf); }
    catch (e) { perTf[tf] = { tf, strategies: [], bestWinRate: null, error: e.message }; }
  }
  store = { generatedAt: new Date().toISOString(), perTf };
  persist();
  return { generatedAt: store.generatedAt, tfs: Object.keys(perTf), perTf };
}

function getStore() { return loadStore(); }

// Kalibrasyon/gösterim için: bir (tf,type) stratejinin geçmiş metrikleri.
function getHistory(tf, type) {
  const s = loadStore();
  const rec = s && s.perTf && s.perTf[tf];
  if (!rec || !Array.isArray(rec.strategies)) return null;
  return rec.strategies.find(x => x.type === type) || null;
}

module.exports = { runAll, backtestTf, getStore, getHistory, TFS };
