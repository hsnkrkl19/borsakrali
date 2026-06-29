/**
 * Forex Push Notifier — POZİSYON birleştirmeli (Telegram kanal + app push).
 *
 * Aynı parite+yön sinyalleri tek pozisyonda birleşir (forexSignalTracker):
 *   • Yeni pozisyon → "yeni sinyal" mesajı (#NO, birleşik TF listesi).
 *   • Aynı pozisyona yeni TF / yeniden oluşma → AYNI NO ile "güncelleme"
 *     (iz süren stop & TP).
 *   • Kapanış (TP1/STOP/İZ-SÜREN/SÜRE) → AYNI NO ile teyit.
 * Farklı yön ayrı pozisyon (🔴 ters bayrağı). Eşik: confidence ≥ PUSH_CONFIDENCE.
 */

const telegramService = require('../telegramService');
const pushNotificationService = require('../pushNotificationService');
const tracker = require('./forexSignalTracker');
const logger = require('../../utils/logger');

const PUSH_CONFIDENCE = 60;
const UPDATE_COOLDOWN_MS = 60 * 60 * 1000; // aynı pozisyon güncellemesi spam'ini engelle (60 dk — düzeltmeleri azalt)
const TARGET_USER_EMAIL = process.env.FOREX_PUSH_EMAIL || 'hsnkrkl19@gmail.com';

const lastSent = new Map(); // code -> ts (son güncelleme push'u)

function withTimeout(promise, ms, label) {
  return Promise.race([Promise.resolve(promise), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout:' + label)), ms))]);
}
function fmt(v, p) { return v == null ? '-' : Number(v).toLocaleString('en-US', { minimumFractionDigits: p, maximumFractionDigits: p }); }
function usd(v, d = 0) { return v == null ? '-' : (v < 0 ? '-$' : '$') + Math.abs(Number(v)).toLocaleString('en-US', { maximumFractionDigits: d }); }
function dirWord(d) { return d === 'long' ? 'LONG' : 'SHORT'; }

function metrics(p) {
  const dir = p.direction === 'long' ? 1 : -1;
  const u = p.units;
  return {
    slPnl: u != null ? +(u * (p.stop - p.entry) * dir).toFixed(2) : null,   // + ise kilitli kâr
    tp1: u != null ? +(u * (p.target1 - p.entry) * dir).toFixed(2) : null,
    tp2: u != null ? +(u * (p.target2 - p.entry) * dir).toFixed(2) : null,
  };
}

// SADE mesaj (kullanıcı isteği): yalnız zaman dilimi + giriş/SL/TP. MT5/marj/
// muhtemel-kâr/güven/RR YOK.
function buildNew(p, reverseOf) {
  const pr = p.precision ?? 4;
  const lines = [];
  if (reverseOf && reverseOf.length) lines.push(`🔴⚠️ <b>TERS SİNYAL</b> — zıt yönde açık pozisyon var (#${reverseOf.join(', #')})`);
  lines.push(`📊 <b>FOREX ${dirWord(p.direction)} — ${p.symbol}</b> · <b>#${p.code}</b>`);
  lines.push(`⏱ Zaman dilimi: ${p.tfs.join(', ')}`);
  lines.push(`Giriş: <b>${fmt(p.entry, pr)}</b>`);
  lines.push(`Stop: ${fmt(p.stop, pr)}`);
  lines.push(`TP1: ${fmt(p.target1, pr)} · TP2: ${fmt(p.target2, pr)}`);
  return lines.join('\n');
}

// Güncelleme: yalnız iz-süren yeni stop (MT5 satırı YOK).
function buildUpdate(p, ev) {
  const pr = p.precision ?? 4;
  return [
    `🔄 <b>GÜNCELLEME — #${p.code} ${p.symbol} ${dirWord(p.direction)}</b> (${p.tfs.join(', ')})`,
    `🛡 Yeni Stop: ${fmt(ev.prev.stop, pr)} → <b>${fmt(p.stop, pr)}</b>`,
  ].join('\n');
}

function appNew(p) {
  const pr = p.precision ?? 4;
  return {
    title: `#${p.code} ${dirWord(p.direction)} ${p.symbol} · Güven ${p.confidence}`,
    body: `TF ${p.tfs.join(', ')} · Giriş ${fmt(p.entry, pr)} · SL ${fmt(p.stop, pr)} · TP1 ${fmt(p.target1, pr)}`,
    path: '/firsatlar?tab=forex', channelId: 'borsa-krali-announcements',
  };
}
function appUpdate(p, ev) {
  const pr = p.precision ?? 4;
  const tfPart = (ev.addedTfs && ev.addedTfs.length) ? `+TF ${ev.addedTfs.join(',')} · ` : '';
  return {
    title: `🔄 #${p.code} ${p.symbol} güncellendi`,
    body: `${tfPart}SL ${fmt(p.stop, pr)} · TP1 ${fmt(p.target1, pr)} · TP2 ${fmt(p.target2, pr)}`,
    path: '/firsatlar?tab=forex', channelId: 'borsa-krali-announcements',
  };
}

async function evaluateAndPush(signals) {
  if (process.env.FOREX_PUSH_DISABLED === '1') return { telegram: 0, app: 0, considered: 0, disabled: true };
  const chatId = require('../signalDelivery').signalChannel(); // YALNIZ kanal (DM/app yok)
  const eligible = (signals || []).filter(s => s.confidence >= PUSH_CONFIDENCE);

  let events = [];
  try { events = await withTimeout(tracker.syncPositions(eligible), 12000, 'sync'); }
  catch (e) { logger.error(`[ForexPush] sync: ${e.message}`); return { telegram: 0, app: 0, considered: 0, eligible: eligible.length }; }

  const now = Date.now();
  let tg = 0, app = 0, sent = 0;
  for (const ev of events) {
    const p = ev.position;
    if (ev.type === 'update') {
      // Düzeltme sinyallerini AZALT: YALNIZ stop iz sürünce (anlamlı) gönder —
      // salt TF-katılım / TP değişimi mesajı atma. Üstüne uzun cooldown.
      if (!ev.stopChanged) continue;
      const last = lastSent.get(p.code) || 0;
      if (now - last < UPDATE_COOLDOWN_MS) continue;
    }
    const tgMsg = ev.type === 'new' ? buildNew(p, ev.reverseOf) : buildUpdate(p, ev);
    if (chatId) { try { const r = await withTimeout(telegramService.sendMessage(chatId, tgMsg), 16000, 'tg'); if (r?.success) { tg++; sent++; } } catch (e) { logger.error(`[ForexPush] tg #${p.code}: ${e.message}`); } }
    lastSent.set(p.code, now);
  }
  return { telegram: tg, app, considered: sent, eligible: eligible.length, chatSet: !!chatId };
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
  if (process.env.FOREX_PUSH_DISABLED === '1') return { telegram: 0, app: 0 };
  const chatId = require('../signalDelivery').signalChannel(); // YALNIZ kanal (DM/app yok)
  let tg = 0;
  for (const ev of (events || [])) {
    if (chatId) { try { const r = await withTimeout(telegramService.sendMessage(chatId, buildClosureTelegram(ev)), 16000, 'closeTg'); if (r?.success) tg++; } catch (e) { logger.error(`[ForexPush] closeTg #${ev.code}: ${e.message}`); } }
  }
  if (tg) logger.info(`💱✅ Forex kapanış — ${events.length} · TG ${tg}`);
  return { telegram: tg };
}

module.exports = { evaluateAndPush, pushClosures, buildNew, buildUpdate, PUSH_CONFIDENCE, TARGET_USER_EMAIL };
