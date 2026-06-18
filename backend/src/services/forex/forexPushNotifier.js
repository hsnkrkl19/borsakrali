/**
 * Forex Push Notifier — Telegram ANA kanal + uygulama-içi (FCM) tek kullanıcı.
 *
 * Güçlü (confidence ≥ eşik) çoklu-TF forex sinyallerini push eder. Her sinyale
 * benzersiz NO (#074A) verilir; ters sinyal (🔴⚠️) ve aynı paritede çoklu açık
 * sinyal durumu belirtilir. Sinyal kapanınca (TP1/STOP/SÜRE) AYNI no ile teyit
 * mesajı gider. Her (enstrüman,TF,yön) için 30 dk cooldown.
 */

const telegramService = require('../telegramService');
const pushNotificationService = require('../pushNotificationService');
const tracker = require('./forexSignalTracker');
const logger = require('../../utils/logger');

const PUSH_CONFIDENCE = 60;
const COOLDOWN_MS = 30 * 60 * 1000;
const TARGET_USER_EMAIL = process.env.FOREX_PUSH_EMAIL || 'hsnkrkl19@gmail.com';

const lastSent = new Map(); // `${id}:${tf}:${dir}` -> ts

// Hiçbir dış çağrı (Telegram/FCM) cron'u dondurmasın — sert zaman aşımı.
function withTimeout(promise, ms, label) {
  return Promise.race([
    Promise.resolve(promise),
    new Promise((_, rej) => setTimeout(() => rej(new Error('timeout:' + label)), ms)),
  ]);
}

function fmt(v, p) { return v == null ? '-' : Number(v).toLocaleString('en-US', { minimumFractionDigits: p, maximumFractionDigits: p }); }
function usd(v, d = 0) { return v == null ? '-' : (v < 0 ? '-$' : '$') + Math.abs(Number(v)).toLocaleString('en-US', { maximumFractionDigits: d }); }

function buildTelegram(s, reg) {
  const p = s.precision ?? 4;
  const z = s.sizing || {}, pnl = s.pnl || {};
  const lines = [];
  if (reg.reverseOf && reg.reverseOf.length) lines.push(`🔴⚠️ <b>TERS SİNYAL</b> — bu paritede zıt yönde açık sinyal var (#${reg.reverseOf.join(', #')})`);
  lines.push(`📊 <b>FOREX ${s.action} — ${s.symbol} (${s.tf})</b>`);
  lines.push(`Sinyal No: <b>#${reg.code}</b>`);
  lines.push(`Güven: <b>${s.confidence}/100</b> (${s.grade}) · ${s.sameTfCount || 1}/5 TF · ${s.horizon}`);
  if (reg.samePairCount > 1) lines.push(`⚠️ Bu paritede şu an <b>${reg.samePairCount}</b> açık sinyal${reg.samePairTFs?.length ? ' (' + reg.samePairTFs.join(', ') + ')' : ''}`);
  lines.push('');
  lines.push(`Giriş: <b>${fmt(s.entry, p)}</b> (piyasa)`);
  lines.push(`Stop: ${fmt(s.stop, p)} | TP1: ${fmt(s.target1, p)} (R/R ${s.rr1}) | TP2: ${fmt(s.target2, p)} (R/R ${s.rr2})`);
  lines.push('');
  lines.push(`💼 Marj: ${usd(z.requiredMarginUsd)} (${z.marginPct}%)`);
  lines.push(`Risk: ${usd(z.riskUsd, 2)} (%${z.riskPct}) · TP1 kâr: ${usd(pnl.tp1ProfitUsd)} · TP2: ${usd(pnl.tp2ProfitUsd)}`);
  lines.push('');
  lines.push(`🤖 MT5: <code>${s.mt5?.summary || '-'}</code>`);
  return lines.filter((l, i) => l !== '' || lines[i - 1] !== '').join('\n');
}

function buildAppPush(s, reg) {
  const p = s.precision ?? 4;
  const z = s.sizing || {};
  const rev = (reg.reverseOf && reg.reverseOf.length) ? '🔴TERS ' : '';
  return {
    title: `${rev}#${reg.code} ${s.action} ${s.symbol} ${s.tf} · Güven ${s.confidence}`,
    body: `Giriş ${fmt(s.entry, p)} · SL ${fmt(s.stop, p)} · TP1 ${fmt(s.target1, p)}`,
    path: '/firsatlar?tab=forex',
    channelId: 'borsa-krali-announcements',
  };
}

