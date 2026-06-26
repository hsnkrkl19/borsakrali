/**
 * ALTIN · Yön (Bias) Motoru — top-down sistemin BEYNİ.
 *
 * Haftalık trend ana yönü belirler (backtest: haftalık EMA100 trendi + Donchian
 * yapısı = %93 WR'lik sağlam kenarın temeli). Tüm alt-TF botları YALNIZ bu yönle
 * UYUMLU işlem açar (kullanıcı: "haftalıkta analiz yapıp alt-TF sinyaller").
 * Günlük yön ikincil teyit (orta vadeli ivme).
 *
 * Saf/yan-etkisiz: mum dizilerini alır, durum döndürür.
 */
const IND = require('../customBots/indicators');

function lastIdxAtOrBefore(cands, t) {
  let idx = -1;
  for (let i = 0; i < cands.length; i++) { if (cands[i].time <= t) idx = i; else break; }
  return idx;
}

// Haftalık yön: EMA100 üstü=boğa, altı=ayı; EMA30 eğimi gücü belirler.
function weeklyBias(weekly) {
  if (!weekly || weekly.length < 110) return { dir: 'neutral', strength: 0, reason: 'yetersiz veri' };
  const close = weekly.map(c => c.close);
  const ema100 = IND.ema(close, 100);
  const ema30 = IND.ema(close, 30);
  const n = close.length - 1;
  const c = close[n], e100 = ema100[n], e30 = ema30[n], e30p = ema30[n - 4];
  if (e100 == null) return { dir: 'neutral', strength: 0, reason: 'EMA100 hazır değil' };
  const slope = e30p ? ((e30 - e30p) / e30p) * 100 : 0;
  let dir = 'neutral';
  if (c > e100) dir = 'bull'; else if (c < e100) dir = 'bear';
  // güç: fiyatın EMA100'e uzaklığı + EMA30 eğimi
  const distPct = e100 ? ((c - e100) / e100) * 100 : 0;
  const strength = Math.max(0, Math.min(1, (Math.abs(distPct) / 20) * 0.6 + (Math.min(Math.abs(slope), 3) / 3) * 0.4));
  return { dir, strength: +strength.toFixed(2), distPct: +distPct.toFixed(2), slopePct: +slope.toFixed(2), ema100: +e100.toFixed(2), close: +c.toFixed(2),
    reason: `Haftalık ${dir === 'bull' ? 'EMA100 ÜSTÜ (boğa)' : dir === 'bear' ? 'EMA100 ALTI (ayı)' : 'nötr'} · uzaklık %${distPct.toFixed(1)} · eğim %${slope.toFixed(2)}` };
}

// Günlük teyit: EMA50 üstü/altı + EMA20 eğimi
function dailyBias(daily) {
  if (!daily || daily.length < 60) return { dir: 'neutral', strength: 0 };
  const close = daily.map(c => c.close);
  const ema50 = IND.ema(close, 50), ema20 = IND.ema(close, 20);
  const n = close.length - 1;
  const c = close[n], e50 = ema50[n], e20 = ema20[n], e20p = ema20[n - 5];
  if (e50 == null) return { dir: 'neutral', strength: 0 };
  const slope = e20p ? ((e20 - e20p) / e20p) * 100 : 0;
  const dir = c > e50 ? 'bull' : c < e50 ? 'bear' : 'neutral';
  return { dir, slopePct: +slope.toFixed(2), ema50: +e50.toFixed(2) };
}

// Belirli bir zamandaki haftalık yön (backtest/alt-TF kapısı için).
function weeklyBiasAt(weekly, t) {
  if (!weekly || !weekly.length) return 'neutral';
  const idx = lastIdxAtOrBefore(weekly, t);
  if (idx < 110) return 'neutral';
  const close = weekly.slice(0, idx + 1).map(c => c.close);
  const ema100 = IND.ema(close, 100);
  const e = ema100[ema100.length - 1];
  if (e == null) return 'neutral';
  const c = close[close.length - 1];
  return c > e ? 'bull' : c < e ? 'bear' : 'neutral';
}

// Birleşik yön: haftalık ana + günlük teyit
function combinedBias(weekly, daily) {
  const w = weeklyBias(weekly);
  const d = dailyBias(daily);
  // Botlar haftalık yönle çalışır; günlük teyit "tam uyum / kısmi" etiketi verir
  const aligned = w.dir !== 'neutral' && d.dir === w.dir;
  return {
    dir: w.dir,
    strength: w.strength,
    weekly: w,
    daily: d,
    alignment: aligned ? 'tam' : (w.dir === 'neutral' ? 'belirsiz' : 'kısmi'),
    tradeBias: w.dir, // alt-TF botları bu yönle işlem açar
  };
}

module.exports = { weeklyBias, dailyBias, weeklyBiasAt, combinedBias };
