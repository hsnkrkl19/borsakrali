/**
 * Custom Bots — Tanım Kayıt Defteri (registry)
 *
 * Kullanıcıların oluşturduğu bot TANIMLARINI saklar (strateji, parametreler,
 * hisse evreni, risk kuralları, pozisyon ayarları). Her botun ayrıca KENDİ sanal
 * portföyü vardır → `createPositionStore({ subdir: 'custom-<id>' })` ile yönetilir.
 *
 * Disk: data/custom-bots/registry.json  (tanım listesi)
 *       data/custom-<id>/{portfolio,positions,trades}.json  (her botun portföyü)
 * Kalıcılık: botPersistence Supabase write-through (registry.json + custom-* dizinler).
 *
 * Global model: botlar tüm ziyaretçilere ortaktır (mevcut 4 hazır bot gibi).
 * Doğrulama burada merkezîdir → "hatasız" girdi garantisi (route ham gövdeye güvenmez).
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const botPersistence = require('../botPersistence');
const createPositionStore = require('../tradingBotV2/createPositionStore');
const strategies = require('./strategies');
const riskRules = require('./riskRules');
const { allBistStocks } = require('../../data/allBistStocks');

const DATA_ROOT = process.env.BOT_DATA_DIR || path.join(__dirname, '..', '..', 'data');
const REG_DIR = path.join(DATA_ROOT, 'custom-bots');
const REG_FILE = path.join(REG_DIR, 'registry.json');

// Kaynak/abuse sınırları (canlı, herkese açık site).
const LIMITS = {
  MAX_BOTS: 50,
  MAX_UNIVERSE: 80,
  MIN_UNIVERSE: 1,
  NAME_MAX: 60,
  DESC_MAX: 280,
  CAPITAL_MIN: 1000,
  CAPITAL_MAX: 100000000,
  POSITION_PCT_MIN: 0.5,
  POSITION_PCT_MAX: 50,
  MAX_POSITIONS_MIN: 1,
  MAX_POSITIONS_MAX: 50,
  COMMISSION_MAX: 1,   // %
  SLIPPAGE_MAX: 1,     // %
};

const VALID_SYMBOLS = new Set(allBistStocks.map(s => s.symbol));
const NAME_BY_SYMBOL = Object.fromEntries(allBistStocks.map(s => [s.symbol, s.name]));

function nowISO() { return new Date().toISOString(); }
function newId() { return crypto.randomBytes(5).toString('hex'); } // 10 hex chars, fs/url-safe

function ensureDir() { if (!fs.existsSync(REG_DIR)) fs.mkdirSync(REG_DIR, { recursive: true }); }

function readReg() {
  ensureDir();
  if (!fs.existsSync(REG_FILE)) return [];
  try {
    const data = JSON.parse(fs.readFileSync(REG_FILE, 'utf8'));
    return Array.isArray(data) ? data : [];
  } catch (e) {
    console.error('[CustomBotRegistry] registry.json bozuk:', e.message);
    return [];
  }
}

function writeReg(list) {
  ensureDir();
  fs.writeFileSync(REG_FILE, JSON.stringify(list, null, 2), 'utf8');
  try { botPersistence.save('custom-bots', 'registry.json', list); } catch (_) {}
}

// ── Doğrulama ────────────────────────────────────────────────────────────────
function clampNum(v, min, max, fallback) {
  let n = Number(v);
  if (!Number.isFinite(n)) n = fallback;
  return Math.min(max, Math.max(min, n));
}

/**
 * Ham kullanıcı girdisini doğrular + normalize eder.
 * @returns {{ ok:boolean, def?:object, errors?:string[] }}
 */
