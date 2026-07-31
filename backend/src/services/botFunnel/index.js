'use strict';

/**
 * BOT HUNİSİ (C1) — her botun günlük yolculuğu, kalıcı sayaç olarak.
 *
 * 2026-07-31 olayı: günlük rapor 36 bot için "işlem yok" diyordu ama bunun
 * NEDENİ hiçbir yerde yazmıyordu. Sinyal mi üretmedi, beyin mi reddetti,
 * emir mi reddedildi — ayırt edilemiyordu. Kayıp işlemler bulunduktan sonra
 * bile "bu bot neden sessiz?" sorusu cevapsız kalıyordu.
 *
 * Huni beş kademedir:
 *   sinyal → onay/ret (sebep) → broker doldurdu → kapandı (net)
 *
 * ⚠️ Neden KAYIT değil SAYAÇ: mt5TradeNotifier'ın aday/karar torbaları
 * boyut sınırlıdır (MAX_RECORDS=12000) ve yoğun bir günde eski satırlar
 * atılır — o torbadan günlük huni türetmek sessizce eksik sayar. Sayaçlar
 * küçüktür, hiç budanmaz, gün anahtarıyla saklanır.
 *
 * Tekilleştirme: bu modül kendi dedup'ını YAPMAZ. Çağıran (notifier) bir
 * olgunun İLK KEZ görüldüğünü zaten bilir (`!old`); sayaç yalnız o noktada
 * artar. Böylece köprünün 5 dakikada bir tekrar POST ettiği aynı kapanış
 * huniyi şişirmez.
 */

const fs = require('fs');
const path = require('path');
const botPersistence = require('../botPersistence');

const SUBDIR = 'bot-funnel';
const FILE = 'funnel.json';
const DATA_DIR = process.env.BOT_FUNNEL_DATA_DIR
  || (process.env.BOT_DATA_DIR
    ? path.join(process.env.BOT_DATA_DIR, SUBDIR)
    : path.join(__dirname, '..', '..', 'data', SUBDIR));
const STATE_FILE = path.join(DATA_DIR, FILE);
const TEST_EPHEMERAL = process.env.NODE_ENV === 'test' && !process.env.BOT_FUNNEL_DATA_DIR;

const TR_OFFSET_SEC = 3 * 3600;     // Türkiye DST uygulamaz — sabit UTC+3
const KEEP_DAYS = 14;
const MAX_REASONS = 12;             // sebep sözlüğü sınırsız büyümesin
const FLUSH_MS = 10000;             // beyin 1 sn'de bir yazar; diske seyrek bas

function freshState() { return { version: 1, days: {}, updatedAt: null }; }

let state = freshState();
let loaded = false;
let dirty = false;
let flushTimer = null;

function trDayKey(atMs = Date.now()) {
  return new Date(atMs + TR_OFFSET_SEC * 1000).toISOString().slice(0, 10);
}

function load() {
  if (loaded) return state;
  loaded = true;
  try {
    if (!TEST_EPHEMERAL && fs.existsSync(STATE_FILE)) {
      const raw = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
      if (raw && typeof raw === 'object' && raw.days && typeof raw.days === 'object') {
        state = { ...freshState(), ...raw, version: 1 };
      }
    }
  } catch (_) { state = freshState(); }
  return state;
}

