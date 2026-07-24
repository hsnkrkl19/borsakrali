'use strict';

/**
 * Custom Bot Runner — kullanıcının oluşturduğu botları canlı çalıştırır.
 *
 * Her etkin custom bot için: parite × zaman-dilimi kombinasyonlarında mum çeker,
 * customBotEngine ile (indikatör oyları + opsiyonel ICT teyidi) sinyal üretir,
 * KAĞIT pozisyon açar/kapatır (SL/TP MT5-benzeri fiyatla) ve her botun P/L'ini
 * hesaplar. feed() köprüye açık pozisyonları verir → gerçek MT5 emri açılır.
 *
 * Kalıcılık: data/bot-builder/runner.json + Supabase.
 */

const fs = require('fs');
const path = require('path');
const store = require('./store');
const engine = require('./customBotEngine');
const botPersistence = require('../botPersistence');
const instrumentBans = require('../instrumentBans');

const DATA_DIR = process.env.BOT_BUILDER_DATA_DIR
  || path.join(process.env.BOT_DATA_DIR || path.join(__dirname, '..', '..', 'data'), 'bot-builder');
const RUNNER_FILE = path.join(DATA_DIR, 'runner.json');
const TEST_EPHEMERAL = process.env.NODE_ENV === 'test' && !process.env.BOT_BUILDER_DATA_DIR;
const FETCH_LIMIT = 320;
const MAX_TRADES = 500;

function nowISO() { return new Date().toISOString(); }
function round(v, d = 8) { const n = Number(v); return Number.isFinite(n) ? Math.round(n * 10 ** d) / 10 ** d : 0; }

let rstate = { open: {}, trades: [] };
let loaded = false;

function persist() {
  if (TEST_EPHEMERAL) return;
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(RUNNER_FILE, JSON.stringify(rstate), 'utf8');
  } catch (_) {}
  try { botPersistence.save('bot-builder', 'runner.json', rstate); } catch (_) {}
}
function load() {
  if (loaded) return rstate;
  try {
    if (!TEST_EPHEMERAL && fs.existsSync(RUNNER_FILE)) {
      const raw = JSON.parse(fs.readFileSync(RUNNER_FILE, 'utf8'));
      if (raw && typeof raw === 'object') rstate = { open: raw.open || {}, trades: Array.isArray(raw.trades) ? raw.trades : [] };
    }
  } catch (_) { rstate = { open: {}, trades: [] }; }
  loaded = true;
  return rstate;
}

/**
 * Sunucu açılışında, botPersistence.loadAll() diskteki runner.json'ı Supabase'ten
 * geri yazdıktan SONRA çağrılır. Şart: köprünün 5 sn'de bir gelen feed POST'u
 * loadAll bitmeden düşerse lazy load() BOŞ state'i cache'ler ve geri yüklenen
 * dosya hiç okunmazdı (competitionManager.reload ile aynı desen).
 */
function reload() { loaded = false; return load(); }

/**
 * Silinen bir botun AÇIK kağıt pozisyonlarını düşürür. Şart: run() artık o botu
 * gezmediği için SL/TP hiç kontrol edilmez → pozisyon feed'de sonsuza dek kalır
 * ve köprüdeki gerçek MT5 işlemi kimsenin kapatmadığı bir yetim olurdu.
 * Feed'den düşmesi köprüde gerçek işlemi de kapatır (close_on_backend_close).
 */
function purgeBot(botId) {
  load();
  const id = String(botId);
  let removed = 0;
  for (const [key, pos] of Object.entries(rstate.open)) {
    if (pos && String(pos.botId) === id) { delete rstate.open[key]; removed++; }
  }
  if (removed) persist();
  return removed;
}

function toMs(raw) {
  return (raw || [])
    .filter((c) => c && Number.isFinite(c.open) && Number.isFinite(c.close))
    .map((c) => ({ time: c.time < 1e12 ? c.time * 1000 : c.time, open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume || 0 }));
}

/**
 * Bir turu çalıştır: sinyal aç/kapat. Bağımlılıklar enjekte edilebilir (test).
 */
