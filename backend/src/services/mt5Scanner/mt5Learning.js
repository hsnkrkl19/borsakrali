/**
 * mt5Learning — MT5 gün-içi tarayıcının ÖĞRENEN katmanı (tam otonom, denetlenebilir).
 *
 * Kombo = "enstrümanId:TF". Kapanan her işlemin R-katsayısı (pnlUsd/riskUsd)
 * kombonun rolling penceresine akar; katman üç kararı KENDİ verir:
 *
 *   • DEVRE KESİCİ: gerçek modda n >= 12 VE son 20 işlemde toplam R <= -3
 *     VE PF < 0.85 → kombo GÖLGE moduna alınır. Gölge = sinyaller aynen üretilir
 *     ve sanal pozisyon olarak İZLENİR ama bütçe tüketmez, push edilmez ve
 *     KÖPRÜYE GİTMEZ (gerçek para yok).
 *   • GERİ AÇILMA: gölgede n >= 10 VE toplam R > 0 VE PF >= 1.05 → gerçeğe döner.
 *     Mod değişiminde hedef modun penceresi SIFIRLANIR (taze kanıt dönemi) —
 *     yoksa eski kayıp serisi geri açılan komboyu anında tekrar kapatırdı.
 *   • RİSK ÇARPANI (yalnız gerçek mod, n >= 15): PF >= 1.5 & sumR >= +5 → x1.5 ·
 *     PF >= 1.2 & sumR >= +2 → x1.25 · PF < 1.0 → x0.75 · diğerleri x1.0.
 *     Tavan: MT5_LEARNING_MAX_MULT (vars. 1.5). İşlem başına efektif risk yüzdesi
 *     engine tarafında %2 ile MUTLAK sınırlanır; günlük %5 / toplam %10 bütçe
 *     kapıları hiçbir koşulda değişmez (çarpan bütçenin İÇİNDE oynar).
 *
 * Her mod değişimi decisions[] denetim kaydına yazılır ve günlük raporda duyurulur.
 * Kill-switch: MT5_LEARNING_DISABLED=1 → katman NÖTR (her kombo gerçek, çarpan 1.0);
 * istatistik toplamaya devam eder — gözlem sürer, eylem durur.
 *
 * Kalıcılık: botPersistence 'mt5-scanner/learning.json' (deploy'lar arası korunur).
 */

const fs = require('fs');
const path = require('path');

let botPersistence = null;
try { botPersistence = require('../botPersistence'); } catch (_) {}

const SUBDIR = 'mt5-scanner';
const DATA_DIR = path.join(process.env.BOT_DATA_DIR || path.join(__dirname, '..', '..', 'data'), SUBDIR);
const FILE = path.join(DATA_DIR, 'learning.json');

// ── Kurallar (sabit + env) ─────────────────────────────────────────────────
const ROLL = 40;                    // kombo başına saklanan son kapanış sayısı
const DISABLE_WINDOW = 20;          // devre kesici bu pencereye bakar
const DISABLE_MIN_N = 12;           // karardan önce asgari gerçek kapanış
const DISABLE_SUM_R = -3;           // pencere toplam R bu eşiğin altında VE
const DISABLE_PF = 0.85;            // PF bunun altında → GÖLGE
const ENABLE_MIN_N = 10;            // gölgeden dönüş için asgari gölge kapanışı
const ENABLE_PF = 1.05;             // gölge PF eşiği (histerezis: kapatandan yüksek)
const MULT_MIN_N = 15;              // çarpan kararı için asgari kanıt
const DECISIONS_CAP = 100;

function maxMult() {
  const v = Number(process.env.MT5_LEARNING_MAX_MULT);
  return Number.isFinite(v) && v >= 1 && v <= 2 ? v : 1.5;
}
function disabled() { return process.env.MT5_LEARNING_DISABLED === '1'; }

// ── Durum ──────────────────────────────────────────────────────────────────
function freshState() { return { version: 1, combos: {}, decisions: [] }; }
let state = freshState();
let loaded = false;

function readJson(file) {
  try { if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (_) {}
  return null;
}
function persist() {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(state, null, 2), 'utf8');
  } catch (_) {}
  try { if (botPersistence) botPersistence.save(SUBDIR, path.basename(FILE), state); } catch (_) {}
}
function load() {
  if (loaded) return;
  loaded = true;
  const p = readJson(FILE);
  if (p && p.combos) state = { ...freshState(), ...p };
}

function comboKey(id, tf) { return `${id}:${tf}`; }
function comboOf(id, tf) {
  load();
  const k = comboKey(id, tf);
  if (!state.combos[k]) state.combos[k] = { mode: 'real', riskMult: 1, real: [], shadow: [] };
  return state.combos[k];
}

// ── İstatistik ─────────────────────────────────────────────────────────────
function statsOf(list) {
  const rs = list.map((x) => x.r).filter((r) => Number.isFinite(r));
  const n = rs.length;
  const sumR = +rs.reduce((a, b) => a + b, 0).toFixed(2);
  const grossWin = rs.filter((r) => r > 0).reduce((a, b) => a + b, 0);
  const grossLoss = Math.abs(rs.filter((r) => r < 0).reduce((a, b) => a + b, 0));
  const pf = grossLoss > 0 ? +(grossWin / grossLoss).toFixed(2) : (grossWin > 0 ? 99 : 1);
  const wins = rs.filter((r) => r > 0).length;
  return { n, sumR, pf, wins, winRate: n > 0 ? Math.round((wins / n) * 100) : null };
}

