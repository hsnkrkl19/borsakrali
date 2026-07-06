/**
 * forexDailyGuard — GÜNLÜK GERÇEKLEŞEN-ZARAR FRENİ (2026-07-06 olayı).
 *
 * Gece boyunca üst üste zarar eden sistemde hiçbir katman "bugün yeter" demiyordu
 * (-%3.3 tek gecede; FTMO günlük %5 limitine ramak kaldı). Bu modül TR-günü bazında
 * gerçekleşen P/L'i iki kaynaktan izler ve eşik aşılınca YENİ pozisyon açılmasını
 * durdurur (mevcutlar yönetilmeye devam eder; GÖLGE pozisyonlar muaf — öğrenme sürer):
 *
 *   • BROKER kaynağı (asıl): VPS köprüsü POST /api/forex/account-report ile gerçek
 *     realizedToday + balance yollar → yüzde = realizedToday / gün-başı bakiye.
 *   • BACKEND kaynağı (yedek): tracker kapanışlarının pnlUsd tahmini (10k$ referans
 *     portföy birimi) → yüzde = toplam / 10.000.
 *
 * KANALLAR (review düzeltmesi — köprü kapanışı backend'den ÖNCE yakalar, rapor
 * sidecar'ı ölürse fren kör kalmamalı):
 *   1) noteBroker  — /account-report'tan realizedToday+balance (rapor sidecar'ı).
 *   2) recordBridgeClose — POST /api/forex/closed'un profit'i (ana köprü; gerçek USD).
 *      İki kanal AYNI gerçeğin iki ölçümü → en NEGATİF olanı esas alınır (çifte sayım yok).
 *   3) recordBackendClose — tracker'ın kendi kapanış tahmini (10k$ referans birim).
 *      YALNIZ hiçbir broker verisi yokken devreye giren SON ÇARE; kendi USD eşiği var
 *      (10k-referans $ ≠ gerçek hesap $ — yüzdeyle karıştırılamaz, review bulgusu).
 *
 * Eşikler: FOREX_DAILY_LOSS_STOP_PCT (vars. 2.5, bakiye biliniyorsa) ·
 * FOREX_DAILY_LOSS_STOP_USD (vars. 2500, bakiye bilinmiyorsa mutlak) ·
 * FOREX_DAILY_LOSS_STOP_BACKEND_USD (vars. 800 ≈ 4 tam-SL @10k-referans).
 * Kill: FOREX_DAILY_GUARD_DISABLED=1. Veri yoksa FAIL-OPEN (engelleme yok).
 * Kalıcılık: disk + Supabase 'bot-state/forex/day-guard.json' (deploy'u atlatır —
 * kötü günün ortasındaki deploy freni sıfırlamasın).
 */

const fs = require('fs');
const path = require('path');
const logger = require('../../utils/logger');

let supa = null, supaEnabled = () => false;
try { const m = require('../../lib/supabase'); supa = m.supabaseAdmin; supaEnabled = m.isSupabaseEnabled; } catch (_) {}

const BUCKET = 'bot-state';
const SUPA_KEY = 'forex/day-guard.json';
const baseDir = process.env.FOREX_OPEN_FILE
  ? path.dirname(process.env.FOREX_OPEN_FILE)
  : path.join(__dirname, '..', '..', 'data');
const FILE = process.env.FOREX_DAY_GUARD_FILE || path.join(baseDir, 'forex-day-guard.json');

function envNum(name, def) { const v = Number(process.env[name]); return Number.isFinite(v) ? v : def; }
const guardOff = () => process.env.FOREX_DAILY_GUARD_DISABLED === '1';
const stopPct = () => envNum('FOREX_DAILY_LOSS_STOP_PCT', 2.5);

const TR_OFFSET_MS = 3 * 3600 * 1000; // TR sabit UTC+3
function trDay(nowMs = Date.now()) {
  return new Date(nowMs + TR_OFFSET_MS).toISOString().slice(0, 10);
}

