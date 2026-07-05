/**
 * forexStatsStore — Forex sinyal SONUÇ sayacı (TP / STOP / iz-süren) + günlük rapor.
 *
 * Kullanıcı isteği: "tp ve sl olaylarını say, her gün 20:00 rapor ver."
 *   • Her açılan sinyal sayılır (opened).
 *   • Her kapanış sonucuna göre: TP1 → tp, SL → sl, TRAIL (iz-süren kâr) → trail.
 *   • Günlük (TR) kırılım + sıfırlamadan beri toplam. buildReport() 20:00'da kanala.
 *
 * Sıfırlama: `FOREX_RESET` env etiketi değişince bir kez sıfırlanır (tracker ile AYNI
 * etiket → açık sinyaller + sayaç + istatistik birlikte sıfırdan başlar).
 * Kalıcılık: Supabase 'bot-state'/'forex/stats.json' + disk.
 */
const fs = require('fs');
const path = require('path');

let supa = null, supaEnabled = () => false;
try { const m = require('../../lib/supabase'); supa = m.supabaseAdmin; supaEnabled = m.isSupabaseEnabled; } catch (_) {}

const BUCKET = 'bot-state';
const SUPA_KEY = 'forex/stats.json';
const DISK_FILE = process.env.FOREX_STATS_FILE || path.join(__dirname, '..', '..', 'data', 'forex-stats.json');

function fresh() { return { since: null, opened: 0, tp: 0, sl: 0, trail: 0, byDay: {}, resetTag: null }; }
let state = fresh();
let loaded = false, saveTimer = null;

function dayKey() { return new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Istanbul' }); } // YYYY-MM-DD (TR)
function ensureDay(d) { if (!state.byDay[d]) state.byDay[d] = { opened: 0, tp: 0, sl: 0, trail: 0 }; return state.byDay[d]; }

async function load() {
  if (loaded) return; loaded = true;
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
        if (p && typeof p.tp === 'number') { state = { ...fresh(), ...p, byDay: p.byDay || {} }; got = true; }
      }
    } catch (_) {}
  }
  if (!got) { try { if (fs.existsSync(DISK_FILE)) { const p = JSON.parse(fs.readFileSync(DISK_FILE, 'utf8')); if (p && typeof p.tp === 'number') state = { ...fresh(), ...p, byDay: p.byDay || {} }; } } catch (_) {} }
  // Tek-seferlik SIFIRLAMA — FOREX_RESET etiketi değişince (tracker ile aynı etiket).
  const tag = process.env.FOREX_RESET;
  if (tag && state.resetTag !== tag) { state = { ...fresh(), resetTag: tag }; persist(); }
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

async function recordOpen() {
  await load();
  if (!state.since) state.since = new Date().toISOString();
  state.opened++; ensureDay(dayKey()).opened++;
  persist();
}

// ev.outcome: 'TP1' | 'TP2' | 'SL' | 'TRAIL' | 'REVERSAL'
async function recordClosure(ev) {
  await load();
  // TP1/TP2 = kazanç (tp); SL = zarar; TRAIL/REVERSAL = kilitli-kârla çıkış (trail sayacı).
  const key = (ev.outcome === 'TP1' || ev.outcome === 'TP2') ? 'tp'
    : ev.outcome === 'SL' ? 'sl'
    : (ev.outcome === 'TRAIL' || ev.outcome === 'REVERSAL') ? 'trail' : null;
  if (!key) return;
  state[key]++; ensureDay(dayKey())[key]++;
  persist();
}

function rate(tp, trail, sl) { const w = tp + trail, n = w + sl; return n ? Math.round((w / n) * 100) : null; }

// 20:00 günlük rapor (TR). Bugün + sıfırlamadan beri toplam + başarı.
async function buildReport() {
  await load();
  const today = dayKey();
  const t = state.byDay[today] || { opened: 0, tp: 0, sl: 0, trail: 0 };
  const dr = new Date().toLocaleDateString('tr-TR', { timeZone: 'Europe/Istanbul' });
  const totRate = rate(state.tp, state.trail, state.sl);
  const todRate = rate(t.tp, t.trail, t.sl);
  return [
    `📊 <b>FOREX GÜNLÜK RAPOR</b> — ${dr}`,
    `Bugün: ${t.opened} sinyal · ✅ ${t.tp} TP · 🛡 ${t.trail} iz-süren · 🛑 ${t.sl} stop${todRate != null ? ` · başarı %${todRate}` : ''}`,
    `Toplam${state.since ? ` (${new Date(state.since).toLocaleDateString('tr-TR')}'ten beri)` : ''}: ${state.opened} sinyal · ✅ ${state.tp} TP · 🛡 ${state.trail} iz-süren · 🛑 ${state.sl} stop`,
    totRate != null ? `Başarı oranı: <b>%${totRate}</b> (${state.tp + state.trail}/${state.tp + state.trail + state.sl} kapanan)` : 'Henüz kapanan sinyal yok.',
    '⚠️ Yatırım tavsiyesi değildir, eğitim amaçlıdır.',
  ].join('\n');
}

async function getStats() { await load(); return { ...state }; }
function __resetForTest() { state = fresh(); loaded = true; if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; } }

module.exports = { load, recordOpen, recordClosure, buildReport, getStats, __resetForTest };
