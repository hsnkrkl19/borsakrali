/**
 * forexAggregator — 5 tekniği (Genel Tarama, EMA34, TEMA34, SNR, SMC) tek yöne
 * ve 0-100 GÜVEN NOTUna indirger. Bu, "Strateji Merkezi"nin forex karşılığıdır.
 *
 * Güven kriterleri (kullanıcı isteği: indikatör + taramalara göre):
 *   • Teknik uzlaşısı (ağırlıklı oy farkı)           %32
 *   • Uzlaşan tekniklerin ortalama skoru             %24
 *   • Trend gücü (ADX)                               %16
 *   • Momentum (MACD + RSI yön uyumu)                %10
 *   • Risk/Ödül kalitesi (TP1)                       %10
 *   • Çoklu-zaman (TF) confluence                    %8
 */

function aggregate(modules, ind) {
  let longW = 0, shortW = 0, totalW = 0;
  for (const m of modules) {
    if (!m) continue;
    totalW += m.weight;
    if (m.vote === 'long') longW += m.weight * m.strength;
    else if (m.vote === 'short') shortW += m.weight * m.strength;
  }
  const net = longW - shortW;
  const direction = net > 1e-4 ? 'long' : net < -1e-4 ? 'short' : 'neutral';
  const consensus = totalW > 0 ? Math.min(1, Math.abs(net) / totalW) : 0;

  const agreeing = modules.filter(m => m && m.vote === direction);
  const avgScore = agreeing.length ? agreeing.reduce((s, m) => s + (m.score || 0), 0) / agreeing.length : 0;

  const adx = ind?.adx || 0;
  // ADX yön-körüydü: güçlü DÜŞÜŞ trendi ters-yön LONG'a +16 puana kadar güven
  // ekliyordu (2026-07-06 gecesi ters-yön long'ların hem eşiği geçmesini hem
  // lot şişmesini besledi). +DI/-DI biliniyorsa trend gücü yalnız yönle UYUMLU
  // ise sayılır; ters yönde 0 (DI verisi yoksa eski davranış korunur).
  let trendStrength = Math.min(1, adx / 40);
  if (ind && ind.pdi != null && ind.ndi != null && direction !== 'neutral') {
    const dirOk = direction === 'long' ? ind.pdi > ind.ndi : ind.ndi > ind.pdi;
    if (!dirOk) trendStrength = 0;
  }
  let momentum = 0;
  if (ind && direction !== 'neutral') {
    const macdOk = direction === 'long' ? (ind.macdHist > 0) : (ind.macdHist < 0);
    const rsiOk = direction === 'long' ? (ind.rsi > 50) : (ind.rsi < 50);
    momentum = ((macdOk ? 1 : 0) + (rsiOk ? 1 : 0)) / 2;
  }

  const votes = modules.filter(Boolean).map(m => ({ technique: m.technique, label: m.label, vote: m.vote, score: m.score }));
  return { direction, consensus, avgScore, trendStrength, momentum, longW: +longW.toFixed(2), shortW: +shortW.toFixed(2), totalW, votes, modules: modules.filter(Boolean) };
}

// rrQuality 0..1: TP1 R/R 1→0, 2.5+→1. confluence 0..1.
function computeConfidence({ consensus, avgScore, trendStrength, momentum, rr1, confluence = 0 }) {
  const rrQuality = Math.max(0, Math.min(1, ((rr1 || 1) - 1) / 1.5));
  const raw =
    0.32 * consensus +
    0.24 * (avgScore / 100) +
    0.16 * trendStrength +
    0.10 * momentum +
    0.10 * rrQuality +
    0.08 * confluence;
  return Math.round(Math.max(0, Math.min(1, raw)) * 100);
}

// ── KALİBRASYON: teknik güven notunu tarihsel backtest başarısıyla düzelt ──
//
// Sorun: teknik-oy skoru (consensus/avgScore/ADX...) ile gerçek isabet oranı
// TERS düşebiliyor. Somut örnek: NAS100 1d teknik güven 75 iken backtest winRate
// %21 (38 örnek); aynı paritede 1h teknik 58 ama winRate %66.
//
// Çözüm — backtesting.py sidecar'ı (kernc/backtesting.py) her (enstrüman/TF/bant)
// için winRate + ORTALAMA GETİRİ + **EXPECTANCY + PROFIT FACTOR** üretir. Empirik
// güven artık PF/expectancy temelli: bu sistem BİLEREK düşük-winRate-yüksek-R/R
// (geniş fib stop) → winRate-tek kalibrasyon kârlı kurulumları HAKSIZ eziyordu
// (forex akışı "hiç gelmiyor"a düşmüştü, geri alınmıştı). PF ölçek-bağımsızdır:
// PF>1 (kârlı) → empirik ≥50, PF<1 → <50. winRate yalnız küçük dengeleyici.
//
// Uygulama: ham güveni MUTLAK empirik seviyeye HARMANLAMAK (eski yöntem) akışı
// çökertiyordu (75→41). Bunun yerine ham güveni SINIRLI bir DELTA ile düzeltiriz:
//   delta = clamp((empirical-50)·trust, -MAX_DROP, +MAX_RISE)
//   confidence = raw + delta
// Böylece iyi geçmiş yukarı, kötü geçmiş aşağı çeker AMA hiçbir sinyal tek hamlede
// eşik-altına çakılıp akışı kurutamaz. trust örneklemle büyür; veri yoksa NO-OP.
function envNum(name, def) { const v = Number(process.env[name]); return Number.isFinite(v) ? v : def; }
const CAL = {
  NEUTRAL_WINRATE: 41,    // TP1 R/R≈1.4-1.55 → başabaş isabet ~%39-43; tek çapa 41
  SLOPE: 1.6,             // winRate-tek yol (PF yoksa): başabaştan her puan sapması
  AVGRET_W: 1.5,          // ort. getiri (%) ince ayarı (PF yoksa)
  AVGRET_CLAMP: 3,
  // Profit-factor temelli empirik (backtesting.py perBand) — kârlı=yukarı, zararlı=aşağı
  PF_GAIN: 30,            // PF>1: empirik += min(PF_CLAMP_UP, (PF-1)·PF_GAIN)
  PF_LOSS: 50,            // PF<1: empirik += max(-PF_CLAMP_DN, (PF-1)·PF_LOSS) (kaybedeni sert ez)
  PF_CLAMP_UP: 30,
  PF_CLAMP_DN: 25,
  WINRATE_STAB: 0.2,      // PF varken küçük winRate dengeleyici
  EXP_W: 2.0,             // expectancy (% / kapalı işlem) ince ayarı (PF varken)
  EXP_CLAMP: 4,
  // Uygulama (delta) — akış çökmesin diye SINIRLI
  TRUST_MAX: 0.6,         // empirik etkinin azami ağırlığı
  FULL_TRUST_SAMPLE: 40,  // bu örneklemde tam güven; altında orantılı
  MIN_SAMPLE: 30,         // B4 (denetim): 8 -> 30. Altinda kalibrasyon yok (8 gurultuydu; guveni/lotu oynatiyordu)
  MAX_RISE: envNum('CALIBRATION_MAX_RISE', 15),  // kalibrasyon en çok bu kadar EKLER
  MAX_DROP: envNum('CALIBRATION_MAX_DROP', 15),  // ...ve en çok bu kadar DÜŞÜRÜR
};

