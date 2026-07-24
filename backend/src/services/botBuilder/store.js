'use strict';

/**
 * Bot Builder deposu — kalıcı ayarlar.
 *  - botSettings: 15 mevcut bot için zaman-dilimi FİLTRESİ (boş = tüm TF'ler).
 *  - customBots:  kullanıcının panelden oluşturduğu botlar (16., 17. ...).
 *
 * Disk (data/bot-builder/state.json) + Supabase write-through (botPersistence),
 * competition deposuyla aynı desen.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const botPersistence = require('../botPersistence');
const instrumentBans = require('../instrumentBans');

const DATA_DIR = process.env.BOT_BUILDER_DATA_DIR
  || path.join(process.env.BOT_DATA_DIR || path.join(__dirname, '..', '..', 'data'), 'bot-builder');
const STATE_FILE = path.join(DATA_DIR, 'state.json');
const TEST_EPHEMERAL = process.env.NODE_ENV === 'test' && !process.env.BOT_BUILDER_DATA_DIR;

// ⚠️ INVARYANT: catalogMeta'da bir botun ilan ettiği HER TF burada olmalı. Yoksa
// sanitizeTfs onu sessizce atar → panelden o TF seçilemez VE tfAllowed false
// dönüp o TF'nin pozisyonları köprü feed'inden düşer (geri açmanın yolu da yok).
// '30m' bu yüzden eklendi (bk-xau / Bot 38 swing motoru M30 sinyal üretir).
const ALL_TF = ['1m', '5m', '15m', '30m', '1h', '4h', '1d', '1w'];
const MAX_CUSTOM = 40;

function nowISO() { return new Date().toISOString(); }
function freshState() { return { version: 1, botSettings: {}, customBots: [], updatedAt: nowISO() }; }

let state = freshState();
let loaded = false;

function mergeState(raw) {
  const base = freshState();
  if (!raw || typeof raw !== 'object') return base;
  if (raw.botSettings && typeof raw.botSettings === 'object') {
    for (const [id, s] of Object.entries(raw.botSettings)) {
      if (!s || typeof s !== 'object') continue;
      base.botSettings[String(id)] = { timeframes: sanitizeTfs(s.timeframes) };
    }
  }
  // Diskten/Supabase'ten geri yüklenen botlar normalizeCustom'dan GEÇMEZ → yasak
  // enstrüman eski bir kayıtla geri sızabilirdi. pairs burada da süzülür (2026-07-24).
  if (Array.isArray(raw.customBots)) {
    base.customBots = raw.customBots.filter(Boolean).slice(0, MAX_CUSTOM)
      .map((b) => (Array.isArray(b.pairs) ? { ...b, pairs: instrumentBans.filterSymbols(b.pairs) } : b));
  }
  base.updatedAt = raw.updatedAt || base.updatedAt;
  return base;
}

function persist() {
  state.updatedAt = nowISO();
  if (TEST_EPHEMERAL) return;
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
  } catch (_) { /* Supabase write-through yine denenir */ }
  try { botPersistence.save('bot-builder', 'state.json', state); } catch (_) {}
}