function validateDef(input = {}, { existing = null } = {}) {
  const errors = [];

  // İsim
  const name = String(input.name || '').trim();
  if (!name) errors.push('Bot adı zorunlu.');
  else if (name.length > LIMITS.NAME_MAX) errors.push(`Bot adı en fazla ${LIMITS.NAME_MAX} karakter.`);

  const description = String(input.description || '').trim().slice(0, LIMITS.DESC_MAX);

  // Strateji
  const strategy = strategies.get(input.strategyId);
  if (!strategy) errors.push(`Geçersiz strateji: ${input.strategyId}`);
  const params = strategy ? strategies.normalizeParams(strategy, input.params || {}) : {};
  // Mantıksal param kontrolü (ör. hızlı < yavaş)
  if (strategy && (strategy.id === 'ema_cross' || strategy.id === 'macd_cross')) {
    if (params.fastPeriod >= params.slowPeriod) errors.push('Hızlı periyot yavaş periyottan küçük olmalı.');
  }
  if (strategy && strategy.id === 'rsi_reversal' && params.oversold >= params.overbought) {
    errors.push('Aşırı-satım seviyesi aşırı-alımdan küçük olmalı.');
  }

  // Evren
  let universe = Array.isArray(input.universe) ? input.universe : [];
  universe = [...new Set(universe.map(s => String(s || '').toUpperCase().trim()))].filter(Boolean);
  const invalid = universe.filter(s => !VALID_SYMBOLS.has(s));
  if (invalid.length) errors.push(`Tanınmayan hisse: ${invalid.slice(0, 5).join(', ')}${invalid.length > 5 ? '…' : ''}`);
  universe = universe.filter(s => VALID_SYMBOLS.has(s));
  if (universe.length < LIMITS.MIN_UNIVERSE) errors.push('En az 1 hisse seçilmeli.');
  if (universe.length > LIMITS.MAX_UNIVERSE) errors.push(`En fazla ${LIMITS.MAX_UNIVERSE} hisse seçilebilir.`);

  // Risk
  const riskRes = riskRules.validateRisk(input.risk || {});
  if (!riskRes.ok) errors.push(...riskRes.errors);

  // Pozisyon ayarları
  const sizing = {
    positionPct: clampNum(input.sizing?.positionPct, LIMITS.POSITION_PCT_MIN, LIMITS.POSITION_PCT_MAX, 5),
    maxPositions: Math.round(clampNum(input.sizing?.maxPositions, LIMITS.MAX_POSITIONS_MIN, LIMITS.MAX_POSITIONS_MAX, 10)),
    capital: Math.round(clampNum(input.sizing?.capital, LIMITS.CAPITAL_MIN, LIMITS.CAPITAL_MAX, 100000)),
  };
  // Sermaye yalnızca OLUŞTURURKEN belirlenir; mevcut botta değiştirilemez (portföy bozulmasın)
  if (existing) sizing.capital = existing.sizing.capital;

  const commissionPct = clampNum(input.commissionPct, 0, LIMITS.COMMISSION_MAX, 0.2);
  const slippagePct = clampNum(input.slippagePct, 0, LIMITS.SLIPPAGE_MAX, 0.1);

  const status = input.status === 'paused' ? 'paused' : 'active';

  if (errors.length) return { ok: false, errors };

  const def = {
    id: existing?.id || newId(),
    name,
    description,
    strategyId: strategy.id,
    params,
    universe,
    risk: riskRes.risk,
    sizing,
    commissionPct,
    slippagePct,
    status,
    createdAt: existing?.createdAt || nowISO(),
    updatedAt: nowISO(),
  };
  return { ok: true, def };
}

// ── CRUD ─────────────────────────────────────────────────────────────────────
function list() { return readReg(); }

function get(id) { return readReg().find(b => b.id === id) || null; }

function create(input) {
  const reg = readReg();
  if (reg.length >= LIMITS.MAX_BOTS) {
    return { ok: false, errors: [`En fazla ${LIMITS.MAX_BOTS} bot oluşturulabilir.`] };
  }
  const res = validateDef(input);
  if (!res.ok) return res;
  reg.push(res.def);
  writeReg(reg);
  // Portföyü hemen başlat (boş portfolio.json oluşsun → UI dolu açılır)
  try { storeFor(res.def).getPortfolio(); } catch (_) {}
  return { ok: true, def: res.def };
}

function update(id, input) {
  const reg = readReg();
  const idx = reg.findIndex(b => b.id === id);
  if (idx === -1) return { ok: false, errors: ['Bot bulunamadı.'], notFound: true };
  const res = validateDef(input, { existing: reg[idx] });
  if (!res.ok) return res;
  reg[idx] = res.def;
  writeReg(reg);
  _storeCache.delete(id); // sermaye/para değişmedi ama tazelik için cache'i tazele
  return { ok: true, def: res.def };
}

// Sadece durum güncelle (pause/resume) — tüm doğrulamayı tekrar koşmadan.
function setStatus(id, status) {
  const reg = readReg();
  const idx = reg.findIndex(b => b.id === id);
  if (idx === -1) return { ok: false, notFound: true };
  reg[idx].status = status === 'paused' ? 'paused' : 'active';
  reg[idx].updatedAt = nowISO();
  writeReg(reg);
  return { ok: true, def: reg[idx] };
}

function remove(id) {
  const reg = readReg();
  const idx = reg.findIndex(b => b.id === id);
  if (idx === -1) return { ok: false, notFound: true };
  reg.splice(idx, 1);
  writeReg(reg);
  // Yerel portföy dosyalarını sil + Supabase'ten kaldır (orphan bırakma)
  try {
    const dir = path.join(DATA_ROOT, `custom-${id}`);
    if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
  } catch (_) {}
  try { botPersistence.remove(`custom-${id}`); } catch (_) {}
  _storeCache.delete(id);
  return { ok: true };
}

// ── Per-bot portföy deposu (memoized) ────────────────────────────────────────
const _storeCache = new Map();
function storeFor(botOrId) {
  const def = typeof botOrId === 'string' ? get(botOrId) : botOrId;
  if (!def) throw new Error('Bot tanımı yok');
  if (_storeCache.has(def.id)) return _storeCache.get(def.id);
  const store = createPositionStore({
    subdir: `custom-${def.id}`,
    initialCapital: def.sizing.capital,
    currency: 'TRY',
  });
  _storeCache.set(def.id, store);
  return store;
}

module.exports = {
  LIMITS, VALID_SYMBOLS, NAME_BY_SYMBOL,
  validateDef, list, get, create, update, setStatus, remove, storeFor,
};