let state = { day: null, backendPnlUsd: 0, bridgeRealizedUsd: 0, brokerRealized: null, brokerBalance: null, brokerUpdatedSec: 0 };
let loaded = false;
let saveTimer = null;
let lastBlockLogDay = null;

function load() {
  if (loaded) return;
  loaded = true;
  try {
    if (fs.existsSync(FILE)) {
      const p = JSON.parse(fs.readFileSync(FILE, 'utf8'));
      if (p && typeof p === 'object') state = { ...state, ...p };
    }
  } catch (_) {}
}

// Boot restore (best-effort, forexSignalTracker.load() çağırır)
let restored = false;
async function restore() {
  if (restored) return;
  restored = true;
  if (!(supaEnabled && supaEnabled())) return;
  try {
    const { data } = await Promise.race([
      supa.storage.from(BUCKET).download(SUPA_KEY),
      new Promise((_, rej) => setTimeout(() => rej(new Error('supa-timeout')), 8000)),
    ]);
    if (!data) return;
    const text = typeof data.text === 'function' ? await data.text() : Buffer.from(await data.arrayBuffer()).toString('utf8');
    const p = JSON.parse(text);
    // BAYAT snapshot koruması (review): Supabase upload 2.5s debounce'lu — çökme
    // anında disk taze, bulut eski olabilir. Yalnız BUGÜNÜN snapshot'ı ve alan
    // bazında EN MUHAFAZAKÂR (en negatif) değerlerle birleştirilir; dünün
    // snapshot'ı bugünkü tetiklenmiş freni ASLA geri açamaz.
    if (p && typeof p === 'object' && p.day === trDay()) {
      load(); rollover();
      state.backendPnlUsd = Math.min(state.backendPnlUsd || 0, Number(p.backendPnlUsd) || 0);
      state.bridgeRealizedUsd = Math.min(state.bridgeRealizedUsd || 0, Number(p.bridgeRealizedUsd) || 0);
      if (p.brokerRealized != null && Number.isFinite(Number(p.brokerRealized))
          && (state.brokerRealized == null || (Number(p.brokerUpdatedSec) || 0) > (state.brokerUpdatedSec || 0))) {
        state.brokerRealized = Number(p.brokerRealized);
        state.brokerUpdatedSec = Number(p.brokerUpdatedSec) || 0;
      }
      if (state.brokerBalance == null && Number(p.brokerBalance) > 0) state.brokerBalance = Number(p.brokerBalance);
      persist(false);
    }
  } catch (_) {}
}

function persist(remote = true) {
  try {
    const dir = path.dirname(FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(state, null, 2), 'utf8');
  } catch (_) {}
  if (remote && supaEnabled && supaEnabled()) {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      try { await supa.storage.from(BUCKET).upload(SUPA_KEY, Buffer.from(JSON.stringify(state), 'utf8'), { contentType: 'application/json', upsert: true }); } catch (_) {}
    }, 2500);
    if (saveTimer.unref) saveTimer.unref();
  }
}

function rollover() {
  load();
  const today = trDay();
  if (state.day !== today) {
    state = { day: today, backendPnlUsd: 0, bridgeRealizedUsd: 0, brokerRealized: null, brokerBalance: state.brokerBalance ?? null, brokerUpdatedSec: 0 };
    persist();
  }
  if (state.bridgeRealizedUsd == null) state.bridgeRealizedUsd = 0; // eski persist edilmiş şema
}

/** Tracker kapanışı (backend tahmini, 10k$ referans birim). Gölge kapanışları GÖNDERME. */
function recordBackendClose(pnlUsd) {
  if (!Number.isFinite(Number(pnlUsd))) return;
  rollover();
  state.backendPnlUsd = +(state.backendPnlUsd + Number(pnlUsd)).toFixed(2);
  persist();
}

/** Ana köprünün POST /closed ile bildirdiği GERÇEK USD kapanış P/L'i. */
function recordBridgeClose(pnlUsd) {
  if (!Number.isFinite(Number(pnlUsd))) return;
  rollover();
  state.bridgeRealizedUsd = +(state.bridgeRealizedUsd + Number(pnlUsd)).toFixed(2);
  persist();
}

