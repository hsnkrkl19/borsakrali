'use strict';

/**
 * botConsensus — KONSENSÜS RADARI (Bot 37, magic 5749).
 *
 * Kullanıcı isteği (2026-07-23): "yeni bir bot oluştur, tüm botların aynı yönde
 * işlem verdiği pariteleri belirtip '3-5-10 bot AL verdi → alınabilir' veya
 * 'SAT verdi → satılabilir' gibi uyarsın."
 *
 * Çalışma: her turda competition'daki AÇIK pozisyonlar (köprü feed'i = MT5'e
 * gerçekten giden botlar) sembol+yön bazında gruplanır. Aynı sembol+yönde
 * CONSENSUS_MIN (vars. 3) FARKLI bot varsa:
 *   1) Telegram'a konsensüs uyarısı atılır (hangi botlar, kaç bot, seviyeler).
 *   2) Kendisi de o yönde sinyal üretir → yarışa girer → köprüyle MT5'te
 *      GERÇEK işlem açar (magic 5749) — "söylediğimiz her şey bunun için de
 *      geçerli": işlem mantığı + sinyal + 1:1 bildirim.
 *
 * Geri-besleme koruması: kendi pozisyonları (botId=consensus-radar) sayılmaz.
 * Spam koruması: uyarı dedup'ı sembol|yön|gün bazında DİSKE yazılır (restart
 * aynı günü tekrar duyurmaz — NR7 dersi). Sinyal id'si de aynı güne kilitli →
 * competition parmak izi stabil, gün içinde tek pozisyon.
 * Kill: CONSENSUS_DISABLED=1 (motor) · CONSENSUS_PUSH_DISABLED=1 (yalnız mesaj).
 */

const fs = require('fs');
const path = require('path');
const botPersistence = require('../botPersistence');
const instrumentBans = require('../instrumentBans');

const BOT_ID = 'consensus-radar';
const MIN_AGREE = () => Math.max(2, Number(process.env.CONSENSUS_MIN || 3));
const SUBDIR = 'mt5-bots';
const FILE = 'consensus-alerts.json';
const DATA_DIR = process.env.BOT_DATA_DIR
  ? path.join(process.env.BOT_DATA_DIR, SUBDIR)
  : path.join(__dirname, '..', '..', 'data', SUBDIR);
const STATE_FILE = path.join(DATA_DIR, FILE);
const TEST_EPHEMERAL = process.env.NODE_ENV === 'test' && !process.env.CONSENSUS_DATA_DIR;

let alerted = null; // { "SYMBOL|dir|YYYY-MM-DD": count } — o gün duyurulan en yüksek bot sayısı

function dayKey(ms) { return new Date(ms || Date.now()).toISOString().slice(0, 10); }
function median(arr) {
  const v = arr.filter(Number.isFinite).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

function load() {
  if (alerted) return alerted;
  alerted = {};
  try {
    if (!TEST_EPHEMERAL && fs.existsSync(STATE_FILE)) {
      const raw = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
      if (raw && typeof raw === 'object') alerted = raw;
    }
  } catch (_) { /* ilk çalıştırma */ }
  return alerted;
}

function persist() {
  if (TEST_EPHEMERAL) return;
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    // Yalnız son 3 günün anahtarlarını tut (dosya büyümesin).
    const keep = {};
    const cut = Date.now() - 3 * 86400000;
    for (const [k, v] of Object.entries(alerted)) {
      const d = new Date(k.split('|')[2] || 0).getTime();
      if (d > cut) keep[k] = v;
    }
    alerted = keep;
    fs.writeFileSync(STATE_FILE, JSON.stringify(alerted), 'utf8');
  } catch (_) { /* yut */ }
  try { botPersistence.save(SUBDIR, FILE, alerted); } catch (_) { /* yut */ }
}

/**
 * Konsensüs gruplarını çıkarır (saf mantık — test edilebilir).
 * positions: bridgeFeed().positions şekli ({botId, symbol, direction, entry, stop, target1, confidence})
 */
