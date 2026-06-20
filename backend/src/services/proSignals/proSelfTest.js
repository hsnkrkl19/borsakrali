/**
 * proSelfTest — YENİ ROBOT KENDİNİ-OPTİMİZE ETME DÖNGÜSÜ
 *
 * Robot kendi GERÇEKLEŞEN sonuçlarına karşı sürekli kendini sınar ve (KATI
 * sınırlar içinde) teknik ağırlıklarını + push eşiğini iyileşmek için ayarlar.
 *
 * GÜVENLİ olmak ZORUNDADIR:
 *   - Tüm değişiklikler SINIRLI (±0.15/run ağırlık, ±2/run eşik) ve SERT
 *     bant'lı (ağırlık [0.5, 4.0] → asla sıfırlanmaz; eşik [55, 80]).
 *   - Her değişiklik before/after + gerekçe ile history'ye yazılır (denetlenebilir).
 *   - EMA yumuşatma (%80 eski / %20 hedef) → ani sıçrama yok.
 *   - PRO_SELFTUNE_ACTIVE=0 → MUTASYON TAMAMEN KAPALI (kuru-çalıştırma/kill-switch),
 *     run() yine de raporu hesaplar ama HİÇBİR şeyi kalıcılaştırmaz (applied:false).
 *   - Math.random YOK; tamamen deterministik.
 *
 * SAF okuyucular (getTunedWeights/getPushThreshold) AĞIR bağımlılık çekmeden,
 * yalnız BASE_WEIGHTS + bellekteki state'i okur → motor/push/backtest ucuz çağırır,
 * geri-besleme döngüsü oluşmaz (proSignalLog/proStatsStore yalnız run() içinde
 * tembel-require edilir).
 *
 * Kalıcılık: disk data/pro-signals/runs.json + Supabase 'bot-state'/
 * 'pro-signals/runs.json' (proStatsStore.load deseninin aynısı + botPersistence.save).
 */
const fs = require('fs');
const path = require('path');
const botPersistence = require('../botPersistence');
const { BASE_WEIGHTS, TECHNIQUE_KEYS } = require('./proConfluence');

let supa = null, supaEnabled = () => false;
try { const m = require('../../lib/supabase'); supa = m.supabaseAdmin; supaEnabled = m.isSupabaseEnabled; } catch (_) {}

const BUCKET = 'bot-state';
const SUBDIR = 'pro-signals';
const FILENAME = 'runs.json';
const SUPA_KEY = `${SUBDIR}/${FILENAME}`;
const DISK_FILE = path.join(__dirname, '..', '..', 'data', SUBDIR, FILENAME);

const VERSION = 1;
const HISTORY_CAP = 50;
const MIN_SAMPLES = 20;       // bu kadar kapanmış sinyal olmadan AYAR YOK
const MIN_TECH_SAMPLES = 12;  // bir teknik için minimum atıf örneği
const WEIGHT_DELTA_MAX = 0.15;
const WEIGHT_MIN = 0.5, WEIGHT_MAX = 4.0;
const THRESH_STEP_MAX = 2;
const THRESH_MIN = 55, THRESH_MAX = 80;

// ── yardımcı ────────────────────────────────────────────────────────────────
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function envThreshold() {
  const t = Number(process.env.PRO_PUSH_CONFIDENCE);
  return Number.isFinite(t) && t > 0 ? t : 60;
}

function defaultState() {
  return {
    version: VERSION,
    updatedAt: null,
    weights: { ...BASE_WEIGHTS },
    pushThreshold: envThreshold(),
    perTechnique: {},
    overall: { n: 0, winRate: 0 },
    history: [],
  };
}

let state = defaultState();
let loaded = false;
let saveTimer = null;

function tuningEnabled() { return process.env.PRO_SELFTUNE_ACTIVE !== '0'; }

// ── SAF OKUYUCULAR (ucuz, ağır bağımlılık yok) ──────────────────────────────

/**
 * Ayarlanmış teknik ağırlık vektörü. Kapalıysa (PRO_SELFTUNE_ACTIVE=0) saf
 * BASE. Açıksa BASE üzerine state.weights bindirilir. HER ZAMAN tüm
 * TECHNIQUE_KEYS'i kapsar (eksik anahtarlar BASE'ten doldurulur).
 */
function getTunedWeights() {
  if (!tuningEnabled()) return { ...BASE_WEIGHTS };
  const out = {};
  for (const k of TECHNIQUE_KEYS) {
    const v = state.weights ? state.weights[k] : undefined;
    out[k] = Number.isFinite(v) ? v : BASE_WEIGHTS[k];
  }
  return out;
}

