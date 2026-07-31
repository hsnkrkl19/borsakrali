'use strict';

/**
 * Günlük YARIŞ raporu — GERÇEK MT5 sonuçlarından bot lider tablosu.
 *
 * Kaynak: realResults store (broker-onaylı kapanışlar; Supabase'te kalıcı —
 * VPS silinse de geçmiş burada durur). Her gün 23:55 TR'de Telegram'a gider;
 * aynı veri /api/bot/race/leaderboard ile sitede yayınlanır.
 *
 * Kill-switch: RACE_REPORT_DISABLED=1.
 */

const store = require('./store');
const telegramService = require('../telegramService');
const signalDelivery = require('../signalDelivery');
const logger = require('../../utils/logger');

const TR_OFFSET_SEC = 3 * 3600; // Türkiye DST uygulamaz — sabit UTC+3

function pushDisabled() { return process.env.RACE_REPORT_DISABLED === '1'; }

function channel() {
  return process.env.TELEGRAM_TRADE_CHANNEL || signalDelivery.signalChannel() || '';
}

function trDayStartSec(nowSec = Math.floor(Date.now() / 1000)) {
  const tr = nowSec + TR_OFFSET_SEC;
  return tr - (tr % 86400) - TR_OFFSET_SEC;
}

function trDateLabel(nowSec = Math.floor(Date.now() / 1000)) {
  return new Date((nowSec + TR_OFFSET_SEC) * 1000).toISOString().slice(0, 10);
}

function money(v) {
  const n = Number(v) || 0;
  return `${n > 0 ? '+' : ''}${n.toFixed(2)}$`;
}

function rowLabel(row) {
  return row && row.name ? String(row.name) : `Magic ${row ? row.magic : '?'}`;
}

function sortByNet(rows) {
  return [...rows].sort((a, b) => (b.net || 0) - (a.net || 0));
}

// D1g — YEDEK ADAYI eşikleri. Otomatik eleme YOK (kullanıcı kararı D4:
// "yalnız rapor, elemeyi ben yaparım"). Örneklem eşiği düşük tutulursa şanssız
// bir gün geçiren iyi bot damgalanır; 20 işlem anlamlı bir taban.
const BENCH_MIN_TRADES = 20;
const BENCH_MAX_WIN_RATE = 40;      // %
const BENCH_MAX_NET = 0;            // net zararda olacak

function benchCandidates(scorecard = []) {
  return scorecard
    .filter((r) => r.trades >= BENCH_MIN_TRADES && r.net < BENCH_MAX_NET
      && r.winRate <= BENCH_MAX_WIN_RATE)
    .sort((a, b) => (a.net || 0) - (b.net || 0));
}

/**
 * Saf biçimlendirici — test edilebilir olsun diye IO'suz.
 * @param {Array} today  aggregate(trDayStart) çıktısı
 * @param {Array} total  aggregate(0) çıktısı
 * @param {string} dateLabel YYYY-MM-DD
 * @param {{scorecard?:Array, symbols?:Array}} extra D1g/D3g karneleri (genel)
 */