function reload() {
  let raw = null;
  try {
    if (TEST_EPHEMERAL) throw new Error('ephemeral');
    if (fs.existsSync(STATE_FILE)) raw = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch (_) { raw = null; }
  state = mergeState(raw);
  loaded = true;
  return state;
}
function load() { if (!loaded) reload(); return state; }

function sanitizeTfs(tfs) {
  if (!Array.isArray(tfs)) return [];
  return [...new Set(tfs.map((t) => String(t).trim()).filter((t) => ALL_TF.includes(t)))];
}

// ── 15 mevcut bot: TF filtresi ────────────────────────────────────────────────
function getBotTimeframes(botId) {
  load();
  const s = state.botSettings[String(botId)];
  return s && Array.isArray(s.timeframes) ? s.timeframes : [];
}
function setBotTimeframes(botId, timeframes) {
  load();
  state.botSettings[String(botId)] = { timeframes: sanitizeTfs(timeframes) };
  persist();
  return state.botSettings[String(botId)];
}
/** Bir botun bir TF'yi çalıştırıp çalıştırmayacağı (filtre boşsa hepsi açık). */
function tfAllowed(botId, tf) {
  const list = getBotTimeframes(botId);
  if (!list.length) return true;
  return list.includes(String(tf));
}

// ── Custom botlar (16., 17. ...) ──────────────────────────────────────────────
function normalizeCustom(input) {
  const { INDICATOR_IDS } = require('./customBotEngine');
  const name = String(input.name || '').trim().slice(0, 40) || 'Yeni Bot';
  const indicators = [...new Set((Array.isArray(input.indicators) ? input.indicators : [])
    .map((x) => String(x)).filter((x) => INDICATOR_IDS.includes(x)))];
  const timeframes = sanitizeTfs(input.timeframes);
  // YASAKLI ENSTRÜMAN (2026-07-24): kullanıcı panelden gümüş/XAGUSD seçse veya
  // PATCH ile sonradan eklemeye çalışsa da parite listesine giremez.
  const pairs = instrumentBans.filterSymbols([...new Set((Array.isArray(input.pairs) ? input.pairs : [])
    .map((x) => String(x).trim().toUpperCase()).filter(Boolean))].slice(0, 12));
  const logic = input.logic === 'majority' ? 'majority' : 'all';
  const ictStrategy = input.ictStrategy ? String(input.ictStrategy) : null;
  return {
    name, indicators, timeframes: timeframes.length ? timeframes : ['1h'], pairs,
    logic, ictStrategy,
    params: (input.params && typeof input.params === 'object') ? input.params : {},
    atrSlMult: Number(input.atrSlMult) > 0 ? Number(input.atrSlMult) : 1.5,
    atrTpMult: Number(input.atrTpMult) > 0 ? Number(input.atrTpMult) : 2.5,
    enabled: input.enabled !== false,
  };
}

function listCustom() { load(); return state.customBots.slice(); }

function createCustom(input) {
  load();
  if (state.customBots.length >= MAX_CUSTOM) { const e = new Error('En fazla ' + MAX_CUSTOM + ' özel bot.'); e.code = 'LIMIT'; throw e; }
  const norm = normalizeCustom(input || {});
  if (!norm.indicators.length && !norm.ictStrategy) { const e = new Error('En az bir indikatör veya ICT stratejisi seç.'); e.code = 'BAD'; throw e; }
  if (!norm.pairs.length) { const e = new Error('En az bir parite seç.'); e.code = 'BAD'; throw e; }
  // Stabil magic: 5800'den başlayan ilk boş numara (köprüde ayrı işlem kimliği).
  // 5700-5799 katalog botlarına ayrılmıştır (mt5Bots + ICT ailesi 5730-5739).
  const used = new Set(state.customBots.map((b) => b.magic).filter(Boolean));
  let magic = 5800; while (used.has(magic)) magic++;
  const bot = { id: 'custom-' + crypto.randomBytes(4).toString('hex'), magic, createdAt: nowISO(), ...norm };
  state.customBots.push(bot);
  persist();
  return bot;
}

function updateCustom(id, patch) {
  load();
  const idx = state.customBots.findIndex((b) => b.id === String(id));
  if (idx < 0) { const e = new Error('Özel bot bulunamadı.'); e.code = 'NOT_FOUND'; throw e; }
  const cur = state.customBots[idx];
  const merged = normalizeCustom({ ...cur, ...(patch || {}) });
  state.customBots[idx] = { ...cur, ...merged };
  persist();
  return state.customBots[idx];
}

function deleteCustom(id) {
  load();
  const before = state.customBots.length;
  state.customBots = state.customBots.filter((b) => b.id !== String(id));
  if (state.customBots.length === before) { const e = new Error('Özel bot bulunamadı.'); e.code = 'NOT_FOUND'; throw e; }
  persist();
  // YETİM POZİSYON TEMİZLİĞİ: botun açık kağıt pozisyonları da düşer, yoksa
  // köprü feed'inde SL/TP'si hiç kontrol edilmeyen bir işlem kalırdı.
  // (lazy require — customBotRunner bu modülü require ediyor, döngüyü kırar)
  try { require('./customBotRunner').purgeBot(String(id)); } catch (_) {}
  return { ok: true };
}

module.exports = {
  ALL_TF, load, reload,
  getBotTimeframes, setBotTimeframes, tfAllowed,
  listCustom, createCustom, updateCustom, deleteCustom,
  _dangerouslyResetForTest() { state = freshState(); loaded = true; },
};