function findConsensus(positions, minAgree = MIN_AGREE()) {
  const groups = new Map();
  for (const p of positions || []) {
    if (!p || p.botId === BOT_ID) continue;               // kendi pozisyonlarını sayma
    if (!(p.symbol && (p.direction === 'long' || p.direction === 'short'))) continue;
    // YASAKLI ENSTRÜMAN (2026-07-24): gümüşte konsensüs oluşsa bile ne uyarı ne
    // pozisyon üretilir (feed'de eski XAGUSD pozisyonları duruyor olabilir).
    if (instrumentBans.isBanned(p.symbol)) continue;
    const key = `${p.symbol}|${p.direction}`;
    if (!groups.has(key)) groups.set(key, new Map());
    const byBot = groups.get(key);
    if (!byBot.has(p.botId)) byBot.set(p.botId, p);       // bot başına TEK oy (çok TF olsa da)
  }
  const out = [];
  for (const [key, byBot] of groups) {
    if (byBot.size < minAgree) continue;
    const [symbol, direction] = key.split('|');
    const rows = [...byBot.values()];
    out.push({
      symbol, direction, count: byBot.size,
      botIds: [...byBot.keys()],
      entry: median(rows.map((r) => Number(r.entry))),
      stop: median(rows.map((r) => Number(r.stop))),
      target1: median(rows.map((r) => Number(r.target1))),
      confidence: Math.min(95, 55 + byBot.size * 8),      // çok bot = yüksek güven
    });
  }
  return out.sort((a, b) => b.count - a.count);
}

function buildMessage(g) {
  const { botLabel } = require('../botCompetition/botLabels');
  const isLong = g.direction === 'long';
  const word = isLong ? 'AL verdi → ALINABİLİR 🟢⬆️' : 'SAT verdi → SATILABİLİR 🔴⬇️';
  const names = g.botIds.map((id) => botLabel(id) || id).slice(0, 8);
  const extra = g.botIds.length > names.length ? ` +${g.botIds.length - names.length} bot` : '';
  return [
    `🤝 <b>${botLabel(BOT_ID) || 'Konsensüs Radarı'}</b>`,
    `<b>${g.symbol}</b> — <b>${g.count} bot ${word}</b>`,
    `Botlar: ${names.join(' · ')}${extra}`,
    g.entry ? `Medyan giriş: <b>${g.entry}</b> · SL: ${g.stop ?? '—'} · TP: ${g.target1 ?? '—'}` : null,
  ].filter(Boolean).join('\n');
}

/**
 * Tur: konsensüsleri bul → (a) Telegram uyarısı (dedup'lı) → (b) kendi
 * sinyallerini competition snapshot'ı olarak döndür (çağıran raceObserve eder).
 */
async function run(positions, options = {}) {
  if (process.env.CONSENSUS_DISABLED === '1') return { disabled: true, signals: [] };
  load();
  const groups = findConsensus(positions, options.minAgree);
  const day = dayKey(options.nowMs);
  const signals = [];
  let alertsSent = 0;

  for (const g of groups) {
    // Sinyal (her koşulda üret — competition parmak izi gün-kilitli, mükerrer açmaz)
    if (g.entry > 0 && g.stop > 0) {
      signals.push({
        signalId: `CONS:${g.symbol}:${g.direction}:${day}`,
        symbol: g.symbol, direction: g.direction,
        entry: g.entry, stop: g.stop, target1: g.target1 || undefined,
        confidence: g.confidence, strategy: 'consensus', tf: '1d', timeframe: '1d',
        agreeCount: g.count, agreeBots: g.botIds,
      });
    }
    // Telegram uyarısı — aynı gün aynı sembol+yön için yalnız bot sayısı ARTARSA tekrar
    const k = `${g.symbol}|${g.direction}|${day}`;
    const prev = Number(alerted[k] || 0);
    if (g.count > prev && process.env.CONSENSUS_PUSH_DISABLED !== '1') {
      alerted[k] = g.count;
      try {
        const telegram = require('../telegramService');
        const { signalChannel } = require('../signalDelivery');
        const chatId = process.env.TELEGRAM_TRADE_CHANNEL || signalChannel();
        if (chatId) { await telegram.sendMessage(chatId, buildMessage(g), 'HTML'); alertsSent++; }
      } catch (_) { /* yut */ }
    }
  }
  if (alertsSent) persist();
  return { signals, groups: groups.length, alertsSent };
}

function resetForTest() { alerted = {}; }

module.exports = { run, findConsensus, buildMessage, resetForTest, BOT_ID };