// Tarihsel başarı → 0..100 "empirik güven" (50 = nötr/başabaş).
// arg: { winRate, avgReturn, profitFactor, expectancy } VEYA (winRate, avgReturn) konumsal.
function empiricalConfidence(arg, avgReturnPos) {
  let winRate, avgReturn, profitFactor, expectancy;
  if (arg && typeof arg === 'object') {
    ({ winRate, avgReturn, profitFactor, expectancy } = arg);
  } else { winRate = arg; avgReturn = avgReturnPos; }

  let s = 50;
  const hasPF = profitFactor != null && Number.isFinite(profitFactor);
  if (hasPF) {
    const pf = Math.max(0, profitFactor);
    s += pf >= 1
      ? Math.min(CAL.PF_CLAMP_UP, (pf - 1) * CAL.PF_GAIN)
      : Math.max(-CAL.PF_CLAMP_DN, (pf - 1) * CAL.PF_LOSS);
    if (winRate != null && Number.isFinite(winRate)) s += (winRate - CAL.NEUTRAL_WINRATE) * CAL.WINRATE_STAB;
    if (expectancy != null && Number.isFinite(expectancy)) {
      s += Math.max(-CAL.EXP_CLAMP, Math.min(CAL.EXP_CLAMP, expectancy)) * CAL.EXP_W;
    } else if (avgReturn != null && Number.isFinite(avgReturn)) {
      s += Math.max(-CAL.AVGRET_CLAMP, Math.min(CAL.AVGRET_CLAMP, avgReturn)) * CAL.AVGRET_W;
    }
  } else {
    // PF yoksa eski winRate-tek davranış (geriye dönük uyum)
    if (winRate != null && Number.isFinite(winRate)) s += (winRate - CAL.NEUTRAL_WINRATE) * CAL.SLOPE;
    if (avgReturn != null && Number.isFinite(avgReturn)) {
      s += Math.max(-CAL.AVGRET_CLAMP, Math.min(CAL.AVGRET_CLAMP, avgReturn)) * CAL.AVGRET_W;
    }
  }
  return Math.max(0, Math.min(100, s));
}

// rawConfidence (0-100 teknik) + history (getHistory sonucu | null)
//   → { confidence, rawConfidence, empirical, trust, delta }
// confidence = raw + SINIRLI delta (mutlak harman DEĞİL — bkz. üstteki açıklama).
function calibrateConfidence(rawConfidence, history) {
  const raw = Math.round(Math.max(0, Math.min(100, rawConfidence || 0)));
  const hasSignal = history && (history.winRate != null || history.profitFactor != null);
  if (!hasSignal || !(history.sampleSize >= CAL.MIN_SAMPLE)) {
    return { confidence: raw, rawConfidence: raw, empirical: null, trust: 0, delta: 0 };
  }
  const empirical = empiricalConfidence(history);
  const trust = CAL.TRUST_MAX * Math.min(1, history.sampleSize / CAL.FULL_TRUST_SAMPLE);
  let delta = (empirical - 50) * trust;
  delta = Math.max(-CAL.MAX_DROP, Math.min(CAL.MAX_RISE, delta));
  const confidence = Math.round(Math.max(0, Math.min(100, raw + delta)));
  return { confidence, rawConfidence: raw, empirical: Math.round(empirical), trust: +trust.toFixed(2), delta: confidence - raw };
}

function gradeFor(conf) {
  if (conf >= 75) return 'MUKEMMEL';
  if (conf >= 60) return 'GUCLU';
  if (conf >= 45) return 'ORTA';
  return 'ZAYIF';
}
function bandFor(conf) {
  if (conf >= 70) return 'high';
  if (conf >= 50) return 'mid';
  return 'low';
}

module.exports = { aggregate, computeConfidence, calibrateConfidence, empiricalConfidence, gradeFor, bandFor, CAL };
