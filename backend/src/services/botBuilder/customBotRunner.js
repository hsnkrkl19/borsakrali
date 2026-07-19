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
    for (const pair of bot.pairs) {
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

module.exports = { run, feed, leaderboard, _state: () => rstate, _dangerouslyResetForTest() { rstate = { open: {}, trades: [] }; loaded = true; } };
