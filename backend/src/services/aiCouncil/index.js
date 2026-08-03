'use strict';

/**
 * AI KONSEYİ (2026-08-01) — köprüdeki ai_council.py'nin (Ollama + isteğe bağlı
 * Gemini) periyodik kararını saklar ve YALNIZ karar DEĞİŞTİĞİNDE Telegram atar.
 *
 * Spam disiplini: konsey 10 dakikada bir POST eder; her POST'ta mesaj atmak
 * kanalı boğardı. Mesaj yalnız temkin AÇILDIĞINDA ve KAPANDIĞINDA gider.
 *
 * Bellekte tutulur (kalıcı değil): konsey sürekli tazeler; restart sonrası
 * ilk POST'ta durum geri gelir. Kalıcılık gereksiz karmaşıklık olurdu.
 */

let latest = null;          // { caution, scale, providers, atMs, ... }
let lastAnnounced = null;   // en son Telegram'a duyurulan temkin durumu

function html(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function transitionMessage(payload) {
  const lines = [payload.caution
    ? '🧠 <b>AI KONSEYİ: TEMKİN</b> — yeni giriş riski yarıya indi'
    : '🧠 <b>AI KONSEYİ: NORMAL</b> — risk kısıtı kalktı'];
  for (const p of payload.providers || []) {
    if (p && p.yorum) lines.push(`· <i>${html(p.name)}</i>: ${html(p.yorum)}`);
  }
  lines.push('<i>AI yalnız kısar; işlem açmaz, kural gevşetemez.</i>');
  return lines.join('\n');
}

async function sendTransition(payload) {
  try {
    const telegram = require('../telegramService');
    const { signalChannel } = require('../signalDelivery');
    const chatId = process.env.TELEGRAM_TRADE_CHANNEL || signalChannel();
    if (!chatId) return false;
    const r = await telegram.sendMessage(chatId, transitionMessage(payload), 'HTML');
    return r === true || (r && r.success === true);
  } catch (_) { return false; }
}

/** Köprüden gelen konsey kararını kaydet; geçiş varsa duyur. */
async function note(payload) {
  if (!payload || typeof payload !== 'object') return null;
  if (typeof payload.caution !== 'boolean') return null;
  const providers = Array.isArray(payload.providers)
    ? payload.providers.filter((p) => p && typeof p === 'object').slice(0, 8).map((p) => ({
      name: String(p.name || '').slice(0, 60),
      temkin: p.temkin === true,
      guven: Number.isFinite(Number(p.guven)) ? Number(p.guven) : null,
      yorum: String(p.yorum || '').slice(0, 300),
    }))
    : [];
  latest = {
    caution: payload.caution,
    scale: payload.caution ? 0.5 : 1.0,
    providers,
    votes: payload.votes && typeof payload.votes === 'object' ? payload.votes : null,
    atMs: Date.now(),
  };
  let announced = false;
  if (lastAnnounced !== latest.caution) {
    // İlk POST'ta "normal" duyurusu gürültü olur; yalnız temkin AÇILIŞI
    // ilk seferde duyurulur, kapanış ancak önce açılmışsa duyurulur.
    if (latest.caution === true || lastAnnounced === true) {
      announced = await sendTransition(latest);
    }
    lastAnnounced = latest.caution;
  }
  return { stored: true, announced };
}

/** En son konsey kararı; `maxAgeMs` içinde tazelenmemişse null. */
function current(maxAgeMs = 30 * 60 * 1000) {
  if (!latest) return null;
  if (Date.now() - latest.atMs >= maxAgeMs) return null;
  return { ...latest, ageSec: Math.round((Date.now() - latest.atMs) / 1000) };
}

function resetForTest() { latest = null; lastAnnounced = null; }

module.exports = { note, current, transitionMessage, resetForTest };
