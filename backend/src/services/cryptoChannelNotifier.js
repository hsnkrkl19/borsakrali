/**
 * cryptoChannelNotifier — Kripto sinyallerini SÜREKLİ olarak Telegram KANALINA
 * gönderir (forex gibi). Kullanıcı isteği: 4 faz YOK; sürekli tara, bulduğun YENİ
 * sinyali (tekrarsız) gönder, TP/SL olunca aynı NO ile teyit et.
 *
 * Dedup + yaşam döngüsü cryptoSignalTracker'da. Burada: tarama sonucunu düzleştir
 * (strateji başına top N), yeni olanları kanala bas, kapanışları teyit et.
 */

const telegramService = require('./telegramService');
const tracker = require('./cryptoSignalTracker');
const { signalChannel } = require('./signalDelivery');
const logger = require('../utils/logger');

const TOP = Number(process.env.CRYPTO_CHANNEL_TOP) || 3;   // strateji başına en iyi N → kanala aday
const STRAT = [
  { key: 'spot_long', dir: 'long', label: 'SPOT / AL' },
  { key: 'futures_long', dir: 'long', label: 'FUTURES LONG' },
  { key: 'futures_short', dir: 'short', label: 'FUTURES SHORT' },
];
const LABEL = { spot_long: 'SPOT / AL', futures_long: 'FUTURES LONG', futures_short: 'FUTURES SHORT' };

function withTimeout(p, ms, label) {
  return Promise.race([Promise.resolve(p), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout:' + label)), ms))]);
}
function fmtPrice(v) {
  if (v == null || !isFinite(v)) return '-';
  const a = Math.abs(v);
  const d = a >= 1000 ? 2 : a >= 1 ? 3 : a >= 0.01 ? 5 : 8;
  return Number(v).toLocaleString('en-US', { maximumFractionDigits: d });
}

// Tarama sonucu → düz uygun sinyal listesi (strateji başına top N, geçerli seviyeli)
function flatten(result, topN = TOP) {
  const out = [];
  for (const { key, dir } of STRAT) {
    for (const s of (result?.[key]?.signals || []).slice(0, topN)) {
      out.push({
        symbol: s.symbol, name: s.name, strategy: key, direction: dir,
        entry: s.entry, stop: s.stop, target1: s.target1, target2: s.target2,
        totalScore: s.totalScore, historicalWinRate: s.historicalWinRate,
      });
    }
  }
  return out.filter(s => s.entry > 0 && s.stop > 0 && s.target1 > 0);
}

function buildNew(p) {
  const dirWord = p.direction === 'long' ? 'LONG (AL)' : 'SHORT (SAT)';
  return [
    `🪙 <b>KRİPTO ${LABEL[p.strategy] || ''}</b> — <b>#${p.code}</b>`,
    `<b>${(p.symbol || '').toUpperCase()}/USDT</b> · ${dirWord}`,
    `Giriş: <b>${fmtPrice(p.entry)}</b> · SL: ${fmtPrice(p.stop)} · TP: ${fmtPrice(p.target1)}`,
    `${p.totalScore != null ? `Skor ${p.totalScore}` : ''}${p.historicalWinRate != null ? ` · Geçmiş %${p.historicalWinRate}` : ''}`.trim() || ' ',
    `ℹ️ Detaylar uygulamada · ⚠️ Yatırım tavsiyesi değildir.`,
  ].join('\n');
}

function buildClosure(ev) {
  const head = ev.outcome === 'TP1' ? '✅ <b>TP OLDU</b>'
    : ev.outcome === 'TRAIL' ? '✅ <b>STOP (kârda) — kapandı</b>'
    : ev.outcome === 'SL' ? '🛑 <b>STOP OLDU</b>'
    : '⏱️ <b>SÜRE DOLDU</b>';
  const sign = ev.pnlPct >= 0 ? '+' : '';
  return [
    `🪙 <b>KRİPTO</b> — <b>#${ev.code}</b> ${(ev.symbol || '').toUpperCase()}/USDT ${ev.direction === 'long' ? 'LONG' : 'SHORT'}`,
    `${head} · Giriş ${fmtPrice(ev.entry)} → Çıkış ${fmtPrice(ev.exit)} · <b>${sign}${ev.pnlPct}%</b>`,
  ].join('\n');
}

// Sürekli yayın: tarama sonucundan yeni bulunanları kanala bas (dedup tracker'da)
async function evaluateAndPush(result) {
  if (process.env.CRYPTO_PUSH_DISABLED === '1') return { telegram: 0, disabled: true };
  const chatId = signalChannel();
  const eligible = Array.isArray(result) ? result : flatten(result);
  let events = [];
  try { events = await withTimeout(tracker.syncSignals(eligible), 12000, 'sync'); }
  catch (e) { logger.error(`[CryptoChannel] sync: ${e.message}`); return { telegram: 0 }; }
  let tg = 0;
  for (const ev of events) {
    if (chatId) { try { const r = await withTimeout(telegramService.sendMessage(chatId, buildNew(ev.position)), 16000, 'tg'); if (r?.success) tg++; } catch (e) { logger.error(`[CryptoChannel] tg #${ev.position.code}: ${e.message}`); } }
  }
  if (events.length) logger.info(`🪙 Kripto kanal — ${events.length} yeni · TG ${tg}`);
  return { telegram: tg, newCount: events.length };
}

async function pushClosures(events) {
  if (process.env.CRYPTO_PUSH_DISABLED === '1') return { telegram: 0 };
  const chatId = signalChannel();
  let tg = 0;
  for (const ev of (events || [])) {
    if (chatId) { try { const r = await withTimeout(telegramService.sendMessage(chatId, buildClosure(ev)), 16000, 'closeTg'); if (r?.success) tg++; } catch (e) { logger.error(`[CryptoChannel] closeTg #${ev.code}: ${e.message}`); } }
  }
  if (tg) logger.info(`🪙✅ Kripto kapanış — ${events.length} · TG ${tg}`);
  return { telegram: tg };
}

module.exports = { flatten, buildNew, buildClosure, evaluateAndPush, pushClosures, TOP };