/** Köprünün /account-report POST'u: gerçek broker günlük P/L + bakiye. */
function noteBroker(payload = {}) {
  rollover();
  const rt = Number(payload.realizedToday);
  const bal = Number(payload.balance);
  let changed = false;
  if (Number.isFinite(rt)) { state.brokerRealized = rt; state.brokerUpdatedSec = Math.floor(Date.now() / 1000); changed = true; }
  if (Number.isFinite(bal) && bal > 0) { state.brokerBalance = bal; changed = true; }
  if (changed) persist();
}

/** { blocked, reason } — eşik aşıldıysa YENİ gerçek pozisyon açılmamalı. */
function check() {
  if (guardOff()) return { blocked: false, reason: 'disabled' };
  const pct = stopPct();
  if (!(pct > 0)) return { blocked: false, reason: 'threshold-off' };
  rollover();
  // GERÇEK USD kanalları: account-report VE köprü-kapanış toplamı aynı gerçeğin iki
  // ölçümü → en NEGATİF olanı esas al (çifte sayım yok; hangisi daha eksiksizse o kazanır).
  const candidates = [];
  if (state.brokerRealized != null && Number.isFinite(state.brokerRealized)) candidates.push(state.brokerRealized);
  if (state.bridgeRealizedUsd < 0) candidates.push(state.bridgeRealizedUsd);
  if (candidates.length) {
    const dayPnl = Math.min(...candidates);
    if (state.brokerBalance != null && state.brokerBalance > 0) {
      const dayStart = state.brokerBalance - dayPnl; // gün-başı bakiye ≈ bakiye − bugünkü gerçekleşen
      if (dayStart > 0) {
        const p = (dayPnl / dayStart) * 100;
        if (p <= -pct) return { blocked: true, reason: `broker günlük P/L %${p.toFixed(2)} ≤ -%${pct}` };
      }
    } else {
      const usdCap = envNum('FOREX_DAILY_LOSS_STOP_USD', 2500);
      if (usdCap > 0 && dayPnl <= -usdCap) {
        return { blocked: true, reason: `broker günlük P/L ${dayPnl.toFixed(2)}$ ≤ -${usdCap}$ (bakiye bilinmiyor, mutlak eşik)` };
      }
    }
    return { blocked: false }; // gerçek veri var ve eşik altında → backend tahminine BAKILMAZ
  }
  // SON ÇARE — backend tahmini (10k$ referans birim; gerçek hesapla ölçek farkı
  // nedeniyle yüzdeye çevrilmez, kendi USD eşiği vardır: vars. 800 ≈ 4 tam-SL).
  const backendCap = envNum('FOREX_DAILY_LOSS_STOP_BACKEND_USD', 800);
  if (backendCap > 0 && state.backendPnlUsd <= -backendCap) {
    return { blocked: true, reason: `backend günlük P/L tahmini ${state.backendPnlUsd.toFixed(2)}$ ≤ -${backendCap}$ (10k referans)` };
  }
  return { blocked: false };
}

/** Blok başına günde bir kez logla (spam yok). true = bloklu. */
function blockedWithLog() {
  const r = check();
  if (r.blocked && lastBlockLogDay !== state.day) {
    lastBlockLogDay = state.day;
    logger.warn(`[Forex] 🛑 GÜNLÜK ZARAR FRENİ: ${r.reason} — bugün YENİ pozisyon yok (mevcutlar yönetilir, gölge sürer).`);
  }
  return r.blocked;
}

function status() { rollover(); return { ...state, ...check(), stopPct: stopPct() }; }
function _resetForTest() { state = { day: null, backendPnlUsd: 0, bridgeRealizedUsd: 0, brokerRealized: null, brokerBalance: null, brokerUpdatedSec: 0 }; loaded = true; lastBlockLogDay = null; }

module.exports = { recordBackendClose, recordBridgeClose, noteBroker, check, blockedWithLog, status, restore, trDay, _resetForTest, FILE };