function buildMessage(today, total, dateLabel, extra = {}) {
  const lines = [`🏁 <b>GÜNLÜK YARIŞ RAPORU</b> (${dateLabel})`];
  const dayTrades = today.reduce((s, r) => s + (r.trades || 0), 0);
  const dayNet = today.reduce((s, r) => s + (r.net || 0), 0);
  if (!dayTrades) {
    lines.push('Bugün kapanan gerçek işlem yok.');
  } else {
    lines.push(`Bugün: <b>${dayTrades}</b> gerçek işlem · net <b>${money(dayNet)}</b>`);
    const madalya = ['🥇', '🥈', '🥉'];
    sortByNet(today).slice(0, 10).forEach((r, i) => {
      lines.push(`${madalya[i] || `${i + 1}.`} ${rowLabel(r)} — ${r.trades} işlem · `
        + `net <b>${money(r.net)}</b> (✅${r.tp}/🛑${r.sl})`);
    });
    if (today.length > 10) {
      const rest = sortByNet(today).slice(10);
      const restNet = rest.reduce((s, r) => s + (r.net || 0), 0);
      lines.push(`… ve ${rest.length} bot daha (net ${money(restNet)})`);
    }
  }
  const allTrades = total.reduce((s, r) => s + (r.trades || 0), 0);
  const allNet = total.reduce((s, r) => s + (r.net || 0), 0);
  if (allTrades) {
    lines.push('');
    lines.push(`📊 GENEL: ${allTrades} işlem · net <b>${money(allNet)}</b>`);
    sortByNet(total).slice(0, 5).forEach((r, i) => {
      lines.push(`${i + 1}. ${rowLabel(r)} — ${r.trades} işlem · net ${money(r.net)}`);
    });
  }

  // D3g — ENSTRÜMAN KARNESİ: sürekli zarar ettiren sembol+yön çiftleri.
  // Kesme yok; kullanıcı hangi enstrümanda ısrar edildiğini görsün diye.
  const symbols = (extra.symbols || []).filter((s) => s.trades >= 5 && s.net < 0)
    .sort((a, b) => (a.net || 0) - (b.net || 0)).slice(0, 3);
  if (symbols.length) {
    lines.push('');
    lines.push('📉 <b>En çok zarar ettiren enstrümanlar</b> (genel)');
    for (const s of symbols) {
      const wr = s.trades ? Math.round((s.wins / s.trades) * 100) : 0;
      lines.push(`• ${s.symbol} ${s.direction} — ${money(s.net)} · ${s.trades} işlem · %${wr} isabet`);
    }
  }

  // D1g — YEDEK ADAYLARI: yeterli örneklemde net zararda + düşük isabet.
  const bench = benchCandidates(extra.scorecard || []);
  if (bench.length) {
    lines.push('');
    lines.push('🪑 <b>Yedek adayları</b> (karar senin — otomatik eleme yok)');
    for (const r of bench.slice(0, 5)) {
      lines.push(`• ${rowLabel(r)} — ${r.trades} işlem · %${r.winRate} isabet · ${money(r.net)}`);
    }
    if (bench.length > 5) lines.push(`… ve ${bench.length - 5} bot daha`);
  }

  lines.push('');
  lines.push('Tümü broker-onaylı GERÇEK sonuçlardır. Detay: borsakrali.com/bot');
  return lines.join('\n');
}

function leaderboard() {
  const sinceDay = trDayStartSec();
  const scorecard = store.scorecard(0);
  return {
    date: trDateLabel(),
    today: sortByNet(store.aggregate(sinceDay)),
    total: sortByNet(store.aggregate(0)),
    scorecard,                                   // D1g
    benchCandidates: benchCandidates(scorecard),  // D1g
    symbols: store.aggregateBySymbol(0),          // D3g
    updatedAt: store.summary().updatedAt,
  };
}

async function pushDaily() {
  if (pushDisabled()) return { telegram: 0, disabled: true };
  const chatId = channel();
  if (!chatId) return { telegram: 0, error: 'kanal-yok' };
  const board = leaderboard();
  const msg = buildMessage(board.today, board.total, board.date,
    { scorecard: board.scorecard, symbols: board.symbols });
  try {
    const result = await telegramService.sendMessage(chatId, msg, 'HTML');
    const ok = result && result.success === true;
    logger.info(`🏁 Günlük yarış raporu — TG ${ok ? 1 : 0}`);
    return { telegram: ok ? 1 : 0 };
  } catch (error) {
    logger.error(`Yarış raporu gönderilemedi: ${error.message}`);
    return { telegram: 0, error: error.message };
  }
}

module.exports = {
  buildMessage, leaderboard, pushDaily, benchCandidates,
  trDayStartSec, trDateLabel,
};