/**
 * Ayarlanmış push eşiği. Kapalıysa env (PRO_PUSH_CONFIDENCE) || 60. Açıksa
 * state.pushThreshold (set + sonlu ise) yoksa env || 60.
 */
function getPushThreshold() {
  if (!tuningEnabled()) return envThreshold();
  const t = state.pushThreshold;
  return Number.isFinite(t) ? t : envThreshold();
}

// ── KALICILIK (proStatsStore deseni) ────────────────────────────────────────

function normalize(p) {
  if (!p || typeof p !== 'object') return null;
  const s = defaultState();
  if (Number.isFinite(p.version)) s.version = p.version;
  s.updatedAt = p.updatedAt || null;
  if (p.weights && typeof p.weights === 'object') {
    for (const k of TECHNIQUE_KEYS) {
      const v = p.weights[k];
      if (Number.isFinite(v)) s.weights[k] = clamp(v, WEIGHT_MIN, WEIGHT_MAX);
    }
  }
  if (Number.isFinite(p.pushThreshold)) s.pushThreshold = clamp(p.pushThreshold, THRESH_MIN, THRESH_MAX);
  if (p.perTechnique && typeof p.perTechnique === 'object') s.perTechnique = p.perTechnique;
  if (p.overall && typeof p.overall === 'object') {
    s.overall = { n: p.overall.n || 0, winRate: p.overall.winRate || 0 };
  }
  if (Array.isArray(p.history)) s.history = p.history.slice(-HISTORY_CAP);
  return s;
}

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
        const n = normalize(p);
        if (n) { state = n; got = true; }
      }
    } catch (_) {}
  }
  if (!got) {
    try {
      if (fs.existsSync(DISK_FILE)) {
        const p = JSON.parse(fs.readFileSync(DISK_FILE, 'utf8'));
        const n = normalize(p);
        if (n) state = n;
      }
    } catch (_) {}
  }
}

function persist() {
  // Disk (her zaman) + Supabase mirror. botPersistence whitelist'e 'pro-signals'
  // eklenince mirror aktifleşir; o zamana kadar save() no-op, disk yeterli. Ayrıca
  // doğrudan Supabase upload (proStatsStore deseni) ile whitelist'ten bağımsız yedek.
  try {
    const dir = path.dirname(DISK_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(DISK_FILE, JSON.stringify(state, null, 2), 'utf8');
  } catch (_) {}
  try { botPersistence.save(SUBDIR, FILENAME, state); } catch (_) {}
  if (supaEnabled && supaEnabled()) {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      try { await supa.storage.from(BUCKET).upload(SUPA_KEY, Buffer.from(JSON.stringify(state), 'utf8'), { contentType: 'application/json', upsert: true }); } catch (_) {}
    }, 2500);
    if (saveTimer.unref) saveTimer.unref();
  }
}

// ── ATIF (attribution) ──────────────────────────────────────────────────────

function isWin(rec) {
  const o = rec.outcome;
  if (!o) return false;
  return o.result === 'TP1' || (Number(o.pnlPct) || 0) > 0;
}

// Bu teknik, alınan yönle hemfikir mi? (votes içinde {technique, vote===direction})
function techniqueAgreed(rec, key) {
  if (!Array.isArray(rec.votes)) return false;
  return rec.votes.some(v => v && v.technique === key && v.vote === rec.direction);
}

// ── TUNING ──────────────────────────────────────────────────────────────────

/**
 * Robot kendini sınar, (sınırlar içinde) ağırlıkları + eşiği ayarlar.
 * @returns rapor: { applied, overall, perTechnique, changes, pushThreshold, weights }
 *          veya örnek yetersizse { skipped:'insufficient_samples', closed }
 */
