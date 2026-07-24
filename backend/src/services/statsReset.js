'use strict';

/**
 * BOT İSTATİSTİK SIFIRLAMA — tek seferlik, env ile tetiklenir (2026-07-24).
 *
 * Kullanıcı: "hesap değiştirdim ... botların istatistiklerini sıfırla ve yeni
 * işlemlerle tekrar baştan başlasınlar. eskileri de unut gitsin."
 *
 * FTMO hesabı değiştiği için eski defterlerin hepsi geçersiz: lider tablosu eski
 * hesabın K/Z'siyle, açık pozisyonlar artık var olmayan ticket'larla, öğrenme
 * katmanı eski hesabın sonuçlarıyla dolu.
 *
 * ── NASIL ÇALIŞIR ────────────────────────────────────────────────────────────
 * Render ortamında kabuk erişimi yok, o yüzden tetik ENV: `BOT_STATS_RESET=<jeton>`
 * (örn. tarih: 2026-07-24). Sunucu açılışında jeton, Supabase'te saklanan son
 * sıfırlama jetonuyla karşılaştırılır; FARKLIYSA sıfırlama yapılır ve jeton
 * kaydedilir. Aynı jetonla yeniden başlatma HİÇBİR ŞEY yapmaz (idempotent).
 * Yeniden sıfırlamak için env'deki jetonu değiştirmek yeterli.
 *
 * ⚠️ SIRA KRİTİK: botPersistence.loadAll()'dan ÖNCE çalışmalı. loadAll,
 * Supabase'teki dosyaları yerel diske geri yazar; sıfırlama sonra çalışırsa
 * yalnız yereli siler ve bir sonraki açılışta her şey geri gelir.
 * Jeton Supabase'te tutulur — Render diski kalıcı DEĞİLDİR, yerel bir işaret
 * dosyası her yeniden başlatmada "sıfırlama yapılmamış" görünür ve istatistikler
 * sonsuza dek silinirdi.
 *
 * ── NE SİLİNİR / NE KORUNUR ──────────────────────────────────────────────────
 * SİLİNİR (işlem geçmişi + durum): yarış defteri, açık kâğıt pozisyonlar, gerçek
 *   MT5 sonuçları, bildirim dedup'ı, öğrenme/devre-kesici durumları, günlük
 *   zarar sayaçları, portföyler/işlem günlükleri.
 * KORUNUR (tanım + araştırma): bot TANIMLARI (custom bot listesi, panel TF
 *   filtreleri), bildirim kanal ayarları, backtest/kalibrasyon çıktıları.
 *   Bunlar hesaptan bağımsızdır; silinirse kullanıcı botlarını yeniden kurar.
 */

const fs = require('fs');
const path = require('path');
const { supabaseAdmin, isSupabaseEnabled } = require('../lib/supabase');

const BUCKET = 'bot-state';
const MARKER_KEY = 'system/stats-reset.json';
const DATA_ROOT = process.env.BOT_DATA_DIR || path.join(__dirname, '..', 'data');

/**
 * botPersistence şemasındaki (subdir/dosya) istatistik dosyaları.
 * ⚠️ 'bot-builder/state.json' ve 'custom-bots/registry.json' BİLEREK YOK:
 * onlar bot TANIMLARIDIR, istatistik değil. 'bot-center' (bildirim ayarları) de yok.
 */
const STAT_FILES = ['portfolio.json', 'positions.json', 'trades.json', 'signal-log.json', 'runs.json', 'learning.json', 'notified.json', 'deals.json', 'consensus-alerts.json'];
const STAT_SUBDIRS = [
  'bot', 'crypto-bot', 'tema34-bot', 'crossover-alerts', 'tema34-scanner',
  'bist-al-scanner', 'pro-signals', 'altin', 'mt5-scanner', 'mt5-bots',
  'bist-al-portfolio', 'bist-portfolio', 'ict-fvg', 'real-results', 'mt5-notify',
];
// Yalnız bu dosyalar silinir (registry.json = yarış defteri; tanım defteri DEĞİL).
const EXTRA_PAIRS = [
  ['bot-competition', 'registry.json'],
  ['bot-builder', 'runner.json'],   // açık kâğıt pozisyonlar (state.json KORUNUR)
];

/** botPersistence şeması DIŞINDA kendi Supabase anahtarını kullanan depolar. */
const STANDALONE_KEYS = [
  'forex/open-signals.json', 'forex/learning.json', 'forex/stats.json', 'forex/day-guard.json',
  'beast/open-signals.json', 'bist-al/open-signals.json', 'bist/open-signals.json',
  'crypto/open-signals.json', 'nr7-shadow/state.json',
];

