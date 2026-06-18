/**
 * forexStatsStore — Forex sinyal KAYDI + parite bazlı başarı istatistiği.
 *
 * - Her açılan pozisyon (sinyal) ve her kapanış geçmişe kaydedilir (history).
 * - Kapanışlarda parite+yön bazlı kazanan/kaybeden sayılır → başarı oranı.
 *   Başarı = kârla kapanan (TP1 / iz-süren stop / +pnl ile süre dolması).
 * - Günde 2 kez (cron) `buildStatsMessage` ile kanala paylaşılır.
 *
 * Kalıcılık: Supabase 'bot-state'/'forex/stats.json' + disk (tracker ile aynı).
 */
const fs = require('fs');
const path = require('path');
const { listInstruments } = require('./forexInstruments');

let supa = null, supaEnabled = () => false;
try { const m = require('../../lib/supabase'); supa = m.supabaseAdmin; supaEnabled = m.isSupabaseEnabled; } catch (_) {}

const BUCKET = 'bot-state';
const SUPA_KEY = 'forex/stats.json';
const DISK_FILE = path.join(__dirname, '..', '..', 'data', 'forex-stats.json');
const HISTORY_CAP = 1000;

let state = { byPair: {}, history: [], totalOpened: 0, totalClosed: 0, since: null, resetTag: null };
let loaded = false;
let saveTimer = null;

function blank() { return { win: 0, loss: 0, sumPnl: 0, n: 0 }; }
function ensurePair(id) { if (!state.byPair[id]) state.byPair[id] = { long: blank(), short: blank() }; return state.byPair[id]; }

async function load() {
  if (loaded) return;
  loaded = true;
  let got = false;
  if (supaEnabled && supaEnabled()) {
    try {
      const { data } = await Promise.race([
        supa.storage.from(BUCKET).download(SUPA_KEY),
        new Promise((_, rej) => setTimeout(() => rej(new Error('supa-timeout')), 8000)),
      ]);
      if (data) {
        const text = typeof data.text === 'function' ? await data.text() : Buffer.from(await data.arrayBuffer()).toString('utf8');
        const p = JSON.parse(text);
        if (p && p.byPair) { state = { byPair: p.byPair || {}, history: p.history || [], totalOpened: p.totalOpened || 0, totalClosed: p.totalClosed || 0, since: p.since || null, resetTag: p.resetTag || null }; got = true; }
      }
    } catch (_) {}
  }
  if (!got) { try { if (fs.existsSync(DISK_FILE)) { const p = JSON.parse(fs.readFileSync(DISK_FILE, 'utf8')); if (p && p.byPair) state = { byPair: p.byPair || {}, history: p.history || [], totalOpened: p.totalOpened || 0, totalClosed: p.totalClosed || 0, since: p.since || null, resetTag: p.resetTag || null }; } } catch (_) {} }
  // Tek-seferlik SIFIRLAMA: FOREX_STATS_RESET değeri (etiket) değişince istatistiği
  // bir kez temizler (sahte-stop/birleştirme öncesi kirli kapanışları atar). Aynı
  // etiketle sonraki açılışlarda tekrar sıfırlamaz (deploy/yeniden başlatmaya güvenli).
  const tag = process.env.FOREX_STATS_RESET;
  if (tag && state.resetTag !== tag) {
    state = { byPair: {}, history: [], totalOpened: 0, totalClosed: 0, since: null, resetTag: tag };
    persist();
  }
}

function persist() {
  try {
    const dir = path.dirname(DISK_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(DISK_FILE, JSON.stringify(state, null, 2), 'utf8');
  } catch (_) {}
  if (supaEnabled && supaEnabled()) {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      try { await supa.storage.from(BUCKET).upload(SUPA_KEY, Buffer.from(JSON.stringify(state), 'utf8'), { contentType: 'application/json', upsert: true }); } catch (_) {}
    }, 2500);
    if (saveTimer.unref) saveTimer.unref();
  }
}

function cap() { if (state.history.length > HISTORY_CAP) state.history = state.history.slice(-HISTORY_CAP); }

async function recordOpen(pos) {
  await load();
  if (!state.since) state.since = new Date().toISOString();
  state.totalOpened++;
  state.history.push({ at: new Date().toISOString(), event: 'open', code: pos.code, id: pos.instrumentId, symbol: pos.symbol, direction: pos.direction, tfs: pos.tfs, entry: pos.entry });
  cap(); persist();
}

async function recordClosure(ev) {
  await load();
  const id = ev.instrumentId || ev.id;
  if (!id || !ev.direction) return;
  const rec = ensurePair(id)[ev.direction];
  rec.n++;
  if ((ev.pnlPct || 0) > 0) rec.win++; else rec.loss++;
  rec.sumPnl += (ev.pnlPct || 0);
  state.totalClosed++;
  state.history.push({ at: new Date().toISOString(), event: 'close', code: ev.code, id, symbol: ev.symbol, direction: ev.direction, outcome: ev.outcome, pnlPct: ev.pnlPct });
  cap(); persist();
}

function rateStr(r) {
  if (!r || r.n === 0) return '—';
  const pct = Math.round((r.win / r.n) * 100);
  return `%${pct} (${r.win}/${r.n})`;
}

async function getStats() { await load(); return { byPair: state.byPair, totalOpened: state.totalOpened, totalClosed: state.totalClosed, since: state.since }; }

// Telegram istatistik mesajı (parite bazlı long/short başarı oranı)
async function buildStatsMessage() {
  await load();
  const today = new Date().toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  const lines = [`📊 <b>FOREX SİNYAL İSTATİSTİĞİ</b> — ${today}`];
  if (state.since) lines.push(`Kayıt: ${new Date(state.since).toLocaleDateString('tr-TR')}'ten beri · ${state.totalClosed} kapanan / ${state.totalOpened} sinyal`);
  lines.push('');

  let totWin = 0, totN = 0;
  for (const inst of listInstruments()) {
    const pr = state.byPair[inst.id];
    const L = pr?.long || blank(), S = pr?.short || blank();
    totWin += L.win + S.win; totN += L.n + S.n;
    if (L.n === 0 && S.n === 0) {
      lines.push(`<b>${inst.symbol}</b> — veri toplanıyor`);
    } else {
      lines.push(`<b>${inst.symbol}</b> — LONG ${rateStr(L)} · SHORT ${rateStr(S)}`);
    }
  }
  lines.push('');
  lines.push(totN > 0 ? `Genel başarı: <b>%${Math.round((totWin / totN) * 100)}</b> (${totWin}/${totN})` : 'Henüz kapanan sinyal yok — istatistik birikiyor.');
  lines.push('⚠️ Yatırım tavsiyesi değildir, eğitim amaçlıdır.');
  return lines.join('\n');
}

module.exports = { load, recordOpen, recordClosure, getStats, buildStatsMessage };