async function evaluateAndPush(signals) {
  if (process.env.FOREX_PUSH_DISABLED === '1') return { telegram: 0, app: 0, considered: 0, disabled: true };
  const chatId = process.env.TELEGRAM_FOREX_CHANNEL || process.env.TELEGRAM_CHAT_ID || '';
  const now = Date.now();
  let tg = 0, app = 0, considered = 0, eligible = 0;

  for (const s of (signals || [])) {
    if (s.confidence < PUSH_CONFIDENCE) continue;
    eligible++;
    const key = `${s.id}:${s.tf}:${s.direction}`;
    if (now - (lastSent.get(key) || 0) < COOLDOWN_MS) continue;
    considered++;

    let reg;
    try { reg = await withTimeout(tracker.register(s), 10000, 'register'); } catch (e) { reg = { code: '???', reverseOf: [], samePairCount: 1 }; }

    if (chatId) { try { const r = await withTimeout(telegramService.sendMessage(chatId, buildTelegram(s, reg)), 16000, 'tg'); if (r?.success) tg++; else logger.error(`[ForexPush] tg ${key} basarisiz: ${r?.error || '?'}`); } catch (e) { logger.error(`[ForexPush] tg ${key}: ${e.message}`); } }
    try { const r = await withTimeout(pushNotificationService.sendToUser(TARGET_USER_EMAIL, buildAppPush(s, reg)), 12000, 'app'); if (r?.success) app++; } catch (e) { logger.error(`[ForexPush] app ${key}: ${e.message}`); }

    lastSent.set(key, now);
  }
  return { telegram: tg, app, considered, eligible, chatSet: !!chatId };
}

// ── Kapanış / teyit mesajları (aynı NO ile) ────────────────────────────────
function buildClosureTelegram(ev) {
  const p = ev.precision ?? 4;
  const mins = Math.max(1, Math.round((Date.now() - new Date(ev.issuedAt).getTime()) / 60000));
  const sure = mins >= 60 ? `${Math.floor(mins / 60)}s ${mins % 60}dk` : `${mins}dk`;
  const head = ev.outcome === 'TP1' ? '✅ <b>TP1 OLDU</b>'
    : ev.outcome === 'SL' ? '🛑 <b>STOP OLDU</b>'
    : '⏱️ <b>SÜRE DOLDU (kapandı)</b>';
  const sign = ev.pnlPct >= 0 ? '+' : '';
  return [
    `${head} — <b>#${ev.code}</b> ${ev.symbol} ${ev.tf} (${ev.direction === 'long' ? 'AL' : 'SAT'})`,
    `Giriş ${fmt(ev.entry, p)} → Çıkış ${fmt(ev.exit, p)}`,
    `Sonuç: <b>${sign}${ev.pnlPct}%</b>${ev.pnlUsd != null ? ` (${usd(ev.pnlUsd, 2)})` : ''} · süre ${sure}`,
  ].join('\n');
}

async function pushClosures(events) {
  if (process.env.FOREX_PUSH_DISABLED === '1') return { telegram: 0, app: 0 };
  const chatId = process.env.TELEGRAM_FOREX_CHANNEL || process.env.TELEGRAM_CHAT_ID || '';
  let tg = 0, app = 0;
  for (const ev of (events || [])) {
    if (chatId) { try { const r = await withTimeout(telegramService.sendMessage(chatId, buildClosureTelegram(ev)), 16000, 'closeTg'); if (r?.success) tg++; } catch (e) { logger.error(`[ForexPush] closeTg #${ev.code}: ${e.message}`); } }
    try {
      const sign = ev.pnlPct >= 0 ? '+' : '';
      const head = ev.outcome === 'TP1' ? '✅ TP1' : ev.outcome === 'SL' ? '🛑 STOP' : '⏱️ Süre doldu';
      const r = await withTimeout(pushNotificationService.sendToUser(TARGET_USER_EMAIL, {
        title: `${head} · #${ev.code} ${ev.symbol} ${ev.tf}`,
        body: `${sign}${ev.pnlPct}%${ev.pnlUsd != null ? ` (${usd(ev.pnlUsd, 0)})` : ''} · Giriş ${fmt(ev.entry, ev.precision ?? 4)} → ${fmt(ev.exit, ev.precision ?? 4)}`,
        path: '/firsatlar?tab=forex', channelId: 'borsa-krali-announcements',
      }), 12000, 'closeApp');
      if (r?.success) app++;
    } catch (e) { logger.error(`[ForexPush] closeApp #${ev.code}: ${e.message}`); }
  }
  if (tg || app) logger.info(`💱✅ Forex kapanış teyidi — ${events.length} olay · Telegram ${tg} · App ${app}`);
  return { telegram: tg, app };
}

module.exports = { evaluateAndPush, pushClosures, buildTelegram, PUSH_CONFIDENCE, TARGET_USER_EMAIL };