/** Yerel diskteki tek dosyalık istatistik depoları (Supabase karşılığı yoksa da temizlensin). */
const LOCAL_FILES = [
  'forex-open-signals.json', 'forex-learning.json', 'forex-learning-global.json',
  'forex-stats.json', 'forex-day-guard.json', 'forex-closed-trades.json',
  'beast-open-signals.json', 'crypto-signals-open.json', 'pro-signals-open.json',
  'pro-signals-stats.json', 'altin-open.json', 'altin-stats.json', 'nr7-shadow.json',
];

function token() { return String(process.env.BOT_STATS_RESET || '').trim(); }

async function readMarker() {
  if (!isSupabaseEnabled()) return null;
  try {
    const { data, error } = await supabaseAdmin.storage.from(BUCKET).download(MARKER_KEY);
    if (error || !data) return null;
    const text = typeof data.text === 'function' ? await data.text() : Buffer.from(await data.arrayBuffer()).toString('utf8');
    return JSON.parse(text);
  } catch (_) { return null; }
}

async function writeMarker(value) {
  if (!isSupabaseEnabled()) return;
  try {
    const body = Buffer.from(JSON.stringify({ token: value, at: new Date().toISOString() }), 'utf8');
    await supabaseAdmin.storage.from(BUCKET).upload(MARKER_KEY, body, { contentType: 'application/json', upsert: true });
  } catch (e) {
    console.error('[StatsReset] jeton yazılamadı:', e.message);
  }
}

function localUnlink(rel) {
  const p = path.join(DATA_ROOT, rel);
  try {
    if (!fs.existsSync(p)) return false;
    fs.rmSync(p, { force: true });
    return true;
  } catch (_) { return false; }
}

/** custom-<id> portföy dizinleri: tanım korunur, portföy/işlem sıfırlanır. */
function customPortfolioSubdirs() {
  try {
    return fs.readdirSync(DATA_ROOT, { withFileTypes: true })
      .filter((d) => d.isDirectory() && /^custom-[a-z0-9]+$/i.test(d.name) && d.name !== 'custom-bots')
      .map((d) => d.name);
  } catch (_) { return []; }
}

function allKeys() {
  const keys = [];
  for (const sub of [...STAT_SUBDIRS, ...customPortfolioSubdirs()]) {
    for (const f of STAT_FILES) keys.push(`${sub}/${f}`);
  }
  for (const [sub, f] of EXTRA_PAIRS) keys.push(`${sub}/${f}`);
  keys.push(...STANDALONE_KEYS);
  return keys;
}

async function wipe() {
  const keys = allKeys();
  let remote = 0;
  if (isSupabaseEnabled()) {
    try {
      // Supabase remove() var olmayan anahtarları sessizce atlar.
      const { data, error } = await supabaseAdmin.storage.from(BUCKET).remove(keys);
      if (error) console.error('[StatsReset] Supabase silme hatası:', error.message);
      else remote = Array.isArray(data) ? data.length : 0;
    } catch (e) {
      console.error('[StatsReset] Supabase silme istisnası:', e.message);
    }
  }
  let local = 0;
  for (const k of keys) if (localUnlink(k)) local++;
  for (const f of LOCAL_FILES) if (localUnlink(f)) local++;
  return { remote, local, keys: keys.length };
}

/**
 * Açılışta, botPersistence.loadAll()'dan ÖNCE çağrılır.
 * @returns {Promise<{ran:boolean, reason?:string, remote?:number, local?:number}>}
 */
async function runIfRequested() {
  const want = token();
  if (!want) return { ran: false, reason: 'env-yok' };
  const marker = await readMarker();
  if (marker && marker.token === want) {
    return { ran: false, reason: 'zaten-yapildi' };
  }
  if (!isSupabaseEnabled()) {
    // Jeton saklanamazsa her açılışta silerdi → fail-closed.
    console.warn('[StatsReset] Supabase kapalı — jeton saklanamayacağı için sıfırlama ATLANDI (sonsuz döngü koruması).');
    return { ran: false, reason: 'supabase-kapali' };
  }
  const r = await wipe();
  await writeMarker(want);
  console.log(`[StatsReset] ⚠️ İSTATİSTİKLER SIFIRLANDI (jeton "${want}"): ${r.remote} uzak + ${r.local} yerel dosya silindi. Botlar sıfırdan başlıyor.`);
  return { ran: true, ...r };
}

module.exports = { runIfRequested, allKeys, wipe, STAT_SUBDIRS, STAT_FILES, EXTRA_PAIRS, STANDALONE_KEYS, MARKER_KEY };