function decideMult(combo) {
  const s = statsOf(combo.real);
  if (s.n < MULT_MIN_N) return 1;
  let m = 1;
  if (s.pf >= 1.5 && s.sumR >= 5) m = 1.5;
  else if (s.pf >= 1.2 && s.sumR >= 2) m = 1.25;
  else if (s.pf < 1.0) m = 0.75;
  return Math.min(m, maxMult());
}

function logDecision(k, from, to, reason) {
  state.decisions.push({ t: new Date().toISOString(), combo: k, from, to, reason });
  if (state.decisions.length > DECISIONS_CAP) state.decisions = state.decisions.slice(-DECISIONS_CAP);
}

// ── Ana akış: kapanış kaydı + karar ────────────────────────────────────────
/**
 * Tracker her kapanışta çağırır. ev: {instrumentId, tf, outcome, pnlUsd,
 * riskUsd, rMultiple, shadow}. Karar mantığı env-kill'de ASKIDA (kayıt sürer).
 */
function recordClose(ev) {
  load();
  const k = comboKey(ev.instrumentId, ev.tf);
  const combo = comboOf(ev.instrumentId, ev.tf);
  const rec = {
    r: Number.isFinite(ev.rMultiple) ? ev.rMultiple : null,
    usd: ev.pnlUsd ?? null, outcome: ev.outcome, t: ev.exitTimeSec || Math.floor(Date.now() / 1000),
  };
  const kind = ev.shadow ? 'shadow' : 'real';
  combo[kind].push(rec);
  if (combo[kind].length > ROLL) combo[kind] = combo[kind].slice(-ROLL);

  let decision = null;
  if (!disabled()) {
    if (combo.mode === 'real' && kind === 'real') {
      const s = statsOf(combo.real.slice(-DISABLE_WINDOW));
      if (s.n >= DISABLE_MIN_N && s.sumR <= DISABLE_SUM_R && s.pf < DISABLE_PF) {
        combo.mode = 'shadow';
        combo.shadow = [];                       // taze gözlem penceresi
        combo.riskMult = 1;
        decision = `DEVRE KESİLDİ: son ${s.n} işlem ${s.sumR >= 0 ? '+' : ''}${s.sumR}R, PF ${s.pf} → gölge modu`;
        logDecision(k, 'real', 'shadow', decision);
      }
    } else if (combo.mode === 'shadow' && kind === 'shadow') {
      const s = statsOf(combo.shadow);
      if (s.n >= ENABLE_MIN_N && s.sumR > 0 && s.pf >= ENABLE_PF) {
        combo.mode = 'real';
        combo.real = [];                         // taze kanıt dönemi
        combo.riskMult = 1;
        decision = `GERİ AÇILDI: gölgede ${s.n} işlem +${s.sumR}R, PF ${s.pf} → gerçek mod`;
        logDecision(k, 'shadow', 'real', decision);
      }
    }
    if (combo.mode === 'real') {
      const newMult = decideMult(combo);
      if (newMult !== combo.riskMult) {
        logDecision(k, `x${combo.riskMult}`, `x${newMult}`,
          `risk çarpanı güncellendi (${statsOf(combo.real).n} işlem kanıtı)`);
        combo.riskMult = newMult;
      }
    }
  }
  persist();
  return decision;
}

// ── Sorgular (engine/tracker/notifier/routes) ──────────────────────────────
function modeFor(id, tf) {
  if (disabled()) return 'real';
  return comboOf(id, tf).mode;
}
function riskMultFor(id, tf) {
  if (disabled()) return 1;
  const c = comboOf(id, tf);
  return c.mode === 'real' ? (c.riskMult || 1) : 1;
}

function summary() {
  load();
  const combos = {};
  for (const [k, c] of Object.entries(state.combos)) {
    combos[k] = {
      mode: c.mode, riskMult: c.riskMult,
      real: statsOf(c.real), shadow: statsOf(c.shadow),
    };
  }
  return {
    enabled: !disabled(),
    maxMult: maxMult(),
    shadowCombos: Object.entries(combos).filter(([, c]) => c.mode === 'shadow').map(([k]) => k),
    boostedCombos: Object.entries(combos).filter(([, c]) => c.riskMult > 1).map(([k, c]) => `${k} x${c.riskMult}`),
    reducedCombos: Object.entries(combos).filter(([, c]) => c.riskMult < 1).map(([k, c]) => `${k} x${c.riskMult}`),
    combos,
  };
}

function recentDecisions(hours = 26) {
  load();
  const cutoff = Date.now() - hours * 3600 * 1000;
  return state.decisions.filter((d) => new Date(d.t).getTime() >= cutoff);
}

/** Yalnız test: durumu sıfırla. */
function _resetForTest() { state = freshState(); loaded = true; }

module.exports = {
  recordClose, modeFor, riskMultFor, summary, recentDecisions, load, disabled,
  _resetForTest, SUBDIR,
  // testler kuralları doğrulasın diye dışa açık sabitler:
  RULES: { ROLL, DISABLE_WINDOW, DISABLE_MIN_N, DISABLE_SUM_R, DISABLE_PF, ENABLE_MIN_N, ENABLE_PF, MULT_MIN_N },
};
