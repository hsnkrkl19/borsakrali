/**
 * waveScanNotifier — Dalga taraması sinyallerini YALNIZ Telegram kanalına
 * (@borsakraliai) gönderir. Açıkça "özel tarama" etiketlenir ve "normal sinyal
 * sayısına dahil değildir" notu eklenir. Kapanışta aynı NO ile teyit.
 * Kill-switch: WAVESCAN_PUSH_DISABLED=1.
 */

const telegramService = require('../telegramService');
const tracker = require('./waveScanTracker');
const logger = require('../../utils/logger');

function withTimeout(p, ms, label) {
  return Promise.race([Promise.resolve(p), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout:' + label)), ms))]);
}
function chan() { return require('../signalDelivery').signalChannel(); } // YALNIZ kanal — DM'e düşmez
function fmt(v, p) { return v == null ? '-' : Number(v).toLocaleString('en-US', { minimumFractionDigits: p, maximumFractionDigits: p }); }
function dirWord(d) { return d === 'long' ? 'LONG (AL)' : 'SHORT (SAT)'; }

function buildNew(p) {
  const pr = p.precision ?? 2;
  const lines = [
    `🌊 <b>DALGA ANALİZİ</b> — <b>#${p.code}</b> <i>(özel tarama)</i>`,
    `📊 <b>${p.symbol}</b> · ${p.tf} · <b>${dirWord(p.direction)}</b>`,
    `Elliott + SNR + Mum + Fraktal konfluansı · Güven <b>${p.score}/100</b>`,
    ``,
    `Giriş: <b>${fmt(p.entry, pr)}</b> (piyasa)`,
    `Stop: ${fmt(p.stop, pr)} | TP1: ${fmt(p.target1, pr)} (R/R ${p.rr1}) | TP2: ${fmt(p.target2, pr)} (R/R ${p.rr2})`,
    ``,
    `🔎 <b>Notlar:</b>`,
    ...(p.notes || []).map(n => `• ${n}`),
    ``,
    `🤖 MT5: <code>${p.direction === 'long' ? 'BUY' : 'SELL'} ${p.mt5Symbol} @PİYASA · SL ${fmt(p.stop, pr)} · TP1 ${fmt(p.target1, pr)} · TP2 ${fmt(p.target2, pr)}</code>`,
    `ℹ️ Bu özel bir analiz taramasıdır; normal sinyal sayısına dahil <b>DEĞİLDİR</b>.`,
    `⚠️ Yatırım tavsiyesi değildir, eğitim amaçlıdır.`,
  ];
  return lines.join('\n');
}

function buildClosure(ev) {
  const pr = ev.precision ?? 2;
  const head = ev.outcome === 'TP1' ? '✅ <b>TP1 OLDU</b>'
    : ev.outcome === 'TRAIL' ? '✅ <b>STOP (kârda) — kapandı</b>'
    : ev.outcome === 'SL' ? '🛑 <b>STOP OLDU</b>'
    : '⏱️ <b>SÜRE DOLDU (kapandı)</b>';
  const sign = ev.pnlPct >= 0 ? '+' : '';
  return [
    `🌊 <b>DALGA</b> — <b>#${ev.code}</b> ${ev.symbol} ${ev.tf} ${ev.direction === 'long' ? 'LONG' : 'SHORT'}`,
    `${head}`,
    `Giriş ${fmt(ev.entry, pr)} → Çıkış ${fmt(ev.exit, pr)} · Sonuç <b>${sign}${ev.pnlPct}%</b>`,
  ].join('\n');
}

async function evaluateAndPush(signals) {
  if (process.env.WAVESCAN_PUSH_DISABLED === '1') return { telegram: 0, disabled: true };
  const chatId = chan();
  let events = [];
  try { events = await withTimeout(tracker.syncSignals(signals), 12000, 'sync'); }
  catch (e) { logger.error(`[WaveScan] sync: ${e.message}`); return { telegram: 0 }; }
  let tg = 0;
  for (const ev of events) {
    if (chatId) { try { const r = await withTimeout(telegramService.sendMessage(chatId, buildNew(ev.position)), 16000, 'tg'); if (r?.success) tg++; } catch (e) { logger.error(`[WaveScan] tg #${ev.position.code}: ${e.message}`); } }
  }
  if (events.length) logger.info(`🌊 Dalga taraması — ${events.length} yeni · TG ${tg}`);
  return { telegram: tg, newCount: events.length };
}

async function pushClosures(events) {
  if (process.env.WAVESCAN_PUSH_DISABLED === '1') return { telegram: 0 };
  const chatId = chan();
  let tg = 0;
  for (const ev of (events || [])) {
    if (chatId) { try { const r = await withTimeout(telegramService.sendMessage(chatId, buildClosure(ev)), 16000, 'closeTg'); if (r?.success) tg++; } catch (e) { logger.error(`[WaveScan] closeTg #${ev.code}: ${e.message}`); } }
  }
  if (tg) logger.info(`🌊✅ Dalga kapanış — ${events.length} · TG ${tg}`);
  return { telegram: tg };
}

module.exports = { evaluateAndPush, pushClosures, buildNew, buildClosure };