async function run() {
  await load();
  const active = tuningEnabled();

  // 1) Kapanmış sinyaller (outcome dolu)
  let closed = [];
  try {
    const proSignalLog = require('./proSignalLog');
    await proSignalLog.load();
    closed = proSignalLog.list({ limit: 500 }).filter(r => r && r.outcome);
  } catch (_) { closed = []; }

  // 2) Yetersiz örnek → DOKUNMA
  if (closed.length < MIN_SAMPLES) {
    return { skipped: 'insufficient_samples', closed: closed.length };
  }

  // 3) Genel kazanma oranı
  const wins = closed.filter(isWin).length;
  const overallWinRate = wins / closed.length;
  const overall = { n: closed.length, winRate: overallWinRate };

  // 4) Teknik bazlı atıf
  const perTechnique = {};
  for (const key of TECHNIQUE_KEYS) {
    const subset = closed.filter(r => techniqueAgreed(r, key));
    const techN = subset.length;
    const techWins = subset.filter(isWin).length;
    const techWinRate = techN > 0 ? techWins / techN : 0;
    perTechnique[key] = { n: techN, winRate: techWinRate };
  }

  const changes = [];

  // 5) AĞIRLIK ayarı (yalnız aktifken)
  const nextWeights = getTunedWeights(); // tam vektör (kapalıysa BASE)
  if (active) {
    for (const key of TECHNIQUE_KEYS) {
      const t = perTechnique[key];
      if (!t || t.n < MIN_TECH_SAMPLES) continue; // yetersiz örnek → no-op
      const gap = t.winRate - overallWinRate;                 // ~ -1..+1
      const proposedDelta = clamp(gap * 0.6, -WEIGHT_DELTA_MAX, WEIGHT_DELTA_MAX);
      const oldW = Number.isFinite(state.weights[key]) ? state.weights[key] : BASE_WEIGHTS[key];
      const emaTarget = oldW + proposedDelta;
      let newW = 0.8 * oldW + 0.2 * emaTarget; // EMA yumuşatma
      newW = clamp(newW, WEIGHT_MIN, WEIGHT_MAX);
      if (Math.abs(newW - oldW) > 1e-4) {
        nextWeights[key] = newW;
        changes.push({
          type: 'weight', key, before: oldW, after: newW,
          reason: `techWR ${(t.winRate * 100).toFixed(0)}% vs ${(overallWinRate * 100).toFixed(0)}% (n=${t.n})`,
        });
      } else {
        nextWeights[key] = oldW;
      }
    }
  }

  // 6) EŞİK ayarı (yalnız aktifken)
  const oldT = getPushThreshold();
  let nextThreshold = oldT;
  if (active) {
    let proposedStep = 0;
    if (overallWinRate < 0.48) proposedStep = +2;       // bar yükselt → az sinyal
    else if (overallWinRate > 0.60) proposedStep = -2;  // bar düşür → daha çok sinyal
    // else 0 (target ~0.52 bandı)
    proposedStep = clamp(proposedStep, -THRESH_STEP_MAX, THRESH_STEP_MAX);
    let candidate = clamp(oldT + proposedStep, THRESH_MIN, THRESH_MAX);
    // run başına |Δ| ≤ 2 sınırı (clamp bant sonu durumlarına karşı güvence)
    if (candidate - oldT > THRESH_STEP_MAX) candidate = oldT + THRESH_STEP_MAX;
    if (oldT - candidate > THRESH_STEP_MAX) candidate = oldT - THRESH_STEP_MAX;
    candidate = clamp(candidate, THRESH_MIN, THRESH_MAX);
    if (Math.abs(candidate - oldT) > 1e-9) {
      nextThreshold = candidate;
      changes.push({
        type: 'threshold', key: 'pushThreshold', before: oldT, after: candidate,
        reason: `overall WR ${(overallWinRate * 100).toFixed(0)}% (n=${overall.n}) → ${proposedStep > 0 ? 'bar yükselt' : 'bar düşür'}`,
      });
    }
  }

  // 7/8) Aktifse uygula+kalıcılaştır; kapalıysa SADECE rapor (kuru-çalıştırma)
  if (active) {
    state.weights = nextWeights;
    state.pushThreshold = nextThreshold;
    state.perTechnique = perTechnique;
    state.overall = overall;
    state.updatedAt = new Date().toISOString();
    state.version = VERSION;
    state.history.push({ ts: state.updatedAt, overallWinRate, n: overall.n, changes });
    if (state.history.length > HISTORY_CAP) state.history = state.history.slice(-HISTORY_CAP);
    persist();
  }

  // 9) Rapor
  return {
    applied: active,
    overall,
    perTechnique,
    changes,
    pushThreshold: active ? nextThreshold : getPushThreshold(),
    weights: active ? { ...state.weights } : getTunedWeights(),
  };
}

// ── DURUM / TEST ─────────────────────────────────────────────────────────────

function getState() {
  return {
    version: state.version,
    updatedAt: state.updatedAt,
    weights: { ...state.weights },
    pushThreshold: state.pushThreshold,
    perTechnique: state.perTechnique,
    overall: state.overall,
    history: state.history,
  };
}

function __resetForTest() {
  state = defaultState();
  loaded = true;
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
}

module.exports = {
  load,
  run,
  getTunedWeights,
  getPushThreshold,
  getState,
  __resetForTest,
};
