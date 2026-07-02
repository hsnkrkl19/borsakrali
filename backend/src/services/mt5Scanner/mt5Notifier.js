/**
 * mt5Notifier — MT5 Gün-içi sinyal bildirimleri.
 *
 * Hedefler (kullanıcı isteği, 2026-07-02):
 *   • Telegram: TELEGRAM_MT5_CHANNEL (ayrı kanal env'i varsa) yoksa ana sinyal
 *     kanalı (signalDelivery.signalChannel() → @borsakraliai).
 *   • Uygulama-içi anlık push: YALNIZ tek kullanıcı — MT5_PUSH_EMAIL
 *     (vars. hsnkrkl19@gmail.com), pushNotificationService.sendToUser.
 *     ⚠️ SIGNALS_CHANNEL_ONLY bu botu bağlamaz: kullanıcı bu bot için app
 *     push'unu AÇIKÇA istedi (Telegram'a EK olarak).
 *   • Mesajda: giriş/SL/TP1/TP2 (MUTLAK — MT5 ile birebir), LOT + kontrat,
 *     marj, muhtemel kâr/zarar $, güven notu, MT5 emir satırı, gün-içi uyarısı.
 *   • Kapanış teyidi aynı NO ile (TP1/SL/GÜN SONU) + $ ve % sonuç.
 *   • Günlük rapor 23:50 TR (gün özeti + toplam isabet).
 *
 * Pozisyon açma SIRAYLA (güven desc) yapılır: her açılış bütçeyi düşürür,
 * sonraki gate çağrısı kalan bütçeye bakar → günlük %5 / toplam %10 kuralı
 * push edilen işlemler toplamı için de garanti edilir.
 * Kill-switch: MT5_PUSH_DISABLED=1 (push yok; site tarafı çalışmaya devam eder).
 */

const telegramService = require('../telegramService');
const pushNotificationService = require('../pushNotificationService');
const signalDelivery = require('../signalDelivery');
const tracker = require('./mt5Tracker');
const logger = require('../../utils/logger');

const PUSH_CONFIDENCE = (() => {
  const v = Number(process.env.MT5_PUSH_MIN_CONF);
  return Number.isFinite(v) && v >= 40 && v <= 95 ? v : 60;
})();
const TARGET_USER_EMAIL = process.env.MT5_PUSH_EMAIL || 'hsnkrkl19@gmail.com';
const APP_PATH = '/firsatlar?tab=mt5';