async function run(deps = {}) {
  load();
  const forexKlines = deps.forexKlines || require('../forex/forexKlines');
  const getInstrument = deps.getInstrument || require('../forex/forexInstruments').getInstrument;
  const ictSmc = deps.ictSmc || require('../ictSmc/ictSmcService');

  const bots = store.listCustom().filter((b) => b.enabled);
  let opened = 0, closed = 0;

  for (const bot of bots) {
    // YETİM POZİSYON KORUMASI: bot.pairs'ten düşmüş (örn. yasaklanmış) ama hâlâ
    // AÇIK duran pozisyonların paritesi de gezilir — yoksa key hiç ziyaret
    // edilmez, SL/TP kontrolü çalışmaz ve pozisyon feed'de sonsuza dek kalırdı.
    const openPairs = Object.values(rstate.open)
      .filter((p) => p && p.botId === bot.id && p.instrumentId)
      .map((p) => p.instrumentId);
    for (const pair of [...new Set([...bot.pairs, ...openPairs])]) {
      const inst = getInstrument(pair);
      const yahoo = inst ? inst.yahoo : pair;
      const symbol = inst ? inst.symbol : pair;
      for (const tf of bot.timeframes) {
        const key = `${bot.id}|${pair}|${tf}`;
        let candles;
        try {
          candles = toMs(await forexKlines.fetchCandles(yahoo, tf, FETCH_LIMIT));
        } catch (_) { continue; }
        if (candles.length < 60) continue;
        const price = candles[candles.length - 1].close;

        // Açık pozisyon var mı? → SL/TP kontrolü
        const pos = rstate.open[key];
        if (pos) {
          const hitStop = pos.side === 'long' ? price <= pos.stop : price >= pos.stop;
          const hitTP = pos.side === 'long' ? price >= pos.target : price <= pos.target;
          if (hitStop || hitTP) {
            const exit = hitStop ? pos.stop : pos.target;
            const risk = Math.abs(pos.entry - pos.stop) || 1e-9;
            const r = ((pos.side === 'long' ? exit - pos.entry : pos.entry - exit) / risk);
            rstate.trades.push({
              botId: bot.id, botName: bot.name, symbol: pos.symbol, tf, side: pos.side,
              entry: pos.entry, exit: round(exit), outcome: hitStop ? 'SL' : 'TP', r: round(r, 3),
              openedAt: pos.openedAt, closedAt: nowISO(),
            });
            if (rstate.trades.length > MAX_TRADES) rstate.trades = rstate.trades.slice(-MAX_TRADES);
            delete rstate.open[key];
            closed++;
          }
          continue; // pozisyon açıkken yeni açma
        }

        // YASAKLI ENSTRÜMAN (2026-07-24): gümüş/XAGUSD'ye YENİ pozisyon açılmaz.
        // Yukarıdaki SL/TP bloğu bilerek bu kapının ÜSTÜNDE — açık pozisyon kapanır.
        if (instrumentBans.isBanned(pair)) continue;

        // Yeni sinyal
        let ictSignals = null;
        if (bot.ictStrategy) {
          try { ictSignals = ictSmc.analyzeLatest(candles, [bot.ictStrategy], { freshBars: 2 }); } catch (_) { ictSignals = []; }
        }
        const sig = engine.evaluate(candles, { ...bot, ictSignals });
        if (!sig) continue;
        rstate.open[key] = {
          code: `${bot.id}:${pair}:${tf}:${sig.time}`,
          botId: bot.id, botName: bot.name, magic: bot.magic, symbol, instrumentId: pair,
          side: sig.direction, entry: round(sig.entry), stop: round(sig.stop),
          target: round(sig.target1), target2: round(sig.target2), confidence: sig.confidence,
          tf, openedAt: nowISO(),
        };
        opened++;
      }
    }
  }
  if (opened || closed) persist();
  return { opened, closed, openCount: Object.keys(rstate.open).length };
}

/** Köprü feed'i için açık custom-bot pozisyonları (bridgeFeed şekliyle). */
function feed() {
  load();
  const out = [];
  for (const pos of Object.values(rstate.open)) {
    if (!(pos && pos.symbol && (pos.side === 'long' || pos.side === 'short'))) continue;
    if (!(pos.entry > 0) || !(pos.stop > 0)) continue;
    out.push({
      botId: pos.botId, botName: pos.botName, magic: pos.magic || 0, code: String(pos.code),
      symbol: String(pos.symbol), category: 'Özel', direction: pos.side,
      entry: round(pos.entry), stop: round(pos.stop),
      target1: pos.target > 0 ? round(pos.target) : null,
      target2: pos.target2 > 0 ? round(pos.target2) : null,
      confidence: pos.confidence != null ? pos.confidence : null,
      strategy: pos.botName, timeframe: pos.tf || '', openedAt: pos.openedAt, longOnly: false,
    });
  }
  return out;
}

/** Custom botların paper lider tablosu (hangi bot ne kadar başarılı). */
function leaderboard() {
  load();
  const by = {};
  for (const t of rstate.trades) {
    const b = by[t.botId] || (by[t.botId] = { botId: t.botId, name: t.botName, trades: 0, wins: 0, netR: 0 });
    b.trades++; b.netR += Number(t.r) || 0; if ((Number(t.r) || 0) > 0) b.wins++;
  }
  const openByBot = {};
  for (const p of Object.values(rstate.open)) openByBot[p.botId] = (openByBot[p.botId] || 0) + 1;
  return Object.values(by).map((b) => ({
    ...b, netR: round(b.netR, 2), winRate: b.trades ? Math.round(100 * b.wins / b.trades) : 0,
    open: openByBot[b.botId] || 0,
  })).sort((a, b) => b.netR - a.netR);
}

/** Günlük rapor: sinceMs'ten beri kapanan custom-bot işlemleri (bot-bazlı). */
function dailyBreakdown(sinceMs) {
  load();
  const since = Number(sinceMs) || 0;
  const by = {};
  for (const t of rstate.trades) {
    const ts = Date.parse(t.closedAt || '');
    if (!Number.isFinite(ts) || ts < since) continue;
    const b = by[t.botId] || (by[t.botId] = { botId: t.botId, name: t.botName, trades: 0, tp: 0, sl: 0, netR: 0 });
    b.trades++;
    const r = Number(t.r) || 0; b.netR += r;
    const oc = String(t.outcome || '').toUpperCase();
    if (oc.includes('TP') || r > 0) b.tp++; else b.sl++;
  }
  return Object.values(by).map((b) => ({ ...b, netR: round(b.netR, 2) }));
}

module.exports = { run, feed, reload, purgeBot, leaderboard, dailyBreakdown, _state: () => rstate, _dangerouslyResetForTest() { rstate = { open: {}, trades: [] }; loaded = true; } };
