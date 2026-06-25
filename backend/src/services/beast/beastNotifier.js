/**
 * beastNotifier — BEAST sinyallerini Telegram kanalına (@borsakraliai) iletir.
 *
 * Kullanıcı isteği (signalDelivery): BIST dışı tüm sinyaller YALNIZ kanala gider.
 * YENİ bot olduğu için push VARSAYILAN KAPALI (BEAST_PUSH_DISABLED!=='0') — kullanıcı
 * canlı doğrulayıp açana kadar kanalı spam'lemez. API/frontend bağımsız çalışır.
 *
 * Push eşiği: BEAST_PUSH_CONFIDENCE (vars. 62). Tracker dedup + kapanış teyidi.
 */

'use strict';

const telegram = require('../telegramService');
const delivery = require('../signalDelivery');
const tracker = require('./beastTracker');

const PUSH_CONFIDENCE = Number(process.env.BEAST_PUSH_CONFIDENCE) || 62;

function pushDisabled() { return process.env.BEAST_PUSH_DISABLED !== '0'; } // VARSAYILAN KAPALI

function fmt(v, p) { return Number(v).toFixed(p); }

function newMsg(p, edge) {
  const arrow = p.direction === 'long' ? '🟢 AL (LONG)' : '🔴 SAT (SHORT)';
  const lines = [
    `🔱 <b>BEAST TREND</b> · ${p.short} · ${p.tf}`,
    `${arrow} · Güven <b>${p.confidence}/100</b> (${p.grade})`,
    `Kod: <b>${p.code}</b>`,
    ``,
    `Giriş: <b>${fmt(p.entry, p.precision)}</b>`,
    `🛡 Stop: ${fmt(p.stop, p.precision)}`,
    `🎯 TP1: ${fmt(p.target1, p.precision)}  ·  TP2: ${fmt(p.target2, p.precision)}`,
    `R/R: ${p.rr1} · Tetik: ${p.trigger}`,
  ];
  if (edge && edge.pf != null) lines.push(`📊 Geçmiş: PF ${edge.pf} · isabet %${edge.winRate}`);
  lines.push(`<i>Sadece altın/gümüş/BTC/ETH · trend-devamı sistemi</i>`);
  return lines.join('\n');
}

function closeMsg(p) {
  const win = (p.pnlPct || 0) > 0;
  const tag = p.outcome === 'TP2' || p.outcome === 'TP1' ? '✅ HEDEF' :
    p.outcome === 'TRAIL' ? '✅ İZ-SÜREN KÂR' : p.outcome === 'BE' ? '➖ BAŞABAŞ' :
    p.outcome === 'SL' ? '❌ STOP' : p.outcome === 'FLIP' ? '🔄 YÖN DEĞİŞTİ' : '⏱ SÜRE DOLDU';
  return [
    `🔱 <b>BEAST</b> · ${p.short} ${p.tf} · ${p.code}`,
    `${tag} → ${p.outcome} ${win ? '✅' : (p.pnlPct < 0 ? '❌' : '')} <b>${p.pnlPct > 0 ? '+' : ''}${p.pnlPct}%</b>`,
  ].join('\n');
}

async function sendToChannel(text) {
  const chat = delivery.signalChannel();
  if (!chat) return false;
  try { await telegram.sendMessage(chat, text, 'HTML'); return true; } catch (_) { return false; }
}

// Sinyalleri değerlendir, eşik üstü olanları tracker'a işle + kanala push et.
async function evaluateAndPush(signals) {
  const eligible = (signals || []).filter(s => s.confidence >= PUSH_CONFIDENCE);
  const events = await tracker.syncPositions(eligible);
  if (pushDisabled()) return { pushed: 0, events: events.length, disabled: true };
  let pushed = 0;
  for (const ev of events) {
    if (ev.type === 'new' || ev.type === 'flip') {
      const edge = require('./beastConfig').edgeFor(ev.position.id, ev.position.tf);
      if (await sendToChannel(newMsg(ev.position, edge))) pushed++;
    }
  }
  return { pushed, events: events.length };
}

// Açık pozisyon kapanışlarını kontrol et + kanala teyit at.
async function pushClosures() {
  const events = await tracker.checkClosures();
  if (pushDisabled()) return { pushed: 0, closed: events.length, disabled: true };
  let pushed = 0;
  for (const ev of events) {
    if (await sendToChannel(closeMsg(ev.position))) pushed++;
  }
  return { pushed, closed: events.length };
}

module.exports = { evaluateAndPush, pushClosures, PUSH_CONFIDENCE, pushDisabled };