function channelId() { return process.env.TELEGRAM_MT5_CHANNEL || signalDelivery.signalChannel(); }
function pushDisabled() { return process.env.MT5_PUSH_DISABLED === '1'; }
function withTimeout(promise, ms, label) {
  return Promise.race([Promise.resolve(promise), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout:' + label)), ms))]);
}
function fmt(v, p) { return v == null ? '-' : Number(v).toLocaleString('en-US', { minimumFractionDigits: p, maximumFractionDigits: p }); }
function usd(v) { return v == null ? '-' : `${v < 0 ? '−' : '+'}$${Math.abs(v).toFixed(2)}`; }
function dirWord(d) { return d === 'long' ? 'LONG' : 'SHORT'; }
function dirIcon(d) { return d === 'long' ? '🟢⬆️' : '🔴⬇️'; }

// ── Yeni sinyal mesajı ─────────────────────────────────────────────────────
function buildNew(pos, sig, budget) {
  const pr = pos.precision ?? 4;
  const s = sig.sizing || {};
  const pnl = sig.pnl || {};
  const lines = [];
  lines.push(`⚡ <b>MT5 GÜN-İÇİ ${dirWord(pos.direction)} ${dirIcon(pos.direction)} — ${pos.symbol}</b> · <b>#${pos.code}</b>`);
  lines.push(`⏱ Grafik: <b>${pos.tf}</b> · 🎯 Güven: <b>${pos.confidence}/100</b>${sig.grade ? ` (${sig.grade})` : ''}`);
  lines.push(`Giriş: <b>${fmt(pos.entry, pr)}</b> (piyasa)`);
  lines.push(`🛑 SL: <b>${fmt(pos.stop, pr)}</b> · 🎯 TP1: <b>${fmt(pos.target1, pr)}</b> · TP2: ${fmt(pos.target2, pr)}`);
  lines.push(`📦 Lot: <b>${s.lots}</b> · Marj: $${fmt(s.requiredMarginUsd, 2)} (%${s.marginPct})`);
  lines.push(`💰 Muhtemel: TP1 ${usd(pnl.tp1ProfitUsd)} · TP2 ${usd(pnl.tp2ProfitUsd)} · SL ${usd(-Math.abs(pnl.slLossUsd || 0))}`);
  if (sig.mt5?.summary) lines.push(`🖥 MT5: <code>${sig.mt5.summary}</code>`);
  lines.push(`⏳ Gün-içi işlem — en geç <b>23:45</b>'te kapatılır, ertesi güne/hafta sonuna taşınmaz.`);
  if (budget) lines.push(`📊 Risk bütçesi (kalan): bugün $${fmt(budget.remainingDailyUsd, 0)} · toplam $${fmt(budget.remainingTotalUsd, 0)}`);
  return lines.join('\n');
}

function appNew(pos, sig) {
  const pr = pos.precision ?? 4;
  return {
    title: `⚡ #${pos.code} ${dirWord(pos.direction)} ${pos.symbol} (${pos.tf}) · Güven ${pos.confidence}`,
    body: `Lot ${sig.sizing?.lots} · Giriş ${fmt(pos.entry, pr)} · SL ${fmt(pos.stop, pr)} · TP1 ${fmt(pos.target1, pr)}`,
    path: APP_PATH, channelId: 'borsa-krali-announcements',
  };
}

// ── Kapanış teyidi (aynı NO) ───────────────────────────────────────────────
function buildClosure(ev) {
  const pr = ev.precision ?? 4;
  const mins = Math.max(1, Math.round((Date.now() - new Date(ev.issuedAt).getTime()) / 60000));
  const sure = mins >= 60 ? `${Math.floor(mins / 60)}s ${mins % 60}dk` : `${mins}dk`;
  const head = ev.outcome === 'TP1' ? '✅ <b>TP1 OLDU</b>'
    : ev.outcome === 'SL' ? '🛑 <b>STOP OLDU</b>'
    : '🌙 <b>GÜN SONU KAPANIŞI</b>';
  const sign = ev.pnlPct >= 0 ? '+' : '';
  const usdPart = ev.pnlUsd != null ? ` (<b>${usd(ev.pnlUsd)}</b>)` : '';
  return [
    `${head} — <b>#${ev.code}</b> ${ev.symbol} ${dirWord(ev.direction)} (${ev.tf})`,
    `Giriş ${fmt(ev.entry, pr)} → Çıkış ${fmt(ev.exit, pr)}`,
    `Sonuç: <b>${sign}${ev.pnlPct}%</b>${usdPart} · süre ${sure}`,
  ].join('\n');
}

function appClosure(ev) {
  const head = ev.outcome === 'TP1' ? '✅ TP1' : ev.outcome === 'SL' ? '🛑 STOP' : '🌙 Gün sonu';
  return {
    title: `${head} — #${ev.code} ${ev.symbol} (${ev.tf})`,
    body: `Sonuç ${ev.pnlPct >= 0 ? '+' : ''}${ev.pnlPct}% ${ev.pnlUsd != null ? `(${usd(ev.pnlUsd)})` : ''}`,
    path: APP_PATH, channelId: 'borsa-krali-announcements',
  };
}

async function sendBoth(tgMsg, appPayload) {
  const out = { tg: 0, app: 0 };
  const chat = channelId();
  if (chat) {
    try { const r = await withTimeout(telegramService.sendMessage(chat, tgMsg), 16000, 'tg'); if (r?.success) out.tg = 1; }
    catch (e) { logger.error(`[MT5Push] tg: ${e.message}`); }
  }
  if (appPayload && TARGET_USER_EMAIL) {
    try { const r = await withTimeout(pushNotificationService.sendToUser(TARGET_USER_EMAIL, appPayload), 12000, 'app'); if (r?.success) out.app = 1; }
    catch (e) { logger.error(`[MT5Push] app: ${e.message}`); }
  }
  return out;
}

/**
 * Uygun sinyalleri (güven eşiği + risk kapısı) POZİSYONA çevirip push'la.
 * SIRAYLA (güven desc): her açılış bütçeden düşer, kural toplamda da korunur.
 */
async function evaluateAndPush(snap) {
  if (pushDisabled()) return { telegram: 0, app: 0, opened: 0, disabled: true };
  const signals = (snap?.signals || []).filter((s) => s.status === 'signal' && s.confidence >= PUSH_CONFIDENCE);
  signals.sort((a, b) => b.confidence - a.confidence);
  let tg = 0, app = 0, opened = 0;
  const skipped = {};
  for (const sig of signals) {
    let res;
    try { res = await tracker.openPosition(sig, snap.equity); }
    catch (e) { logger.error(`[MT5Push] open ${sig.id} ${sig.tf}: ${e.message}`); continue; }
    if (!res.ok) { skipped[res.reason] = (skipped[res.reason] || 0) + 1; continue; }
    opened += 1;
    const budget = tracker.budget(snap.equity);
    const sent = await sendBoth(buildNew(res.position, sig, budget), appNew(res.position, sig));
    tg += sent.tg; app += sent.app;
  }
  return { telegram: tg, app, opened, eligible: signals.length, skipped, chatSet: !!channelId() };
}

async function pushClosures(events) {
  if (pushDisabled()) return { telegram: 0, app: 0 };
  let tg = 0, app = 0;
  for (const ev of (events || [])) {
    const sent = await sendBoth(buildClosure(ev), appClosure(ev));
    tg += sent.tg; app += sent.app;
  }
  if (tg) logger.info(`⚡✅ MT5 gün-içi kapanış — ${events.length} · TG ${tg}`);
  return { telegram: tg, app };
}

// ── Günlük rapor (23:50 TR) ────────────────────────────────────────────────
async function pushDailyReport() {
  if (pushDisabled()) return { telegram: 0 };
  await tracker.load();
  const d = tracker.getDayStats();
  const t = tracker.getTotalStats();
  const b = tracker.budget();
  const closedToday = d.tp + d.sl + d.eod;
  const hitToday = closedToday > 0 ? Math.round((d.tp / closedToday) * 100) : null;
  const hitTotal = t.closed > 0 ? Math.round((t.wins / t.closed) * 100) : null;
  const msg = [
    `⚡ <b>MT5 GÜN-İÇİ — GÜNLÜK RAPOR</b> (${d.date})`,
    `Bugün: ${d.opened} işlem açıldı · ✅ TP ${d.tp} · 🛑 SL ${d.sl} · 🌙 Gün sonu ${d.eod}`,
    `Bugün net: <b>${usd(d.realizedUsd)}</b>${hitToday != null ? ` · isabet <b>%${hitToday}</b>` : ''}`,
    `Toplam: ${t.closed} kapalı işlem · net <b>${usd(t.realizedUsd)}</b>${hitTotal != null ? ` · isabet <b>%${hitTotal}</b>` : ''}`,
    `Bütçe: günlük kalan $${fmt(b.remainingDailyUsd, 0)}/$${fmt(b.dailyCapUsd, 0)} · toplam kalan $${fmt(b.remainingTotalUsd, 0)}/$${fmt(b.totalCapUsd, 0)}`,
  ].join('\n');
  const sent = await sendBoth(msg, {
    title: `⚡ MT5 Gün-içi rapor — net ${usd(d.realizedUsd)}`,
    body: `TP ${d.tp} · SL ${d.sl} · Gün sonu ${d.eod}${hitToday != null ? ` · isabet %${hitToday}` : ''}`,
    path: APP_PATH, channelId: 'borsa-krali-announcements',
  });
  logger.info(`⚡📊 MT5 gün-içi günlük rapor — TG ${sent.tg}`);
  return { telegram: sent.tg };
}

module.exports = {
  evaluateAndPush, pushClosures, pushDailyReport,
  buildNew, buildClosure, PUSH_CONFIDENCE, TARGET_USER_EMAIL, channelId,
};
