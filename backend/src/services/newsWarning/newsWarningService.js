/**
 * newsWarningService — FTMO/ABD yüksek-etkili haber uyarıları (Telegram)
 *
 * Amaç: Yaklaşan yüksek-etkili ABD (USD) makro haberlerini (NFP, TÜFE/CPI, FOMC,
 * Fed konuşmaları, GSYİH...) kullanıcıya Telegram kanalından ÖNCEDEN duyurmak.
 * Her haber için TAM 3 kez uyarı gider: 24 SAAT, 1 SAAT ve 30 DAKİKA kala.
 *
 * Neden bu kaynak: FTMO'nun kendi ekonomik takvimi de Forex Factory verisini
 * kullanır ve yalnızca Tier-1 (yüksek-etkili) haberlerde işlem kısıtı uygular.
 * Bu servis de aynı Forex Factory ücretsiz JSON beslemesini (anahtarsız) +
 * elle küratörlü statik ECONOMIC_CALENDAR_2026 tabanını birleştirir. Böylece
 * FTMO'nun tescilli/kırılgan `app.fftrader.cz` beslemesini kazımaya gerek kalmaz.
 * Not: /api/market-guard (canlı botların poll'ladığı ±30 dk mola endpoint'i) AYNI
 * mantığı kullanır; bu servis ondan bağımsızdır ve onu DEĞİŞTİRMEZ.
 *
 * Kademeli tetikleme (her dakika çalışan cron ile):
 *   - Her (haber, kademe) çifti yalnız BİR kez gönderilir → kalıcı dedup deposu
 *     (Supabase 'bot-state' bucket'ında news-warning/signal-log.json; restart-güvenli).
 *   - CATCHUP bandı: kısa bir kesintiden sonra bile eşiği yakalar, ama durum kaybı
 *     olsa dahi eski haberleri toplu "geç" göndermez (spam koruması).
 *
 * Kanal: TELEGRAM_NEWS_CHANNEL (opsiyonel özel kanal) → yoksa forex/genel kanal
 *   (signalDelivery.signalChannel() = @borsakraliai) → yoksa TELEGRAM_CHAT_ID.
 * Kill-switch: NEWS_WARNING_DISABLED=1
 */

const fs = require('fs');
const path = require('path');
const telegramService = require('../telegramService');
const signalDelivery = require('../signalDelivery');
const botPersistence = require('../botPersistence');
const { ECONOMIC_CALENDAR_2026 } = require('../economicCalendarService');
const logger = require('../../utils/logger');

// ── Uyarı kademeleri (haber saatine kalan dakika) ──────────────────────────
// atMin: eşik dakika · CATCHUP: eşiğin altında kaç dk'ya kadar hâlâ gönderilir.
// Bantlar ayrık (48>30, 18>0) → bir deltaMin en fazla bir kademeye düşer.
const TIERS = [
  { key: 'd1',  atMin: 1440, label: '1 GUN KALA',      emoji: '⏳' },
  { key: 'h1',  atMin: 60,   label: '1 SAAT KALA',     emoji: '⏰' },
  { key: 'm30', atMin: 30,   label: '30 DAKIKA KALA',  emoji: '🚨' },
];
const CATCHUP_MIN = 12;                 // eşik-altı tolerans (cron aralığı ≥1 dk'yı kapsar)
const HORIZON_MS = 28 * 60 * 60 * 1000; // 24s kademeyi ilk görüşte kaçırmamak için ufuk
const FF_TTL_MS = 60 * 60 * 1000;       // Forex Factory 1 saat cache

// ── Kalıcı dedup deposu (Supabase write-through + yerel dosya) ──────────────
const DATA_ROOT = process.env.BOT_DATA_DIR || path.join(__dirname, '..', '..', 'data');
const STORE_DIR = path.join(DATA_ROOT, 'news-warning');
const STORE_FILE = path.join(STORE_DIR, 'signal-log.json'); // FILES whitelist'inde mevcut
let store = null; // { "<dakika>:<slug>:<tier>": eventMs }

function loadStore() {
  try {
    const raw = fs.readFileSync(STORE_FILE, 'utf8');
    const obj = JSON.parse(raw);
    return obj && typeof obj === 'object' ? obj : {};
  } catch (_) {
    return {};
  }
}