function writeNow() {
  dirty = false;
  state.updatedAt = new Date().toISOString();
  if (TEST_EPHEMERAL) return;
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    const tmp = `${STATE_FILE}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(state), 'utf8');
    fs.renameSync(tmp, STATE_FILE);
  } catch (_) { /* yerel ayna en iyi çaba */ }
  try { botPersistence.save(SUBDIR, FILE, state); } catch (_) { /* uzak ayna en iyi çaba */ }
}

/** Sayaçlar sık artar; disk yazımı geciktirilir. Okuma anında zorla boşaltılır. */
function scheduleFlush() {
  dirty = true;
  if (flushTimer || TEST_EPHEMERAL) return;
  flushTimer = setTimeout(() => { flushTimer = null; if (dirty) writeNow(); }, FLUSH_MS);
  if (typeof flushTimer.unref === 'function') flushTimer.unref();
}

function flush() { if (dirty) writeNow(); }

function pruneDays() {
  const keys = Object.keys(state.days).sort();
  while (keys.length > KEEP_DAYS) delete state.days[keys.shift()];
}

function bucket(magic, atMs) {
  const m = Number(magic);
  if (!Number.isFinite(m) || m <= 0) return null;      // magic'siz olgu sayılmaz
  load();
  const day = trDayKey(atMs);
  if (!state.days[day]) { state.days[day] = {}; pruneDays(); }
  const bots = state.days[day];
  if (!bots[m]) {
    bots[m] = {
      magic: m, signals: 0, accepted: 0, rejected: 0, reasons: {},
      filled: 0, closed: 0, wins: 0, losses: 0, netUsd: 0,
    };
  }
  return bots[m];
}

function countReason(row, reason) {
  const key = String(reason || 'bilinmiyor').slice(0, 60);
  if (row.reasons[key] === undefined && Object.keys(row.reasons).length >= MAX_REASONS) {
    row.reasons['diğer'] = (row.reasons['diğer'] || 0) + 1;
    return;
  }
  row.reasons[key] = (row.reasons[key] || 0) + 1;
}

/** Beslemeden gelen, işleme dönüşebilecek YENİ aday satır. */
function noteSignal(magic, atMs) {
  const row = bucket(magic, atMs);
  if (!row) return;
  row.signals++;
  scheduleFlush();
}

/** Beynin YENİ kararı: kabul (emir gitti) veya ret (sebebiyle). */
function noteDecision(magic, accepted, reason, atMs) {
  const row = bucket(magic, atMs);
  if (!row) return;
  if (accepted) row.accepted++;
  else { row.rejected++; countReason(row, reason); }
  scheduleFlush();
}

/** Broker gerçekten pozisyon açtı (ilk kez görülen açılış). */
function noteFill(magic, atMs) {
  const row = bucket(magic, atMs);
  if (!row) return;
  row.filled++;
  scheduleFlush();
}

/** Broker pozisyonu kapattı (ilk kez görülen çıkış işlemi). */
function noteClose(magic, netPnl, atMs) {
  const row = bucket(magic, atMs);
  if (!row) return;
  const net = Number(netPnl);
  row.closed++;
  if (Number.isFinite(net)) {
    row.netUsd = Math.round((row.netUsd + net) * 100) / 100;
    if (net > 0) row.wins++; else if (net < 0) row.losses++;
  }
  scheduleFlush();
}

function mergeInto(target, row) {
  target.signals += row.signals; target.accepted += row.accepted;
  target.rejected += row.rejected; target.filled += row.filled;
  target.closed += row.closed; target.wins += row.wins; target.losses += row.losses;
  target.netUsd = Math.round((target.netUsd + row.netUsd) * 100) / 100;
  for (const [reason, count] of Object.entries(row.reasons || {})) {
    target.reasons[reason] = (target.reasons[reason] || 0) + count;
  }
}

/**
 * Son `days` gün için bot başına huni.
 * @returns {{days:string[], bots:Object<string,Object>, totals:Object}}
 */
function funnel(options = {}) {
  load(); flush();
  const want = Math.max(1, Math.min(KEEP_DAYS, Number(options.days) || 1));
  const dayKeys = Object.keys(state.days).sort().slice(-want);
  const bots = {};
  const totals = {
    signals: 0, accepted: 0, rejected: 0, reasons: {},
    filled: 0, closed: 0, wins: 0, losses: 0, netUsd: 0,
  };
  for (const day of dayKeys) {
    for (const [magic, row] of Object.entries(state.days[day] || {})) {
      if (!bots[magic]) {
        bots[magic] = {
          magic: Number(magic), signals: 0, accepted: 0, rejected: 0, reasons: {},
          filled: 0, closed: 0, wins: 0, losses: 0, netUsd: 0,
        };
      }
      mergeInto(bots[magic], row);
      mergeInto(totals, row);
    }
  }
  return { days: dayKeys, bots, totals };
}

/** Tek botun huni satırı; hiç veri yoksa sıfırlı satır (null değil). */
function forMagic(magic, options = {}) {
  const all = funnel(options);
  return all.bots[String(Number(magic))] || {
    magic: Number(magic), signals: 0, accepted: 0, rejected: 0, reasons: {},
    filled: 0, closed: 0, wins: 0, losses: 0, netUsd: 0,
  };
}

/**
 * "Neden sessiz?" — huni satırından tek cümlelik insan açıklaması (C2).
 * Sıra önemli: en erken tıkanan kademe raporlanır.
 */
function explain(row) {
  if (!row || !row.signals) return 'sinyal üretmedi';
  if (row.closed) {
    const isabet = row.closed ? Math.round((row.wins / row.closed) * 100) : 0;
    return `${row.closed} kapanış · %${isabet} isabet`;
  }
  if (row.filled) return `${row.filled} pozisyon açık, kapanan yok`;
  if (row.accepted) return `${row.accepted} emir gitti, broker doldurmadı`;
  if (row.rejected) {
    const top = Object.entries(row.reasons || {}).sort((a, b) => b[1] - a[1])[0];
    return `${row.signals} sinyal, hepsi reddedildi`
      + (top ? ` (${top[0]} ×${top[1]})` : '');
  }
  return `${row.signals} sinyal, karar bekliyor`;
}

function resetForTest() {
  state = freshState(); loaded = false; dirty = false;
  if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
}

module.exports = {
  noteSignal, noteDecision, noteFill, noteClose,
  funnel, forMagic, explain, flush, trDayKey, resetForTest,
};
