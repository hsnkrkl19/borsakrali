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

// SADE mesaj (kullanıcı isteği): yalnız giriş/stop/TP + varsa destek/direnç.
// Güven, kod, R/R, tetik, geçmiş istatistik vb. çıkarıldı.
function newMsg(p) {
  const arrow = p.direction === 'long' ? '🟢 AL' : '🔴 SAT';
  const lines = [
    `🔱 <b>${p.short}</b> · ${arrow}`,
    ``,
    `Giriş: <b>${fmt(p.entry, p.precision)}</b>`,
    `🛡 Stop: ${fmt(p.stop, p.precision)}`,
    `🎯 TP1: ${fmt(p.target1, p.precision)}  ·  TP2: ${fmt(p.target2, p.precision)}`,
  ];
  if (p.support != null) lines.push(`🟩 Destek: ${fmt(p.support, p.precision)}`);
  if (p.resistance != null) lines.push(`🟥 Direnç: ${fmt(p.resistance, p.precision)}`);
  return lines.join('\n');
}

function closeMsg(p) {
  const win = (p.pnlPct || 0) > 0;
  const arrow = p.direction === 'long' ? 'AL' : 'SAT';
  const tag = p.outcome === 'TP2' || p.outcome === 'TP1' ? '✅ HEDEF' :
    p.outcome === 'TRAIL' ? '✅ İZ-SÜREN KÂR' : p.outcome === 'BE' ? '➖ BAŞABAŞ' :
    p.outcome === 'SL' ? '❌ STOP' : p.outcome === 'FLIP' ? '🔄 YÖN DEĞİŞTİ' : '⏱ SÜRE DOLDU';
  return [
    `🔱 <b>${p.short}</b> · ${arrow} kapandı`,
    `${tag}  <b>${p.pnlPct > 0 ? '+' : ''}${p.pnlPct}%</b>`,
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
      if (await sendToChannel(newMsg(ev.position))) pushed++;
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

module.exports = { evaluateAndPush, pushClosures, newMsg, closeMsg, PUSH_CONFIDENCE, pushDisabled };