function saveStore(s) {
  try {
    fs.mkdirSync(STORE_DIR, { recursive: true });
    fs.writeFileSync(STORE_FILE, JSON.stringify(s, null, 2), 'utf8');
  } catch (e) {
    logger.error(`[NewsWarning] yerel kayit hatasi: ${e.message}`);
  }
  // Supabase'e debounce'lu write-through ('news-warning' SUBDIRS'e eklendi)
  try { botPersistence.save('news-warning', 'signal-log.json', s); } catch (_) {}
}

function pruneStore(s, now) {
  const cutoff = now - 24 * 60 * 60 * 1000; // haberi geçen kayıtları at
  for (const k of Object.keys(s)) {
    if (!Number.isFinite(s[k]) || s[k] < cutoff) delete s[k];
  }
}

function slug(t) {
  return String(t || '').toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 16);
}
function keyFor(ev, tierKey) {
  return `${Math.round(ev.ms / 60000)}:${slug(ev.title)}:${tierKey}`;
}

// ── Forex Factory ücretsiz JSON (anahtarsız) — 1 saat cache, hata-toleranslı ─
let ffCache = { at: 0, data: [] };
async function fetchForexFactoryRaw() {
  const now = Date.now();
  if (now - ffCache.at < FF_TTL_MS && ffCache.data.length) return ffCache.data;
  if (typeof fetch !== 'function') return ffCache.data; // eski Node → statik yeterli
  const urls = [
    'https://nfs.faireconomy.media/ff_calendar_thisweek.json',
    'https://nfs.faireconomy.media/ff_calendar_nextweek.json',
  ];
  const all = [];
  for (const url of urls) {
    try {
      const r = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 BorsaKrali/1.0' },
        signal: AbortSignal.timeout(15000),
      });
      if (!r.ok) continue;
      const data = await r.json();
      if (Array.isArray(data)) all.push(...data);
    } catch (e) {
      logger.info(`[NewsWarning] ForexFactory ${url} hata: ${e.message}`);
    }
  }
  if (all.length) ffCache = { at: now, data: all };
  // Ağ hatasında iyi olan eski cache'i koru (boş dönme)
  return ffCache.data.length ? ffCache.data : all;
}

// 'YYYY-MM-DD' + 'HH:mm' (TSİ/UTC+3 sabit) → epoch ms. Türkiye DST uygulamaz.
function staticEventToMs(dateStr, timeStr) {
  if (!dateStr || !timeStr || !/^\d{2}:\d{2}/.test(timeStr)) return NaN;
  return Date.parse(`${dateStr}T${timeStr.slice(0, 5)}:00+03:00`);
}

/**
 * Yaklaşan yüksek-etkili ABD (USD) haberlerini birleştir (statik + Forex Factory),
 * dedup'la, [now-5dk, now+HORIZON] penceresine kırp, saate göre sırala.
 * Mutlak zaman için FF'nin ham `item.date` (offset'li ISO) alanı kullanılır —
 * gün/saat string'ine round-trip yapılmaz (gece yarısı tarih kayması bug'ından kaçınır).
 */
