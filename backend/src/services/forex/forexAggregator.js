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
  const trendStrength = Math.min(1, adx / 40);
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

// ── KALİBRASYON: teknik güven notunu tarihsel backtest başarısıyla harmanla ──
//
// Sorun: teknik-oy skoru (consensus/avgScore/ADX...) ile gerçek isabet oranı
// TERS düşebiliyor. Somut örnek: NAS100 1d teknik güven 75 iken backtest winRate
// %21 (38 örnek); aynı paritede 1h teknik 58 ama winRate %66 — yani yüksek
// teknik skor düşük gerçek başarıyı maskeleyebiliyor.
//
// Çözüm: yeterli örneklemde (≥MIN_SAMPLE), nihai güveni tarihsel winRate'e doğru
// harmanla. winRate bu sistemin TP1 R/R'sindeki ~başabaş oranının (NEUTRAL_WINRATE)
// üstündeyse güveni yukarı, altındaysa aşağı çeker. Harman ağırlığı (trust) örneklem
// büyüdükçe artar, teknik skor en az (1-TRUST_MAX) kadar korunur. Tarihsel veri yoksa
// kalibrasyon devre dışı — saf teknik skor döner (sahte düzeltme yapmaz).
const CAL = {
  NEUTRAL_WINRATE: 41,    // TP1 R/R≈1.4-1.55 → başabaş isabet ~%39-43; tek çapa 41
  SLOPE: 1.6,             // winRate'in başabaştan her puan sapması → empirik puan
  AVGRET_W: 1.5,          // ort. getiri (%) ince ayarı (açık poz. driftiyle gürültülü → düşük ağırlık)
  AVGRET_CLAMP: 3,
  TRUST_MAX: 0.6,         // kalibrasyonun azami ağırlığı (teknik skor ≥%40 korunur)
  FULL_TRUST_SAMPLE: 40,  // bu örneklemde tam güven; altında orantılı
  MIN_SAMPLE: 8,          // altında kalibrasyon yok (gürültü) — getHistory ile aynı eşik
};

// Tarihsel winRate → 0..100 "empirik güven". Başabaş oranı (NEUTRAL_WINRATE) → 50.
function empiricalConfidence(winRate, avgReturn) {
  let s = 50 + (winRate - CAL.NEUTRAL_WINRATE) * CAL.SLOPE;
  if (avgReturn != null && Number.isFinite(avgReturn)) {
    const a = Math.max(-CAL.AVGRET_CLAMP, Math.min(CAL.AVGRET_CLAMP, avgReturn));
    s += a * CAL.AVGRET_W;
  }
  return Math.max(0, Math.min(100, s));
}

// rawConfidence (0-100 teknik) + history (forexBacktest.getHistory sonucu | null)
//   → { confidence, rawConfidence, empirical, trust, delta }
function calibrateConfidence(rawConfidence, history) {
  const raw = Math.round(Math.max(0, Math.min(100, rawConfidence || 0)));
  if (!history || history.winRate == null || !(history.sampleSize >= CAL.MIN_SAMPLE)) {
    return { confidence: raw, rawConfidence: raw, empirical: null, trust: 0, delta: 0 };
  }
  const empirical = empiricalConfidence(history.winRate, history.avgReturn);
  const trust = CAL.TRUST_MAX * Math.min(1, history.sampleSize / CAL.FULL_TRUST_SAMPLE);
  const blended = raw * (1 - trust) + empirical * trust;
  const confidence = Math.round(Math.max(0, Math.min(100, blended)));
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
