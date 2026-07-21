'use strict';

/**
 * botLabels — id → "Bot N · İsim" etiketi (Telegram başlıkları için).
 *
 * Kullanıcı isteği: her botun Telegram sinyali kendi numarası+ismiyle gitsin
 * ("Bot 1 · Forex Sinyalleri", "Bot 5 · MT5 Gün İçi Tarayıcı" …). Katalog donmuş
 * dizi olduğundan yardımcılar ayrı modülde tutulur.
 */

const catalog = require('./catalog');
const byId = new Map(catalog.map((e) => [e.id, e]));

// "Bot 5 · MT5 Gün İçi Tarayıcı" — bilinmeyen/support id'de boş string.
function botLabel(id) {
  const e = byId.get(id);
  return e && e.no ? `Bot ${e.no} · ${e.name}` : '';
}

// Sadece "Bot 5" (kısa). Bilinmeyende boş.
function botTag(id) {
  const e = byId.get(id);
  return e && e.no ? `Bot ${e.no}` : '';
}

// Telegram başlığına ekle: varsa "Bot N · İsim | <başlık>", yoksa <başlık>.
function withBotLabel(id, header) {
  const label = botLabel(id);
  return label ? `${label}\n${header}` : header;
}

module.exports = { botLabel, botTag, withBotLabel, byId: (id) => byId.get(id) || null };
