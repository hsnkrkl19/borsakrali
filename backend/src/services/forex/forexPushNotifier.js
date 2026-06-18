/**
 * Forex Push Notifier — YALNIZ Telegram KANALI (@borsakraliai).
 *
 * Kullanıcı isteği: forex sinyalleri yalnız kanala gitsin (bota/uygulamaya
 * doğrudan bildirim YOK). Aynı parite+yön sinyalleri tek pozisyonda birleşir:
 *   • Yeni pozisyon → "yeni sinyal" mesajı (#NO = parite ön eki + numara).
 *   • R-merdiveni stop yükselince (≥4h) → AYNI NO ile "güncelleme" (BE/+0.5R...).
 *   • Kapanış (TP1/STOP/İZ-SÜREN/SÜRE) → AYNI NO ile teyit.
 * Kalite kapısı: yalnız backtest'i kenar gösteren (parite,TF) push edilir.
 */

const telegramService = require('../telegramService');
const tracker = require('./forexSignalTracker');
const statsStore = require('./forexStatsStore');
const logger = require('../../utils/logger');

const PUSH_CONFIDENCE = 60;
const MIN_SAMPLE = 12;

function withTimeout(promise, ms, label) {
  return Promise.race([Promise.resolve(promise), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout:' + label)), ms))]);
}
// Veri-temelli kalite kapısı: yeterli örnek (≥12) varken hem isabet <%45 HEM
// beklenen getiri ≤0 ise = kanıtlanmış kaybeden → bastır. Veri yoksa izin ver.
function passesQuality(s) {
  if (s.sampleSize == null || s.sampleSize < MIN_SAMPLE) return true;
  if (s.historicalWinRate == null) return true;
  return s.historicalWinRate >= 45 || (s.historicalAvgReturn != null && s.historicalAvgReturn > 0);
}
function fmt(v, p) { return v == null ? '-' : Number(v).toLocaleString('en-US', { minimumFractionDigits: p, maximumFractionDigits: p }); }
function usd(v, d = 0) { return v == null ? '-' : (v < 0 ? '-$' : '$') + Math.abs(Number(v)).toLocaleString('en-US', { maximumFractionDigits: d }); }
function dirWord(d) { return d === 'long' ? 'LONG' : 'SHORT'; }
function chan() { return require('../signalDelivery').signalChannel(); } // YALNIZ kanal — DM'e düşmez

function metrics(p) {
  const dir = p.direction === 'long' ? 1 : -1, u = p.units;
  return {
    slPnl: u != null ? +(u * (p.stop - p.entry) * dir).toFixed(2) : null,
    tp1: u != null ? +(u * (p.target1 - p.entry) * dir).toFixed(2) : null,
    tp2: u != null ? +(u * (p.target2 - p.entry) * dir).toFixed(2) : null,
  };
}

function buildNew(p, reverseOf) {
  const pr = p.precision ?? 4; const m = metrics(p);
  const lines = [];
  if (reverseOf && reverseOf.length) lines.push(`🔴⚠️ <b>TERS SİNYAL</b> — zıt yönde açık pozisyon var (#${reverseOf.join(', #')})`);
  lines.push(`📊 <b>FOREX ${dirWord(p.direction)} — ${p.symbol}</b> · <b>#${p.code}</b>`);
  lines.push(`TF: ${p.tfs.join(', ')}${p.tfs.length > 1 ? ` (${p.tfs.length} TF birleşik)` : ''}`);
  lines.push(`Güven: <b>${p.confidence}/100</b>`);
  lines.push(`Giriş: <b>${fmt(p.entry, pr)}</b> (piyasa)`);
  lines.push(`Stop: ${fmt(p.stop, pr)} | TP1: ${fmt(p.target1, pr)} (R/R ${p.rr1}) | TP2: ${fmt(p.target2, pr)} (R/R ${p.rr2})`);
  lines.push(`💼 Marj: ${usd(p.marginUsd)} (${p.marginPct}%) · Risk: ${usd(m.slPnl != null ? -Math.min(0, m.slPnl) : null, 0)}`);
  lines.push(`Muhtemel: TP1 ${usd(m.tp1)} · TP2 ${usd(m.tp2)}`);
  if (isManageableTfs(p.tfs)) lines.push(`🪜 Yönetim: +1.5R'de stop girişe (BE), sonra her +0.5R'de kâr kilitlenir`);
  lines.push(`🤖 MT5: <code>${p.direction === 'long' ? 'BUY' : 'SELL'} ${p.mt5Symbol} @PİYASA · SL ${fmt(p.stop, pr)} · TP1 ${fmt(p.target1, pr)} · TP2 ${fmt(p.target2, pr)}</code>`);
  return lines.join('\n');
}
function isManageableTfs(tfs) { return Array.isArray(tfs) && tfs.some(t => t === '4h' || t === '1d'); }

// R-merdiveni stop güncellemesi (aynı NO)
function buildManage(ev) {
  const p = ev.position, pr = p.precision ?? 4;
  const stageTxt = ev.lockR === 0 ? 'stop GİRİŞE çekildi (BE — artık risksiz)' : `kâr +${ev.lockR}R kilitlendi`;
  return [
    `🪜 <b>GÜNCELLEME — #${p.code} ${p.symbol} ${dirWord(p.direction)}</b>`,
    `Fiyat +${ev.reachedR}R'ye ulaştı → ${stageTxt}`,
    `İz süren STOP: ${fmt(ev.prevStop, pr)} → <b>${fmt(p.stop, pr)}</b>`,
    `🤖 MT5 güncelle: <code>SL ${fmt(p.stop, pr)}</code> (TP1 ${fmt(p.target1, pr)} / TP2 ${fmt(p.target2, pr)} aynı)`,
  ].join('\n');
}

async function evaluateAndPush(signals) {
  if (process.env.FOREX_PUSH_DISABLED === '1') return { telegram: 0, considered: 0, disabled: true };
  const chatId = chan();
  const eligible = (signals || []).filter(s => s.confidence >= PUSH_CONFIDENCE && passesQuality(s));

  let events = [];
  try { events = await withTimeout(tracker.syncPositions(eligible), 12000, 'sync'); }
  catch (e) { logger.error(`[ForexPush] sync: ${e.message}`); return { telegram: 0, considered: 0, eligible: eligible.length }; }

  let tg = 0, sent = 0;
  for (const ev of events) { // syncPositions artık YALNIZ 'new' döndürür
    const p = ev.position;
    statsStore.recordOpen(p).catch(() => {});
    if (chatId) { try { const r = await withTimeout(telegramService.sendMessage(chatId, buildNew(p, ev.reverseOf)), 16000, 'tg'); if (r?.success) { tg++; sent++; } } catch (e) { logger.error(`[ForexPush] tg #${p.code}: ${e.message}`); } }
  }
  return { telegram: tg, considered: sent, eligible: eligible.length, chatSet: !!chatId };
}

// ── R-merdiveni stop güncellemeleri (≥4h) ───────────────────────────────────
async function pushManagementUpdates(events) {
  if (process.env.FOREX_PUSH_DISABLED === '1') return { telegram: 0 };
  const chatId = chan();
  let tg = 0;
  for (const ev of (events || [])) {
    if (chatId) { try { const r = await withTimeout(telegramService.sendMessage(chatId, buildManage(ev)), 16000, 'mgmtTg'); if (r?.success) tg++; } catch (e) { logger.error(`[ForexPush] mgmtTg #${ev.position.code}: ${e.message}`); } }
  }
  if (tg) logger.info(`💱🪜 Forex stop güncelleme — ${events.length} · TG ${tg}`);
  return { telegram: tg };
}

// ── Kapanış / teyit (aynı NO) ───────────────────────────────────────────────
function buildClosureTelegram(ev) {
  const pr = ev.precision ?? 4;
  const mins = Math.max(1, Math.round((Date.now() - new Date(ev.issuedAt).getTime()) / 60000));
  const sure = mins >= 60 ? `${Math.floor(mins / 60)}s ${mins % 60}dk` : `${mins}dk`;
  const head = ev.outcome === 'TP1' ? '✅ <b>TP1 OLDU</b>'
    : ev.outcome === 'TRAIL' ? '✅ <b>İZ SÜREN STOP — kilitli kârla kapandı</b>'
    : ev.outcome === 'SL' ? '🛑 <b>STOP OLDU</b>'
    : '⏱️ <b>SÜRE DOLDU (kapandı)</b>';
  const sign = ev.pnlPct >= 0 ? '+' : '';
  return [
    `${head} — <b>#${ev.code}</b> ${ev.symbol} ${dirWord(ev.direction)} (${(ev.tfs || []).join(', ')})`,
    `Giriş ${fmt(ev.entry, pr)} → Çıkış ${fmt(ev.exit, pr)}`,
    `Sonuç: <b>${sign}${ev.pnlPct}%</b>${ev.pnlUsd != null ? ` (${usd(ev.pnlUsd, 2)})` : ''} · süre ${sure}`,
  ].join('\n');
}

async function pushClosures(events) {
  if (process.env.FOREX_PUSH_DISABLED === '1') return { telegram: 0 };
  const chatId = chan();
  let tg = 0;
  for (const ev of (events || [])) {
    statsStore.recordClosure(ev).catch(() => {});
    if (chatId) { try { const r = await withTimeout(telegramService.sendMessage(chatId, buildClosureTelegram(ev)), 16000, 'closeTg'); if (r?.success) tg++; } catch (e) { logger.error(`[ForexPush] closeTg #${ev.code}: ${e.message}`); } }
  }
  if (tg) logger.info(`💱✅ Forex kapanış — ${events.length} · TG ${tg}`);
  return { telegram: tg };
}

// ── Günlük istatistik (parite bazlı long/short başarı) — yalnız kanal ───────
async function pushStats() {
  if (process.env.FOREX_PUSH_DISABLED === '1') return { telegram: 0 };
  const chatId = chan();
  let msg = '';
  try { msg = await statsStore.buildStatsMessage(); } catch (e) { logger.error(`[ForexPush] stats build: ${e.message}`); return { telegram: 0 }; }
  let tg = 0;
  if (chatId) { try { const r = await withTimeout(telegramService.sendMessage(chatId, msg), 16000, 'statsTg'); if (r?.success) tg++; } catch (e) { logger.error(`[ForexPush] statsTg: ${e.message}`); } }
  logger.info(`💱📊 Forex istatistik paylaşıldı — TG ${tg}`);
  return { telegram: tg };
}

module.exports = { evaluateAndPush, pushManagementUpdates, pushClosures, pushStats, buildNew, buildManage, PUSH_CONFIDENCE };