async function getUpcomingUsdHighImpact(now) {
  const fromMs = now - 5 * 60 * 1000;
  const toMs = now + HORIZON_MS;
  const seen = new Set();
  const out = [];
  const push = (ms, title, forecast, previous) => {
    if (!Number.isFinite(ms) || ms < fromMs || ms > toMs) return;
    const key = `${Math.round(ms / 60000)}|${String(title || '').slice(0, 24)}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({
      ms,
      title: title || 'ABD verisi',
      forecast: forecast || null,
      previous: previous || null,
    });
  };

  // 1) Statik taban (ağ gerektirmez, her zaman var)
  for (const e of ECONOMIC_CALENDAR_2026) {
    if (e.country !== 'US' || e.importance !== 'high') continue;
    push(staticEventToMs(e.date, e.time), e.title, e.forecast, e.previous);
  }

  // 2) Canlı Forex Factory (Fed konuşmaları dahil) — best-effort
  try {
    const ff = await fetchForexFactoryRaw();
    for (const it of ff) {
      if (it.country !== 'USD' || it.impact !== 'High') continue;
      push(new Date(it.date).getTime(), it.title, it.forecast, it.previous);
    }
  } catch (_) { /* statik yeterli */ }

  out.sort((a, b) => a.ms - b.ms);
  return out;
}

// ── Mesaj biçimlendirme (TSİ) ───────────────────────────────────────────────
const TZ = { timeZone: 'Europe/Istanbul' };
function fmtWhen(ms) {
  const d = new Date(ms);
  const tarih = d.toLocaleDateString('tr-TR', { ...TZ, day: '2-digit', month: '2-digit' });
  const gun = d.toLocaleDateString('tr-TR', { ...TZ, weekday: 'long' });
  const saat = d.toLocaleTimeString('tr-TR', { ...TZ, hour: '2-digit', minute: '2-digit' });
  return `${tarih} ${gun} ${saat}`;
}
function fmtKalan(deltaMin) {
  const m = Math.max(0, Math.round(deltaMin));
  if (m >= 60) {
    const h = Math.floor(m / 60), mm = m % 60;
    return mm ? `${h} saat ${mm} dk` : `${h} saat`;
  }
  return `${m} dk`;
}
function buildMessage(ev, tier, deltaMin) {
  const lines = [
    `${tier.emoji} <b>HABER UYARISI · ${tier.label}</b>`,
    '',
    `🇺🇸 <b>ABD (USD)</b> · ${ev.title}`,
    `🕒 <b>${fmtWhen(ev.ms)}</b> (TSİ) · ~${fmtKalan(deltaMin)} sonra`,
    `📊 Etki: <b>YÜKSEK</b>`,
  ];
  const fp = [];
  if (ev.forecast) fp.push(`Beklenti: ${ev.forecast}`);
  if (ev.previous) fp.push(`Önceki: ${ev.previous}`);
  if (fp.length) lines.push(fp.join(' · '));
  lines.push('');
  lines.push('⚠️ <b>FTMO işlem yasağı:</b> Haberin <b>2 dk öncesi – 2 dk sonrası</b> (Standart hesap) ilgili USD enstrümanlarında pozisyon AÇMAK/KAPATMAK yasaktır. Swing hesap muaftır.');
  lines.push('🤖 Platform botları güvenlik için haber çevresinde <b>±30 dk</b> pozisyon açmaz/kapatır.');
  return lines.join('\n');
}

function channelId() {
  return process.env.TELEGRAM_NEWS_CHANNEL
    || signalDelivery.signalChannel()
    || process.env.TELEGRAM_CHAT_ID
    || '';
}

// ── Her dakika çağrılan ana kadans ──────────────────────────────────────────
let running = false;
async function runCadence() {
  if (process.env.NEWS_WARNING_DISABLED === '1') return { skipped: 'disabled' };
  if (running) return { skipped: 'in-flight' };
  running = true;
  try {
    const cid = channelId();
    if (!cid) {
      logger.info('[NewsWarning] ⚠️ kanal ayarli degil (TELEGRAM_NEWS_CHANNEL / TELEGRAM_FOREX_CHANNEL / TELEGRAM_CHAT_ID) — atlandi');
      return { skipped: 'no-channel' };
    }

    const now = Date.now();
    let events;
    try {
      events = await getUpcomingUsdHighImpact(now);
    } catch (e) {
      logger.error(`[NewsWarning] veri hatasi: ${e.message}`);
      return { error: e.message };
    }

    if (store === null) store = loadStore();

    let sent = 0;
    let changed = false;
    for (const ev of events) {
      const deltaMin = (ev.ms - now) / 60000;
      if (deltaMin <= 0) continue; // haber geçmiş

      // Bandına düşen ve henüz gönderilmemiş kademeyi bul (en fazla biri eşleşir)
      let tier = null;
      for (const t of TIERS) {
        if (store[keyFor(ev, t.key)]) continue; // zaten gönderildi
        if (deltaMin <= t.atMin && deltaMin >= t.atMin - CATCHUP_MIN) { tier = t; break; }
      }
      if (!tier) continue;

      const msg = buildMessage(ev, tier, deltaMin);
      const r = await telegramService.sendMessage(cid, msg);
      if (r && r.success) {
        store[keyFor(ev, tier.key)] = ev.ms;
        changed = true;
        sent++;
        logger.info(`[NewsWarning] ✅ ${tier.key} gönderildi: ${ev.title} @ ${fmtWhen(ev.ms)}`);
      } else {
        logger.error(`[NewsWarning] gönderim başarısız (${tier.key}): ${ev.title} — ${r && r.error}`);
      }
    }

    if (changed) {
      pruneStore(store, now);
      saveStore(store);
    }
    return { considered: events.length, sent };
  } finally {
    running = false;
  }
}

module.exports = {
  runCadence,
  // test/tanı için:
  getUpcomingUsdHighImpact,
  buildMessage,
  TIERS,
  _internals: { fetchForexFactoryRaw, channelId, keyFor },
};
