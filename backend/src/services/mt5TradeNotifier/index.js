'use strict';

/**
 * Broker-confirmed MT5 trade lifecycle -> Telegram.
 *
 * A row is a Telegram "signal" only after MT5 reports a real open ticket.  A
 * close is announced only after MT5 reports a real exit deal.  Feed candidates
 * and rejected execution decisions are audit facts, never signals.
 *
 * Delivery is a persistent outbox: a failed Telegram call remains retryable and
 * is not marked sent.  /api/bridge/state returns a retryable error in that case,
 * so the bridge can post the same broker fact again without creating duplicates.
 */

const fs = require('fs');
const path = require('path');
const botPersistence = require('../botPersistence');
const realResults = require('../realResults/store');
const botFunnel = require('../botFunnel');
const { magicToBot, normalizeExitDeal } = realResults;
const { botLabel } = require('../botCompetition/botLabels');
const competitionCatalog = require('../botCompetition/catalog');

const SUBDIR = 'mt5-notify';
const FILE = 'notified.json';
const DATA_DIR = process.env.MT5_NOTIFY_DATA_DIR
  || (process.env.BOT_DATA_DIR
    ? path.join(process.env.BOT_DATA_DIR, SUBDIR)
    : path.join(__dirname, '..', '..', 'data', SUBDIR));
const STATE_FILE = path.join(DATA_DIR, FILE);
const TEST_EPHEMERAL = process.env.NODE_ENV === 'test' && !process.env.MT5_NOTIFY_DATA_DIR;
const MAX_RECORDS = 12000;
const MAX_EVENTS = 2000;
const RECORD_TTL_MS = 60 * 24 * 3600 * 1000;
const OPEN_ALIAS_WINDOW_SEC = 60;
const CLOSE_FRESH_MS = () => Math.max(1, Number(process.env.MT5_CLOSE_FRESH_MIN || 90)) * 60 * 1000;
const CANDIDATE_GRACE_MS = () => Math.max(1, Number(process.env.MT5_RECONCILE_GRACE_MIN || 5)) * 60 * 1000;
// F6 (dusman incelemesi): 20 sn, Telegram axios timeout'unun (15 sn) yalnizca
// 5 sn ustundeydi. persistDurable + yavas ag ile pencere DOLABILIYOR ve ayni
// islem IKINCI kez duyuruluyordu (kanitli: 1 islem, 2 mesaj). Pencere artik
// timeout'un 4 kati.
const DELIVERY_INFLIGHT_MS = () => {
  const configured = Number(process.env.MT5_NOTIFY_INFLIGHT_MS || 60000);
  return Number.isFinite(configured) ? Math.max(1000, configured) : 60000;
};

function freshState() {
  return {
    version: 3, opens: {}, openAliases: {}, closes: {}, candidates: {}, decisions: {},
    events: [], updatedAt: null,
  };
}

let state = freshState();
let loaded = false;

function nowISO() { return new Date().toISOString(); }
function nowMs() { return Date.now(); }
/**
 * Broker olay zamanı (saniye) -> ms. C1 hunisi olguları GERÇEK gününe yazar;
 * köprünün 7 günlük geçmiş tekrarı aksi halde hepsini BUGÜNE yığardı.
 */
function secToMs(sec) {
  const n = Number(sec);
  return Number.isFinite(n) && n > 0 ? n * 1000 : nowMs();
}
function notificationsDisabled() { return process.env.MT5_TRADE_NOTIFY_DISABLED === '1'; }
/**
 * Every MT5-tradeable bot has one Telegram owner: central broker-state ingest.
 * Paper-only/BIST bots keep their existing channels. The legacy override is
 * test-only, so production cannot accidentally re-enable the duplicate path.
 */
function paperNotificationSuppressed(botId) {
  if (process.env.NODE_ENV === 'test' && process.env.MT5_LEGACY_PAPER_NOTIFY === '1') return false;
  if (/^custom-[a-z0-9]+$/i.test(text(botId))) return true;
  const entry = competitionCatalog.find((row) => row.id === botId);
  return !!(entry && entry.competitionEligible && entry.mt5Tradeable !== false);
}
function finite(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function text(v) { return v == null ? '' : String(v).trim(); }
function positive(v) { const n = finite(v); return n !== null && n > 0 ? n : null; }
function cleanError(error) {
  // Never persist/log request headers or tokens.  Telegram errors are reduced to
  // a bounded message without config/request serialization.
  return text(error && error.message ? error.message : error).slice(0, 180) || 'telegram-delivery-failed';
}
function html(v) {
  return text(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function directionOf(v) {
  const d = text(v).toLowerCase();
  if (d === 'long' || d === 'buy' || d === '0') return 'long';
  if (d === 'short' || d === 'sell' || d === '1') return 'short';
  return '';
}
function symbolKey(v) { return text(v).toUpperCase().replace(/[^A-Z0-9]/g, ''); }
function accountFields(raw = {}) {
  const nested = raw && raw.account && typeof raw.account === 'object' ? raw.account : {};
  const primitiveAccount = raw && raw.account !== null && typeof raw.account !== 'object'
    ? raw.account : null;
  return {
    accountLogin: text(raw.accountLogin ?? raw.login ?? raw.accountNumber
      ?? nested.accountLogin ?? nested.login ?? nested.accountNumber ?? primitiveAccount),
    accountServer: text(raw.accountServer ?? raw.server ?? raw.brokerServer
      ?? nested.accountServer ?? nested.server ?? nested.brokerServer),
  };
}
function accountScope(raw = {}) {
  const { accountLogin, accountServer } = accountFields(raw);
  if (!accountLogin && !accountServer) return '';
  return `${encodeURIComponent(accountLogin || '?')}@${encodeURIComponent(accountServer.toUpperCase() || '?')}`;
}
function sameAccount(left, right) {
  const a = accountScope(left); const b = accountScope(right);
  return (!a && !b) || (!!a && a === b);
}
function brokerStateKey(identifier, identity = {}) {
  const key = text(identifier);
  if (!key) return '';
  const scope = accountScope(identity);
  return scope ? `${scope}|${key}` : key;
}
function accountDisplay(raw = {}) {
  const { accountLogin, accountServer } = accountFields(raw);
  return [accountLogin || 'bildirilmedi', accountServer].filter(Boolean).join(' @ ');
}
function codeFromComment(v) {
  const value = text(v);
  const prefixed = /^(?:A|BK|BKG)#(.+)$/i.exec(value);
  if (prefixed) return text(prefixed[1]).slice(0, 96);
  return /^(?:close|closed)$/i.test(value) ? '' : value.slice(0, 96);
}
function candidateKey(row) {
  const code = text(row && (row.code || row.signalId || row.id));
  if (code) return code;
  return [row && row.magic, symbolKey(row && row.symbol), directionOf(row && row.direction)].join('|');
}

function migrateBag(bag, kind) {
  const out = {};
  for (const [key, value] of Object.entries(bag && typeof bag === 'object' ? bag : {})) {
    if (value && typeof value === 'object') { out[key] = value; continue; }
    // v1 stored ticket/deal -> timestamp.  Treat those as already sent so an
    // upgrade cannot replay historical Telegram messages.
    const ts = Number(value) || nowMs();
    out[key] = {
      [kind === 'open' ? 'ticket' : 'dealId']: key,
      notification: 'sent', firstSeenMs: ts, lastSeenMs: ts,
      notifiedAt: new Date(ts).toISOString(), migrated: true,
    };
  }
  return out;
}

function recoverInterruptedDeliveries(bag, kind) {
  let recovered = 0;
  for (const row of Object.values(bag || {})) {
    // 'batched' (C3) da kurtarılır: yeniden başlayan süreç o toplu mesajı
    // gönderecek zamanlayıcıya sahip değildir; tek tek yeniden denenir.
    if (!row || (row.notification !== 'pending' && row.notification !== 'batched')) continue;
    // A freshly loaded process cannot own the promise that created this
    // persisted `pending` marker.  Make it retryable immediately instead of
    // suppressing delivery for an arbitrary lease window after a restart.
    row.notification = 'failed';
    row.lastError = 'delivery-interrupted-by-restart';
    row.recoveredAt = nowISO();
    recovered++;
  }
  if (recovered) addEvent(`${kind}_pending_recovered`, { count: recovered });
  return recovered;
}

function load() {
  if (loaded) return state;
  loaded = true;
  try {
    if (!TEST_EPHEMERAL && fs.existsSync(STATE_FILE)) {
      const raw = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
      if (raw && typeof raw === 'object') {
        state = {
          ...freshState(), ...raw, version: 3,
          opens: migrateBag(raw.opens, 'open'),
          openAliases: raw.openAliases && typeof raw.openAliases === 'object' ? raw.openAliases : {},
          closes: migrateBag(raw.closes, 'close'),
          candidates: raw.candidates && typeof raw.candidates === 'object' ? raw.candidates : {},
          decisions: raw.decisions && typeof raw.decisions === 'object' ? raw.decisions : {},
          events: Array.isArray(raw.events) ? raw.events.slice(-MAX_EVENTS) : [],
        };
        const recovered = recoverInterruptedDeliveries(state.opens, 'open')
          + recoverInterruptedDeliveries(state.closes, 'close');
        if (recovered) persist();
      }
    }
  } catch (_) { state = freshState(); }
  return state;
}

function addEvent(type, fields = {}) {
  state.events.push({ at: nowISO(), type, ...fields });
  if (state.events.length > MAX_EVENTS) state.events = state.events.slice(-MAX_EVENTS);
}

function pruneBag(bag, timestampField = 'lastSeenMs') {
  const cut = nowMs() - RECORD_TTL_MS;
  let entries = Object.entries(bag).filter(([, row]) => Number(row && row[timestampField] || 0) >= cut);
  if (entries.length > MAX_RECORDS) {
    entries.sort((a, b) => Number(b[1][timestampField] || 0) - Number(a[1][timestampField] || 0));
    entries = entries.slice(0, MAX_RECORDS);
  }
  return Object.fromEntries(entries);
}

function expireCandidates() {
  const cut = nowMs() - CANDIDATE_GRACE_MS();
  let expired = 0;
  for (const row of Object.values(state.candidates)) {
    if (row && row.status === 'candidate' && Number(row.firstSeenMs || 0) <= cut) {
      row.status = 'unconfirmed';
      row.reason = row.reason || 'mt5-open-not-confirmed';
      row.updatedAt = nowISO();
      addEvent('candidate_unconfirmed', { code: row.code, magic: row.magic, reason: row.reason });
      expired++;
    }
  }
  return expired;
}

function prune() {
  expireCandidates();
  state.opens = pruneBag(state.opens);
  state.openAliases = Object.fromEntries(Object.entries(state.openAliases || {})
    .filter(([alias, canonical]) => alias !== canonical && state.opens[canonical]));
  state.closes = pruneBag(state.closes);
  state.candidates = pruneBag(state.candidates);
  state.decisions = pruneBag(state.decisions);
}

function persist() {
  state.updatedAt = nowISO();
  if (TEST_EPHEMERAL) return { localSaved: true, remoteQueued: false };
  let localSaved = false; let remoteQueued = false;
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    const tmp = `${STATE_FILE}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(state), 'utf8');
    fs.renameSync(tmp, STATE_FILE);
    localSaved = true;
  } catch (_) { /* persistence mirror remains best-effort */ }
  try { botPersistence.save(SUBDIR, FILE, state); remoteQueued = true; } catch (_) { /* best-effort remote mirror */ }
  return { localSaved, remoteQueued };
}

async function persistDurable() {
  const result = persist();
  if (result.localSaved) return true;
  if (typeof botPersistence.saveNow !== 'function') return false;
  try {
    const snapshot = JSON.parse(JSON.stringify(state));
    const remote = await botPersistence.saveNow(SUBDIR, FILE, snapshot);
    return remote === true || !!(remote && remote.saved === true);
  } catch (_) {
    return false;
  }
}

function fmt(v, d = 5) {
  const n = finite(v);
  if (n === null) return '—';
  const abs = Math.abs(n);
  const dec = abs >= 1000 ? 2 : abs >= 10 ? 3 : d;
  return n.toFixed(dec);
}
function dirWord(d) { return d === 'long' ? 'LONG 🟢⬆️' : 'SHORT 🔴⬇️'; }
function botFor(magic, suppliedName) {
  const bot = magicToBot(magic);
  const label = suppliedName || (bot.no ? botLabel(bot.botId) : bot.name);
  return { ...bot, label: label || bot.name };
}

function normalizeCandidate(raw = {}) {
  const code = text(raw.code || raw.signalId || raw.id);
  const magic = positive(raw.magic);
  const symbol = text(raw.symbol);
  const direction = directionOf(raw.direction || raw.side);
  if (!code || magic === null || !symbol || !direction) return null;
  const bot = botFor(magic, raw.botName);
  return {
    code, botId: text(raw.botId) || bot.botId, botName: text(raw.botName) || bot.label,
    magic, symbol, direction,
    entry: positive(raw.entry), sl: positive(raw.stop || raw.sl), tp: positive(raw.target1 || raw.tp),
  };
}

/** Record executable feed rows.  They are candidates, not Telegram signals. */
function observeCandidates(rows = []) {
  load();
  let observed = 0;
  for (const raw of Array.isArray(rows) ? rows : []) {
    const c = normalizeCandidate(raw);
    if (!c) continue;
    const key = candidateKey(c);
    const old = state.candidates[key];
    if (old && (old.status === 'opened' || old.status === 'rejected')) {
      old.lastSeenMs = nowMs();
      continue;
    }
    // C1 huni: aynı aday her turda yeniden görülür; sayaç YALNIZ ilk görüşte artar.
    if (!old) botFunnel.noteSignal(c.magic);
    state.candidates[key] = {
      ...old, ...c, status: old && old.status === 'unconfirmed' ? 'unconfirmed' : 'candidate',
      firstSeenMs: Number(old && old.firstSeenMs) || nowMs(), lastSeenMs: nowMs(), updatedAt: nowISO(),
    };
    observed++;
  }
  const expired = expireCandidates();
  if (observed || expired) { prune(); persist(); }
  return { observed, audit: auditStatus() };
}

function observeDecisions(rows = [], context = {}) {
  load();
  let accepted = 0, rejected = 0, invalid = 0;
  for (const raw of Array.isArray(rows) ? rows : []) {
    const key = candidateKey(raw);
    if (!key || key === '||') { invalid++; continue; }
    const ok = raw.accepted === true || text(raw.status).toLowerCase() === 'accepted';
    const reason = text(raw.reason || raw.rejectReason || (ok ? 'accepted' : 'rejected'));
    const id = text(raw.id || raw.decisionId) || key;
    const suppliedAccount = accountFields(raw); const contextAccount = accountFields(context);
    const account = {
      accountLogin: suppliedAccount.accountLogin || contextAccount.accountLogin,
      accountServer: suppliedAccount.accountServer || contextAccount.accountServer,
    };
    const decisionKey = brokerStateKey(id, account);
    const previous = state.decisions[decisionKey];
    const row = {
      id, code: text(raw.code || raw.signalId),
      magic: positive(raw.magic), botId: text(raw.botId), ticket: text(raw.ticket),
      symbol: text(raw.symbol), direction: directionOf(raw.direction || raw.side),
      lot: positive(raw.lot), riskUsd: finite(raw.riskUsd),
      accepted: ok, status: ok ? 'accepted' : 'rejected', reason,
      firstSeenMs: Number(previous && previous.firstSeenMs) || nowMs(), lastSeenMs: nowMs(), updatedAt: nowISO(),
      ...account,
    };
    state.decisions[decisionKey] = row;
    // C1 huni: aynı karar tekrar POST edilebilir; sayaç YALNIZ ilk görüşte artar.
    if (!previous) botFunnel.noteDecision(row.magic, ok, reason);
    const candidate = state.candidates[key] || (row.code ? state.candidates[row.code] : null);
    if (candidate && !ok) {
      candidate.status = 'rejected'; candidate.reason = reason; candidate.lastSeenMs = nowMs();
    }
    if (ok) accepted++; else rejected++;
    addEvent(ok ? 'execution_accepted' : 'execution_rejected', { code: row.code, magic: row.magic, reason });
  }
  if (accepted || rejected) { prune(); persist(); }
  return { accepted, rejected, invalid };
}

function findCandidate(raw) {
  const explicit = text(raw.code || raw.signalId);
  if (explicit && state.candidates[explicit]) return state.candidates[explicit];
  const magic = positive(raw.magic);
  const symbol = symbolKey(raw.symbol);
  const direction = directionOf(raw.direction || raw.side);
  const matches = Object.values(state.candidates).filter((c) => c && c.magic === magic
    && symbolKey(c.symbol) === symbol && c.direction === direction && c.status !== 'rejected');
  matches.sort((a, b) => Number(b.lastSeenMs || 0) - Number(a.lastSeenMs || 0));
  return matches[0] || null;
}

function normalizeOpen(raw = {}, context = {}) {
  const suppliedAccount = accountFields(raw);
  const contextAccount = accountFields(context);
  const account = {
    accountLogin: suppliedAccount.accountLogin || contextAccount.accountLogin,
    accountServer: suppliedAccount.accountServer || contextAccount.accountServer,
  };
  const positionIdentifier = text(raw.positionIdentifier || raw.position_identifier);
  const closeBeforeOpenTickets = [...new Set((Array.isArray(raw.closeBeforeOpenTickets)
    ? raw.closeBeforeOpenTickets : []).map(text).filter(Boolean))].slice(0, 50);
  const ticket = text(raw.ticket || raw.positionTicket || positionIdentifier || raw.positionId);
  const magic = positive(raw.magic);
  const symbol = text(raw.symbol);
  const direction = directionOf(raw.direction || raw.side || raw.type);
  const lot = positive(raw.lot || raw.volume);
  const entry = positive(raw.entry || raw.entryPrice || raw.price || raw.priceOpen);
  if (!ticket || magic === null || !symbol || !direction || lot === null || entry === null) {
    return { error: 'invalid-broker-open', ticket, magic, symbol, direction };
  }
  const candidate = findCandidate(raw);
  const commentCode = codeFromComment(raw.comment);
  // Broker-returned identity beats heuristic candidate matching.  Candidate is
  // only a fallback for the legacy bridge payload that omitted code/comment.
  const code = text(raw.code || raw.signalId) || commentCode
    || (candidate && candidate.code) || `MT5-${ticket}`;
  const bot = botFor(magic, raw.botName || (candidate && candidate.botName));
  return {
    ticket, magic, botId: text(raw.botId) || (candidate && candidate.botId) || bot.botId,
    botName: text(raw.botName) || (candidate && candidate.botName) || bot.label,
    code, symbol, direction, lot, entry,
    sl: positive(raw.sl || raw.stop), tp: positive(raw.tp || raw.target1),
    openedSec: positive(raw.openedSec || raw.time), candidateKey: candidate && candidate.code,
    source: text(raw.source || context.source), positionIdentifier, closeBeforeOpenTickets, ...account,
  };
}

function resolveOpenKey(ticket, identity = {}) {
  const key = text(ticket);
  if (!key) return '';
  const lookupKey = brokerStateKey(key, identity);
  if (state.opens[lookupKey]) return lookupKey;
  const canonical = text(state.openAliases && state.openAliases[lookupKey]);
  if (canonical && state.opens[canonical]) return canonical;
  const matches = Object.entries(state.opens).filter(([, row]) => row && sameAccount(row, identity) && [
    row.ticket, row.orderTicket, row.positionTicket, row.positionIdentifier,
    ...(Array.isArray(row.aliases) ? row.aliases : []),
  ].some((value) => text(value) === key));
  if (matches.length !== 1) return '';
  state.openAliases[lookupKey] = matches[0][0];
  return matches[0][0];
}

function closeEnough(a, b, relativeTolerance) {
  const left = positive(a); const right = positive(b);
  if (left === null || right === null) return true;
  return Math.abs(left - right) <= Math.max(1e-9, Math.max(left, right) * relativeTolerance);
}

/**
 * The immediate broker-fill outbox initially knows the order ticket, while the
 * account snapshot later knows the position ticket.  Alias only that exact
 * source pair and only when a unique, recent, still-open execution fingerprint
 * agrees.  This deliberately does not merge two account snapshots or two
 * outbox fills merely because a strategy reused a code.
 */
function findOpenAlias(incoming) {
  const incomingOutbox = incoming.source === 'broker-fill-outbox';
  const incomingSnapshot = incoming.source === 'account-brain';
  if ((!incomingOutbox && !incomingSnapshot) || !incoming.code
      || /^MT5-/i.test(incoming.code)) return null;

  const matches = Object.entries(state.opens).filter(([, row]) => {
    if (!row || row.closedDealId) return false;
    if (!sameAccount(row, incoming)) return false;
    // Once both broker identifiers are known, a third ticket is a different
    // execution. Before that, allow either network request to win the race.
    if (row.orderTicket && row.positionTicket) return false;
    const rowOutbox = row.brokerFillSeen || row.source === 'broker-fill-outbox';
    const rowSnapshot = row.accountSnapshotSeen || row.source === 'account-brain';
    if (!((incomingOutbox && rowSnapshot) || (incomingSnapshot && rowOutbox))) return false;
    if (row.code !== incoming.code || row.magic !== incoming.magic
        || symbolKey(row.symbol) !== symbolKey(incoming.symbol)
        || row.direction !== incoming.direction) return false;

    const oldSec = positive(row.openedSec); const newSec = positive(incoming.openedSec);
    if (oldSec !== null && newSec !== null && Math.abs(oldSec - newSec) > OPEN_ALIAS_WINDOW_SEC) return false;
    if ((oldSec === null || newSec === null)
        && nowMs() - Number(row.firstSeenMs || 0) > OPEN_ALIAS_WINDOW_SEC * 1000) return false;
    // Position volume cannot exceed the submitted fill; ordinary price
    // slippage/normalization is allowed, but a materially different execution
    // is kept as a separate broker fact.
    if (!closeEnough(row.lot, incoming.lot, 0.02)) return false;
    if (!closeEnough(row.entry, incoming.entry, 0.005)) return false;
    if (!closeEnough(row.sl, incoming.sl, 0.002) || !closeEnough(row.tp, incoming.tp, 0.002)) return false;
    return true;
  });
  return matches.length === 1 ? { key: matches[0][0], record: matches[0][1] } : null;
}

/**
 * Kapanisin ait oldugu acilis kaydi.
 *
 * @returns {{record:Object|null, exact:boolean}} `exact` yalniz ticket /
 *   positionIdentifier ile KESIN eslesmede true olur.
 *
 * ⚠️ F2 (2026-08-01 dusman incelemesi): eskiden ticket tutmayinca
 * magic+sembol+yon ile "en yeni acik pozisyona" geri dusuluyordu ve donen kayit
 * KESIN eslesmeymis gibi kullaniliyordu. Iki kanitli sonuc:
 *   1. Kapanis, HALA ACIK olan baska bir pozisyona baglaniyor ve o pozisyon
 *      defterde `closedDealId` ile KAPALI isaretleniyordu.
 *   2. Yon suzgeci fiilen calismiyordu: koprunun urettigi kapanis satirinda
 *      `direction` alani YOK -> SHORT kapanisi acik LONG'a baglanabiliyordu.
 * Heuristik dal artik yalniz TEK aday varken calisir ve `exact:false` doner;
 * cagiran taraf bu kaydi kimlik olarak KULLANMAZ.
 */
function findOpenMatch(deal) {
  for (const identifier of [deal.positionIdentifier, deal.positionTicket]) {
    const exactKey = resolveOpenKey(identifier, deal);
    if (exactKey) return { record: state.opens[exactKey], exact: true };
  }
  const rows = Object.values(state.opens).filter((o) => o && o.magic === deal.magic
    && sameAccount(o, deal) && symbolKey(o.symbol) === symbolKey(deal.symbol)
    && (!directionOf(deal.direction) || !directionOf(o.direction)
      || directionOf(o.direction) === directionOf(deal.direction))
    && !o.closedDealId);
  // Birden fazla aday varsa hangisinin kapandigini BILEMEYIZ; tahmin etmektense
  // "eslenmedi" demek dogrudur (yanlis eslesme canli pozisyonu kapali gosterir).
  if (rows.length !== 1) return { record: null, exact: false };
  return { record: rows[0], exact: false };
}

function findOpenForClose(deal) { return findOpenMatch(deal).record; }

/** Acilis kaydi hic gorunmeyen kapanis en fazla bu kadar bekler. */
const CLOSE_WAIT_FOR_OPEN_MS = () =>
  Math.max(0, Number(process.env.MT5_CLOSE_WAIT_OPEN_MS || 15 * 60 * 1000));

/** Bu acilisin pozisyonu icin duyurulmus (veya kuyruktaki) bir kapanis var mi? */
function closeAlreadyAnnouncedFor(openRecord) {
  const announced = (row) => !!row && ['sent', 'batched'].includes(row.notification);
  // ⚠️ `closedDealId` YALNIZ "hangi deal kapatti" bilgisidir; o kapanis daha
  // gonderilmemis olabilir (Telegram kapaliyken defter yine yazilir). Duyuru
  // yapilip yapilmadigina KAPANIS KAYDININ durumundan bakilir.
  if (openRecord.closedDealId
    && announced(state.closes[brokerStateKey(openRecord.closedDealId, openRecord)])) return true;
  const ids = [openRecord.ticket, openRecord.positionTicket, openRecord.orderTicket,
    openRecord.positionIdentifier, ...(Array.isArray(openRecord.aliases) ? openRecord.aliases : [])]
    .map(text).filter(Boolean);
  if (!ids.length) return false;
  return Object.values(state.closes).some((row) => row && sameAccount(row, openRecord)
    && announced(row)
    && [row.positionTicket, row.positionIdentifier].some((v) => ids.includes(text(v))));
}

function closeRecordForDependency(identifier, identity) {
  const dependency = text(identifier);
  if (!dependency) return null;
  const openKey = resolveOpenKey(dependency, identity);
  const linkedOpen = openKey && state.opens[openKey];
  if (linkedOpen && linkedOpen.closedDealId) {
    const direct = state.closes[brokerStateKey(linkedOpen.closedDealId, linkedOpen)];
    if (direct) return direct;
    const byDeal = Object.values(state.closes).find((row) => row
      && sameAccount(row, identity) && text(row.dealId) === text(linkedOpen.closedDealId));
    if (byDeal) return byDeal;
  }
  const matches = Object.values(state.closes).filter((row) => row && sameAccount(row, identity)
    && [row.positionTicket, row.positionIdentifier].some((value) => text(value) === dependency));
  matches.sort((a, b) => {
    if (a.notification === 'sent' && b.notification !== 'sent') return -1;
    if (b.notification === 'sent' && a.notification !== 'sent') return 1;
    return Number(b.lastSeenMs || 0) - Number(a.lastSeenMs || 0);
  });
  if (matches.length) return matches[0];

  // A broker-fill outbox may only know POSITION_TICKET while the first history
  // row exposes POSITION_IDENTIFIER. If the backend never observed the old
  // open, bridge those identifiers only through one unambiguous, account-
  // scoped reversal fingerprint close to the new fill time.
  if (!accountScope(identity) || !positive(identity.magic) || !symbolKey(identity.symbol)
      || !directionOf(identity.direction)) return null;
  const openedSec = positive(identity.openedSec);
  const opposite = directionOf(identity.direction) === 'long' ? 'short' : 'long';
  const fallback = Object.values(state.closes).filter((row) => row && sameAccount(row, identity)
    && row.magic === identity.magic && symbolKey(row.symbol) === symbolKey(identity.symbol)
    && directionOf(row.direction) === opposite
    && (openedSec === null || Math.abs(Number(row.closedSec || 0) - openedSec) <= OPEN_ALIAS_WINDOW_SEC));
  return fallback.length === 1 ? fallback[0] : null;
}

function unresolvedCloseDependencies(record) {
  const dependencies = Array.isArray(record && record.closeBeforeOpenTickets)
    ? record.closeBeforeOpenTickets : [];
  return dependencies.filter((identifier) => {
    const closeRecord = closeRecordForDependency(identifier, record);
    return !closeRecord || closeRecord.notification !== 'sent';
  });
}

// SADE MESAJ (kullanici istegi 2026-08-01): bot adi, parite-yon, giris/stop/tp, lot.
// Magic, hesap, kod, ticket gibi teknik alanlar mesajdan cikarildi - hepsi zaten
// deftere ve /api/bridge/audit'e yaziliyor, mesajda gurultu yapiyorlardi.
function openMessage(p) {
  const bot = botFor(p.magic, p.botName);
  return [
    `🤖 <b>${html(bot.label)}</b>`,
    `<b>${html(p.symbol)}</b> · <b>${dirWord(p.direction)}</b>`,
    `Giriş <b>${fmt(p.entry)}</b> · Stop <b>${fmt(p.sl)}</b> · TP <b>${fmt(p.tp)}</b>`,
    `Lot <b>${fmt(p.lot, 2)}</b>`,
  ].join('\n');
}

// SADE KAPANIS: bot adi, parite ve NET kar/zarar. Net rakam zaten komisyon,
// swap ve ucreti icerir; kalemleri ayri ayri yazmaya gerek yok.
function closeMessage(d) {
  const bot = botFor(d.magic, d.botName);
  const pnl = finite(d.netPnl) || 0;
  const icon = pnl > 0 ? '✅' : pnl < 0 ? '🛑' : '⚪';
  return [
    `${icon} <b>${html(bot.label)}</b>`,
    `<b>${html(d.symbol)}</b> · <b>${pnl >= 0 ? '+' : '-'}$${Math.abs(pnl).toFixed(2)}</b>`,
  ].join('\n');
}

async function send(message) {
  const telegram = require('../telegramService');
  const { signalChannel } = require('../signalDelivery');
  const chatId = process.env.TELEGRAM_TRADE_CHANNEL || signalChannel();
  if (!chatId) throw new Error('telegram-trade-channel-missing');
  const result = await telegram.sendMessage(chatId, message, 'HTML');
  if (!(result === true || result && result.success === true)) {
    throw new Error(text(result && result.error) || 'telegram-send-rejected');
  }
  return true;
}

/**
 * F1 (2026-08-01 düşman incelemesi) — TEK BOĞAZ: Telegram hız sınırı.
 *
 * Bulgu: `RETRY_BATCH=8` bütçesi yalnız retryPending'in ilk iki döngüsüne
 * uygulanıyordu. `releaseOrderedLifecycle()` bütçesiz çalışıyor, asıl akış olan
 * `ingestState` ise hiç bütçe uygulamıyordu. Kanıtlanan sonuç: TEK HTTP
 * isteğinde 120 Telegram mesajı; 15 dakikalık kesintide 3.784 API çağrısı.
 * Telegram kanal limiti ~20 msg/dk — bu tempoda 429 gelir, tekrarında ban
 * süresi UZAR ve bildirimler GERÇEKTEN kaybolur. Yani A1'in çözdüğü sorunu
 * geri getirir.
 *
 * Çözüm mimariyi ters çevirmeden: gönderim yollarının HEPSİ tek bir jeton
 * kovasından geçer. Jeton yoksa kayıt 'failed' + geri çekilme ile kuyrukta
 * kalır; hiçbir bildirim düşmez, yalnız yavaşlar.
 */
const RATE_PER_MIN = () => Math.max(1, Number(process.env.MT5_NOTIFY_RATE_PER_MIN || 18));
const RATE_WINDOW_MS = 60000;
let rateTokens = null;      // kalan jeton
let rateWindowStartMs = 0;

function takeRateToken() {
  const now = nowMs();
  if (rateTokens === null || now - rateWindowStartMs >= RATE_WINDOW_MS) {
    rateWindowStartMs = now;
    rateTokens = RATE_PER_MIN();
  }
  if (rateTokens <= 0) return false;
  rateTokens--;
  return true;
}

/**
 * F1b — ÜSTEL GERİ ÇEKİLME. `record.attempts` yazılıyordu ama hiçbir yerde
 * OKUNMUYORDU: 429 sonrası köprünün 2 sn'lik POST'u aynı kaydı hemen yeniden
 * deniyordu. Artık her başarısızlık bir sonraki denemeyi geciktirir.
 */
const BACKOFF_MAX_MS = 5 * 60 * 1000;
const BACKOFF_BASE_MS = () => {
  const v = Number(process.env.MT5_NOTIFY_BACKOFF_BASE_MS);
  return Number.isFinite(v) && v >= 0 ? v : 1000;
};
function scheduleBackoff(record) {
  const base = BACKOFF_BASE_MS();
  if (base <= 0) { delete record.nextAttemptMs; return; }   // testler icin kapatilabilir
  const attempts = Math.max(1, Number(record.attempts || 1));
  const delay = Math.min(BACKOFF_MAX_MS, base * Math.pow(2, Math.min(attempts, 12)));
  record.nextAttemptMs = nowMs() + delay;
}
function backoffActive(record) {
  const next = Number(record && record.nextAttemptMs);
  return Number.isFinite(next) && next > nowMs();
}
/** Denemesi sürekli başarısız olan kayıt: sessizce kaybolmasın, GÖRÜNSÜN. */
const STUCK_ATTEMPTS = 8;
function isStuck(record) {
  return Number(record && record.attempts || 0) >= STUCK_ATTEMPTS
    && record.notification !== 'sent' && record.notification !== 'historical';
}

function deliveryInFlight(record) {
  if (!record || record.notification !== 'pending') return false;
  const startedMs = Date.parse(text(record.lastAttemptAt));
  if (!Number.isFinite(startedMs)) return false;
  const ageMs = nowMs() - startedMs;
  return ageMs >= -60000 && ageMs < DELIVERY_INFLIGHT_MS();
}

async function deliver(kind, record, message) {
  // F1: tek boğaz. Jeton yoksa gönderme — kayıt kuyrukta kalır, kaybolmaz.
  if (!takeRateToken()) {
    record.notification = 'failed';
    record.lastError = 'telegram-rate-limited';
    record.attempts = Number(record.attempts || 0) + 1;
    scheduleBackoff(record);
    addEvent(`${kind}_rate_limited`, { ticket: record.ticket, dealId: record.dealId });
    persist();
    return false;
  }
  record.notification = 'pending';
  record.attempts = Number(record.attempts || 0) + 1;
  record.lastAttemptAt = nowISO();
  if (!(await persistDurable())) {
    record.notification = 'failed';
    record.lastError = 'notification-state-not-durable';
    scheduleBackoff(record);
    addEvent(`${kind}_notify_failed`, {
      ticket: record.ticket, dealId: record.dealId, code: record.code, reason: record.lastError,
    });
    persist();
    return false;
  }
  try {
    await send(message);
    record.notification = 'sent'; record.notifiedAt = nowISO();
    delete record.lastError; delete record.nextAttemptMs;
    addEvent(`${kind}_notified`, { ticket: record.ticket, dealId: record.dealId, code: record.code });
    if (await persistDurable()) return true;
    record.lastError = 'notification-sent-state-not-durable';
    addEvent(`${kind}_notify_state_failed`, {
      ticket: record.ticket, dealId: record.dealId, code: record.code, reason: record.lastError,
    });
    persist();
    return false;
  } catch (error) {
    record.notification = 'failed'; record.lastError = cleanError(error);
    scheduleBackoff(record);
    if (isStuck(record)) {
      addEvent(`${kind}_notify_stuck`, {
        ticket: record.ticket, dealId: record.dealId, attempts: record.attempts, reason: record.lastError,
      });
    }
    addEvent(`${kind}_notify_failed`, { ticket: record.ticket, dealId: record.dealId, code: record.code, reason: record.lastError });
    await persistDurable();
    return false;
  }
}

/**
 * C3 — KAPANIŞ TOPLAMA (kullanıcı kararı D6: açılışlar anlık ve 1:1, kapanışlar
 * toplanabilir). Yoğun bir dakikada 10 ayrı kapanış bildirimi yerine tek mesaj.
 *
 * ⚠️ Bir kapanış, kendisinden sonra gelecek bir AÇILIŞI bekletiyorsa (ters
 * dönüş) ASLA toplanmaz — yoksa 60 sn'lik pencere açılış bildirimini de
 * geciktirirdi ve "önce kapanış sonra açılış" sırası kullanıcıya 1 dakika
 * gecikmeli görünürdü.
 *
 * Toplanan satır diskte `notification:'batched'` olarak durur; ayrı bir bellek
 * kuyruğu YOKTUR. Süreç yeniden başlarsa kayıt kaybolmaz, `failed`e çevrilip
 * tek tek yeniden gönderilir.
 */
const CLOSE_BATCH_MS = () => {
  const v = Number(process.env.MT5_CLOSE_BATCH_MS);
  return Number.isFinite(v) && v >= 0 ? v : 20000;
};
const CLOSE_BATCH_MAX = 12;          // tek mesajda en çok kaç kapanış
// Toplu kesim (sürü dönüşü, gün sonu süpürmesi) aynı beyin turunda birden çok
// kapanış üretir; bunlar TEK POST'ta gelir ve pencere beklenmeden birleşir.
// Tek başına gelen kapanış ise en fazla pencere kadar (20 sn) bekler — arkadan
// bir tane daha gelirse ona katılır, gelmezse yalnız gider.
const CLOSE_BATCH_MIN = 2;
let batchTimer = null;

function batchingEnabled() { return CLOSE_BATCH_MS() > 0; }

/** Bu kapanışın gönderilmesini bekleyen bir açılış var mı? */
function closeBlocksAnOpen(record) {
  const identifiers = [record.positionTicket, record.positionIdentifier, record.dealId]
    .map(text).filter(Boolean);
  if (!identifiers.length) return false;
  for (const open of Object.values(state.opens)) {
    if (!open || open.notification === 'sent') continue;
    const deps = Array.isArray(open.closeBeforeOpenTickets) ? open.closeBeforeOpenTickets : [];
    if (deps.some((d) => identifiers.includes(text(d)))) return true;
  }
  return false;
}

function batchedCloses() {
  return Object.values(state.closes).filter((r) => r && r.notification === 'batched')
    .sort((a, b) => (Date.parse(a.batchedAt) || 0) - (Date.parse(b.batchedAt) || 0));
}

function closeBatchMessage(records) {
  if (records.length === 1) return closeMessage(records[0]);
  const lines = [`📕 <b>KAPANIŞLAR (${records.length})</b>`];
  let net = 0;
  for (const d of records) {
    const pnl = finite(d.netPnl) || 0;
    net += pnl;
    const icon = pnl > 0 ? '✅' : pnl < 0 ? '🛑' : '⚪';
    lines.push(`${icon} <b>${html(botFor(d.magic, d.botName).label)}</b> · ${html(d.symbol)} · `
      + `<b>${pnl >= 0 ? '+' : '-'}$${Math.abs(pnl).toFixed(2)}</b>`);
  }
  lines.push(`━ Net: <b>${net >= 0 ? '+' : '-'}$${Math.abs(net).toFixed(2)}</b>`);
  return lines.join('\n');
}

/** Tek mesaj, çok kayıt: hepsi birlikte 'sent' ya da hepsi birlikte 'failed'. */
async function deliverBatch(records, message) {
  const markAll = (notification, lastError) => {
    for (const r of records) {
      r.notification = notification;
      if (lastError) r.lastError = lastError; else delete r.lastError;
    }
  };
  // F1: toplu mesaj da TEK jeton harcar (asil kazanc burada: 12 kapanis = 1 jeton).
  if (!takeRateToken()) {
    for (const r of records) {
      r.notification = 'failed';
      r.lastError = 'telegram-rate-limited';
      r.attempts = Number(r.attempts || 0) + 1;
      scheduleBackoff(r);
    }
    addEvent('close_batch_rate_limited', { count: records.length });
    persist();
    return false;
  }
  for (const r of records) {
    r.notification = 'pending';
    r.attempts = Number(r.attempts || 0) + 1;
    r.lastAttemptAt = nowISO();
  }
  if (!(await persistDurable())) {
    for (const r of records) scheduleBackoff(r);
    markAll('failed', 'notification-state-not-durable');
    addEvent('close_batch_notify_failed', { count: records.length, reason: 'not-durable' });
    persist();
    return false;
  }
  try {
    await send(message);
    for (const r of records) {
      r.notification = 'sent'; r.notifiedAt = nowISO();
      delete r.lastError; delete r.nextAttemptMs;
    }
    addEvent('close_batch_notified', { count: records.length });
    if (await persistDurable()) return true;
    for (const r of records) r.lastError = 'notification-sent-state-not-durable';
    addEvent('close_batch_notify_state_failed', { count: records.length });
    persist();
    return false;
  } catch (error) {
    markAll('failed', cleanError(error));
    for (const r of records) scheduleBackoff(r);
    addEvent('close_batch_notify_failed', { count: records.length, reason: cleanError(error) });
    await persistDurable();
    return false;
  }
}

function batchDue(batched) {
  if (!batched.length) return false;
  if (batched.length >= CLOSE_BATCH_MIN) return true;
  const oldest = Date.parse(batched[0].batchedAt);
  return !Number.isFinite(oldest) || nowMs() - oldest >= CLOSE_BATCH_MS();
}

/** Toplanmış kapanışları tek mesajda gönder. `force` pencereyi beklemez. */
async function flushCloseBatch(options = {}) {
  load();
  const out = { closeNotified: 0, retryableFailures: 0, batched: 0 };
  let batched = batchedCloses();
  if (!batched.length) return out;
  if (!options.force && !batchDue(batched)) { out.batched = batched.length; return out; }
  if (notificationsDisabled()) {
    for (const r of batched) { r.notification = 'failed'; r.lastError = 'MT5_TRADE_NOTIFY_DISABLED'; }
    out.retryableFailures = batched.length;
    persist();
    return out;
  }
  const chunk = batched.slice(0, CLOSE_BATCH_MAX);
  if (await deliverBatch(chunk, closeBatchMessage(chunk))) out.closeNotified = chunk.length;
  else out.retryableFailures = chunk.length;
  out.batched = batchedCloses().length;
  if (out.batched) scheduleBatchFlush();
  return out;
}

function scheduleBatchFlush() {
  // Testlerde zamanlayıcı kurulmaz: akış açıkça flushCloseBatch() ile sürülür,
  // yoksa gecikmeli bir tetik sonraki testin durumunu bozardı.
  if (batchTimer || process.env.NODE_ENV === 'test' || !batchingEnabled()) return;
  batchTimer = setTimeout(() => {
    batchTimer = null;
    flushCloseBatch({ force: true }).catch(() => {});
  }, Math.max(250, CLOSE_BATCH_MS()));
  if (typeof batchTimer.unref === 'function') batchTimer.unref();
}

async function releaseWaitingOpens() {
  let notified = 0; let skipped = 0; let retryableFailures = 0;
  for (const record of Object.values(state.opens)) {
    if (!record || record.notification !== 'waiting-close') continue;
    const blockers = unresolvedCloseDependencies(record);
    record.pendingCloseTickets = blockers;
    if (blockers.length) {
      if (notificationsDisabled()) retryableFailures++;
      continue;
    }
    delete record.notification;
    delete record.lastError;
    if (notificationsDisabled()) {
      record.notification = 'failed';
      record.lastError = 'MT5_TRADE_NOTIFY_DISABLED';
      skipped++;
      retryableFailures++;
      continue;
    }
    if (deliveryInFlight(record) || backoffActive(record)) { skipped++; continue; }
    if (await deliver('open', record, openMessage(record))) notified++;
    else retryableFailures++;
  }
  return { notified, skipped, retryableFailures };
}

async function releaseWaitingCloses() {
  let notified = 0; let skipped = 0; let retryableFailures = 0;
  for (const record of Object.values(state.closes)) {
    if (!record || record.notification !== 'waiting-open') continue;
    const openRecord = findOpenForClose(record);
    if (!openRecord || openRecord.notification !== 'sent') {
      // F2: acilis hic gelmeyebilir (kayip POST). Tavan dolunca kapanis yine de
      // birakilir — bildirim kaybi, sira bozuklugundan daha agir bir ihlaldir.
      // Bilinen ama henuz gonderilmemis acilis icin tavan YOKTUR.
      const waitedMs = nowMs() - (Number(record.waitingSinceMs) || nowMs());
      if (openRecord || waitedMs < CLOSE_WAIT_FOR_OPEN_MS()) {
        if (notificationsDisabled()) retryableFailures++;
        continue;
      }
      record.openNeverSeen = true;
      addEvent('close_released_without_open', {
        dealId: record.dealId, ticket: record.positionTicket,
        waitedSec: Math.round(waitedMs / 1000),
      });
    }
    delete record.notification;
    delete record.lastError;
    delete record.pendingOpenTicket;
    if (notificationsDisabled()) {
      record.notification = 'failed';
      record.lastError = 'MT5_TRADE_NOTIFY_DISABLED';
      skipped++;
      retryableFailures++;
      continue;
    }
    if (deliveryInFlight(record) || backoffActive(record)) { skipped++; continue; }
    if (await deliver('close', record, closeMessage(record))) notified++;
    else retryableFailures++;
  }
  return { notified, skipped, retryableFailures };
}

async function releaseOrderedLifecycle() {
  const total = { openNotified: 0, closeNotified: 0, skipped: 0, retryableFailures: 0 };
  const limit = Math.max(1, Math.min(MAX_RECORDS, Object.keys(state.opens).length + Object.keys(state.closes).length));
  for (let i = 0; i < limit; i++) {
    const opens = await releaseWaitingOpens();
    const closes = await releaseWaitingCloses();
    total.openNotified += opens.notified;
    total.closeNotified += closes.notified;
    total.skipped += opens.skipped + closes.skipped;
    total.retryableFailures += opens.retryableFailures + closes.retryableFailures;
    if (opens.notified + closes.notified === 0) break;
  }
  return total;
}


// ── ARKA PLAN TEKRAR DONGUSU (A1) ───────────────────────────────────────────
// Onceden bildirimin TEK tekrar yolu koprunun 503 alip ayni satirlari yeniden
// POST etmesiydi. Bu, MUHASEBEYI BILDIRIME bagimli kiliyordu: Telegram hiz
// limitine takilinca kopru cursor'unu ilerletemiyor, kapanislar deftere hic
// yazilamiyordu (2026-07-31: gercek -3.234,88 $ iken rapor -74,51 $ dedi).
// Artik teslimat burada, kendi temposunda ve hiz sinirli olarak yeniden denenir;
// kopru 200 alip defterini ilerletebilir. Sira korunur: acilis once.
const RETRY_BATCH = () => Math.max(1, Number(process.env.MT5_NOTIFY_RETRY_BATCH || 8));

function pendingCount() {
  let n = 0;
  for (const bag of [state.opens, state.closes]) {
    for (const r of Object.values(bag || {})) {
      if (!r || !r.notification) continue;
      if (r.notification === 'sent' || r.notification === 'historical') continue;
      n++;
    }
  }
  return n;
}

async function retryPending() {
  load();
  const out = { openNotified: 0, closeNotified: 0, retryableFailures: 0, pending: 0 };
  if (notificationsDisabled()) { out.pending = pendingCount(); return out; }
  // C3: penceresi dolmuş toplu kapanış varsa once o gitsin — zamanlayici
  // yeniden baslatmada kaybolsa bile bu drenaj onu kurtarir.
  const flushed = await flushCloseBatch();
  out.closeNotified += flushed.closeNotified;
  out.retryableFailures += flushed.retryableFailures;
  let budget = RETRY_BATCH();   // Telegram hiz limiti: tur basina tavan

  // 1) Basarisiz ACILISLAR once — kapanis acilistan once gidemez.
  for (const record of Object.values(state.opens)) {
    if (budget <= 0) break;
    if (!record || record.notification !== 'failed') continue;
    if (deliveryInFlight(record) || backoffActive(record)) continue;
    if (unresolvedCloseDependencies(record).length) continue;
    budget--;
    if (await deliver('open', record, openMessage(record))) out.openNotified++;
    else out.retryableFailures++;
  }
  // 2) Basarisiz KAPANISLAR — yalniz kendi acilisi gonderilmisse.
  for (const record of Object.values(state.closes)) {
    if (budget <= 0) break;
    if (!record || record.notification !== 'failed') continue;
    if (deliveryInFlight(record) || backoffActive(record)) continue;
    const openRecord = findOpenForClose(record);
    if (openRecord && openRecord.notification !== 'sent') continue;
    budget--;
    if (await deliver('close', record, closeMessage(record))) out.closeNotified++;
    else out.retryableFailures++;
  }
  // 3) Sirali bekleyenler (waiting-open / waiting-close) cozulduyse birak.
  const ordered = await releaseOrderedLifecycle();
  out.openNotified += ordered.openNotified;
  out.closeNotified += ordered.closeNotified;
  out.retryableFailures += ordered.retryableFailures;
  out.pending = pendingCount();
  return out;
}

/**
 * Ingest broker facts posted by the bridge.
 * @param {{open:Array, closed:Array, decisions?:Array}} payload
 */
async function ingestState(payload = {}) {
  load();
  const open = Array.isArray(payload.open) ? payload.open : [];
  const closed = Array.isArray(payload.closed) ? payload.closed : [];
  const payloadAccount = accountFields(payload);
  const decisionResult = observeDecisions(payload.decisions, payloadAccount);
  let openNotified = 0, closeNotified = 0, skipped = 0, invalid = 0, retryableFailures = 0;
  let batchedCount = 0;

  for (const raw of open) {
    const normalized = normalizeOpen(raw, { source: payload.source, ...payloadAccount });
    if (normalized.error) {
      invalid++;
      addEvent('invalid_broker_open', { ticket: normalized.ticket, magic: normalized.magic, reason: normalized.error });
      continue;
    }
    const incomingTicket = normalized.ticket;
    const incomingKey = brokerStateKey(incomingTicket, normalized);
    let key = resolveOpenKey(incomingTicket, normalized)
      || resolveOpenKey(normalized.positionIdentifier, normalized)
      || incomingKey;
    let old = state.opens[key];
    let aliased = false;
    if (!old) {
      const match = findOpenAlias(normalized);
      if (match) {
        key = match.key; old = match.record; aliased = true;
        state.openAliases[incomingKey] = key;
      }
    }
    // C1 huni: emir bileti ile pozisyon bileti AYNI dolumun iki yüzü; takma ad
    // çözümlemesinden SONRA bakılır, yoksa tek işlem iki dolum sayılırdı.
    if (!old) botFunnel.noteFill(normalized.magic, secToMs(normalized.openedSec));
    const incomingOutbox = normalized.source === 'broker-fill-outbox';
    const incomingSnapshot = normalized.source === 'account-brain';
    const brokerFillSeen = !!(old && old.brokerFillSeen) || incomingOutbox;
    const accountSnapshotSeen = !!(old && old.accountSnapshotSeen) || incomingSnapshot;
    const orderTicket = text(old && old.orderTicket)
      || (incomingOutbox ? incomingTicket : '');
    const positionTicket = (incomingSnapshot ? incomingTicket : '')
      || text(old && old.positionTicket);
    const positionIdentifier = text(normalized.positionIdentifier)
      || text(old && old.positionIdentifier);
    const closeBeforeOpenTickets = [...new Set([
      ...((old && Array.isArray(old.closeBeforeOpenTickets)) ? old.closeBeforeOpenTickets : []),
      ...normalized.closeBeforeOpenTickets,
    ].map(text).filter(Boolean))].slice(0, 50);
    const aliases = [...new Set([
      ...((old && Array.isArray(old.aliases)) ? old.aliases : []),
      text(old && old.ticket), incomingTicket, positionIdentifier,
    ].filter(Boolean))];
    // Preserve object identity while an async Telegram send is in flight. A
    // concurrent snapshot can enrich this same broker fact without replacing
    // the record object that `deliver` will mark sent/failed.
    const record = old || {};
    Object.assign(record, normalized, {
      ticket: positionTicket || text(old && old.ticket) || incomingTicket,
      orderTicket, positionTicket, positionIdentifier, closeBeforeOpenTickets,
      aliases, brokerFillSeen, accountSnapshotSeen,
      firstSeenMs: Number(old && old.firstSeenMs) || nowMs(),
      lastSeenMs: nowMs(), brokerConfirmed: true,
    });
    state.opens[key] = record;
    for (const alias of aliases) {
      const aliasKey = brokerStateKey(alias, record);
      if (aliasKey !== key) state.openAliases[aliasKey] = key;
    }
    if (normalized.candidateKey && state.candidates[normalized.candidateKey]) {
      Object.assign(state.candidates[normalized.candidateKey], {
        status: 'opened', ticket: record.ticket, reason: 'broker-confirmed', lastSeenMs: nowMs(), updatedAt: nowISO(),
      });
    }
    if (aliased) {
      addEvent('broker_open_ticket_aliased', {
        ticket: record.ticket, orderTicket: record.orderTicket,
        positionTicket: record.positionTicket, positionIdentifier: record.positionIdentifier,
        code: record.code, magic: record.magic,
      });
    }
    addEvent(old ? 'broker_open_seen_again' : 'broker_open_confirmed', { ticket: record.ticket, code: record.code, magic: record.magic });
    if (record.notification === 'sent' || record.notification === 'historical') { skipped++; continue; }
    // F2b: bu pozisyonun KAPANISI zaten duyurulduysa acilis mesaji ARTIK bir
    // giris sinyali degildir — sade mesaj bicimi onu canli girisden ayirt
    // edilemez kilardi. Sessizce deftere yazilir, Telegram'a gitmez.
    if (closeAlreadyAnnouncedFor(record)) {
      record.notification = 'historical';
      record.lastError = 'position-already-closed-before-open-notification';
      skipped++;
      addEvent('open_suppressed_position_closed', {
        ticket: record.ticket, code: record.code, magic: record.magic,
      });
      continue;
    }
    const closeBlockers = unresolvedCloseDependencies(record);
    if (closeBlockers.length) {
      record.notification = 'waiting-close';
      record.pendingCloseTickets = closeBlockers;
      record.lastError = 'waiting-for-reversal-close-notification';
      skipped++;
      addEvent('open_waiting_for_close', {
        ticket: record.ticket, code: record.code, dependencies: closeBlockers,
      });
      if (notificationsDisabled()) retryableFailures++;
      continue;
    }
    if (record.notification === 'waiting-close') {
      delete record.notification;
      delete record.lastError;
      record.pendingCloseTickets = [];
    }
    // F1: geri cekilme suresi dolmadan yeniden denenmez (kopru 2 sn'de bir
    // POST ettigi icin 429 sonrasi aksi halde ani tekrar olurdu).
    if (deliveryInFlight(record) || backoffActive(record)) {
      skipped++; retryableFailures++;
      addEvent('open_notification_in_flight', { ticket: record.ticket, code: record.code });
      continue;
    }
    if (notificationsDisabled()) {
      record.notification = 'failed'; record.lastError = 'MT5_TRADE_NOTIFY_DISABLED'; skipped++;
      retryableFailures++;
      addEvent('open_notification_blocked', { ticket: record.ticket, code: record.code, reason: record.lastError });
      continue;
    }
    if (await deliver('open', record, openMessage(record))) openNotified++;
    else retryableFailures++;
  }

  const freshCut = nowMs() - CLOSE_FRESH_MS();
  for (const raw of closed) {
    const deal = normalizeExitDeal(raw);
    if (!deal) {
      invalid++;
      addEvent('invalid_exit_deal', { dealId: text(raw && (raw.id || raw.dealId)), reason: 'invalid-or-not-exit-deal' });
      continue;
    }
    deal.positionIdentifier = text(raw.positionIdentifier || raw.position_identifier);
    const rawAccount = accountFields(raw);
    deal.accountLogin = rawAccount.accountLogin || payloadAccount.accountLogin;
    deal.accountServer = rawAccount.accountServer || payloadAccount.accountServer;
    const notificationRequired = raw.notificationRequired === true;
    const openMatch = findOpenMatch(deal);
    const openRecord = openMatch.record;
    const dealKey = brokerStateKey(deal.id, deal);
    const old = state.closes[dealKey];
    // C1 huni: köprü 7 GÜNLÜK kapanış penceresini tekrar tekrar POST eder;
    // sayaç YALNIZ ilk görüşte artar.
    if (!old) botFunnel.noteClose(deal.magic, deal.netPnl ?? deal.pnl, secToMs(deal.closedSec));
    const exactComponents = old && old.componentsExact && !deal.componentsExact ? old : deal;
    const incoming = {
      dealId: deal.id,
      // F2: kimlik alanlari YALNIZ kesin eslesmede acilistan devralinir.
      // Heuristik eslesmede baska bir pozisyonun bileti yaziliyordu.
      positionTicket: (openMatch.exact && openRecord
        && (openRecord.positionTicket || openRecord.ticket)) || deal.positionTicket || '',
      positionIdentifier: deal.positionIdentifier
        || (openMatch.exact && openRecord && openRecord.positionIdentifier) || '',
      code: deal.code || (openRecord && openRecord.code) || '',
      botName: openRecord && openRecord.botName,
      magic: deal.magic, symbol: deal.symbol, direction: deal.direction || (openRecord && openRecord.direction) || '',
      exitPrice: deal.exitPrice, closedSec: deal.closedSec,
      profit: exactComponents.profit, commission: exactComponents.commission,
      swap: exactComponents.swap, fee: exactComponents.fee,
      componentsExact: !!exactComponents.componentsExact,
      volume: deal.volume,
      netPnl: exactComponents.netPnl ?? exactComponents.pnl ?? deal.pnl,
      reasonCode: deal.reasonCode, reason: deal.reason,
      firstSeenMs: Number(old && old.firstSeenMs) || nowMs(), lastSeenMs: nowMs(), brokerConfirmed: true,
      openMatched: !!openRecord || !!(old && old.openMatched),
      openMatchExact: openMatch.exact || !!(old && old.openMatchExact),
      notificationRequired: notificationRequired || !!(old && old.notificationRequired),
      accountLogin: deal.accountLogin, accountServer: deal.accountServer,
    };
    const record = old || {};
    state.closes[dealKey] = record;
    for (const [field, value] of Object.entries(incoming)) {
      if (value !== undefined && value !== null && value !== '') record[field] = value;
    }
    // F2: acik pozisyonu "kapali" isaretlemek GERI ALINAMAZ bir defter olgusudur;
    // yalniz KESIN eslesmede yapilir. Heuristik eslesme sayilir ama isaretlemez.
    if (openRecord && openMatch.exact) {
      openRecord.closedDealId = deal.id;
      openRecord.closedAt = new Date(deal.closedSec * 1000).toISOString();
    } else if (openRecord) {
      addEvent('close_matched_heuristically', {
        dealId: deal.id, ticket: openRecord.ticket, magic: deal.magic, symbol: deal.symbol,
      });
    }
    // Denetim halkasi (MAX_EVENTS=2000) korunur: zaten GONDERILMIS kaydin
    // rutin tekrar POST'u olay uretmez — yoksa kopru tekrarlari kritik
    // olaylari ~10 saniyede halkadan silip teshisi imkansiz kiliyordu.
    if (!old || record.notification !== 'sent') {
      addEvent(old ? 'exit_deal_seen_again' : 'exit_deal_confirmed', {
        dealId: deal.id, ticket: record.positionTicket, code: record.code, magic: record.magic,
        ...(openRecord ? {} : { reason: 'open-ticket-not-reconciled' }),
      });
    }
    if (record.notification === 'sent') { skipped++; continue; }
    if (record.notification === 'historical' && !notificationRequired) { skipped++; continue; }
    if (record.notification === 'historical' && notificationRequired) {
      delete record.notification;
      delete record.lastError;
      addEvent('historical_close_promoted', { dealId: deal.id, reason: 'notification-required' });
    }
    if (deliveryInFlight(record) || backoffActive(record)) {
      skipped++; retryableFailures++;
      addEvent('close_notification_in_flight', { dealId: deal.id, ticket: record.positionTicket });
      continue;
    }
    // Freshness protects deploy/restart from replaying a seven-day history
    // batch.  Once a fresh delivery entered the outbox, however, a Telegram
    // outage must remain retryable even if recovery takes longer than 90 min.
    const closesNotifiedOpen = !!(openRecord && openRecord.notification === 'sent'
      && deal.componentsExact);
    if (!old && !notificationRequired && !closesNotifiedOpen && deal.closedSec * 1000 < freshCut) {
      record.notification = 'historical'; record.lastError = 'outside-notification-freshness-window'; skipped++;
      continue;
    }
    // F2 (2026-08-01 dusman incelemesi): eski kosul `openRecord &&` idi. Acilis
    // koprunun outbox'inda takiliyken backend o kaydi HIC gormemis olur ->
    // openRecord null -> bekletme ATLANIYOR -> KAPANIS ACILISTAN ONCE gidiyordu.
    // Sade mesajlarda (2026-08-01) acilis mesaji ticket/kod tasimadigi icin,
    // gecikmis acilis CANLI YENI GIRIS sinyalinden ayirt edilemiyordu: kullanici
    // olu bir isleme girebilirdi. Artik acilis kaydi YOKSA da beklenir.
    if (!openRecord || openRecord.notification !== 'sent') {
      const waitingSinceMs = Number(record.waitingSinceMs) || nowMs();
      record.waitingSinceMs = waitingSinceMs;
      // Tavan YALNIZ acilis kaydi HIC gorulmemisken isler. Kayit varsa ve
      // henuz gonderilmemisse SINIRSIZ beklenir — o bekleyis mutlaka cozulur
      // (ters donus sirasi bu garantiye dayanir).
      if (openRecord || nowMs() - waitingSinceMs < CLOSE_WAIT_FOR_OPEN_MS()) {
        record.notification = 'waiting-open';
        record.pendingOpenTicket = (openRecord && (openRecord.ticket || openRecord.positionTicket))
          || record.positionTicket || record.positionIdentifier || '';
        record.lastError = openRecord ? 'waiting-for-open-notification' : 'waiting-for-unseen-open';
        skipped++;
        if (notificationsDisabled()) retryableFailures++;
        addEvent('close_waiting_for_open', {
          dealId: deal.id, ticket: record.positionTicket, openTicket: record.pendingOpenTicket,
          reason: record.lastError,
        });
        continue;
      }
      addEvent('close_released_without_open', {
        dealId: deal.id, ticket: record.positionTicket,
        waitedSec: Math.round((nowMs() - waitingSinceMs) / 1000),
      });
      record.openNeverSeen = true;
    }
    if (record.notification === 'waiting-open') {
      delete record.notification;
      delete record.lastError;
      delete record.pendingOpenTicket;
    }
    if (notificationsDisabled()) {
      record.notification = 'failed'; record.lastError = 'MT5_TRADE_NOTIFY_DISABLED'; skipped++;
      retryableFailures++;
      addEvent('close_notification_blocked', { dealId: deal.id, reason: record.lastError });
      continue;
    }
    // C3: bekleyen bir açılışı bloke etmiyorsa 60 sn'lik pencerede toplanır.
    if (batchingEnabled() && !closeBlocksAnOpen(record)) {
      record.notification = 'batched';
      record.batchedAt = nowISO();
      delete record.lastError;
      batchedCount++;
      persist();
      scheduleBatchFlush();
      continue;
    }
    if (await deliver('close', record, closeMessage(record))) closeNotified++;
    else retryableFailures++;
  }
  // Pencere dolduysa (ya da tavan aşıldıysa) aynı turda gönder — bir sonraki
  // POST'u beklemeye gerek yok.
  if (batchedCount) {
    const flushed = await flushCloseBatch();
    closeNotified += flushed.closeNotified;
    retryableFailures += flushed.retryableFailures;
  }

  // Reversal opens are announced only after every dependent close Telegram is
  // durably marked sent. Processing closes first here guarantees message order
  // even when the new broker fill reached the backend before the exit history.
  const released = await releaseOrderedLifecycle();
  openNotified += released.openNotified;
  closeNotified += released.closeNotified;
  skipped += released.skipped;
  retryableFailures += released.retryableFailures;

  prune();
  let durabilityFailures = 0;
  if (open.length || closed.length || decisionResult.accepted || decisionResult.rejected || invalid) {
    if (!(await persistDurable())) {
      durabilityFailures = 1;
      if (!retryableFailures) retryableFailures = 1;
      addEvent('lifecycle_state_persist_failed', { reason: 'no-acknowledged-persistence-target' });
      persist();
    }
  }
  return {
    openNotified, closeNotified, skipped, invalid, retryableFailures, durabilityFailures,
    decisions: decisionResult, audit: auditStatus(), notificationsDisabled: notificationsDisabled(),
  };
}

function auditStatus(options = {}) {
  load();
  // An audit read can be the first activity after the grace window; persist the
  // transition so signal-without-trade gaps survive a process restart.
  if (expireCandidates()) persist();
  const candidates = Object.values(state.candidates);
  const opens = Object.values(state.opens);
  const closes = Object.values(state.closes);
  const decisions = Object.values(state.decisions);
  const unconfirmedCandidates = candidates.filter((r) => r.status === 'unconfirmed');
  const rejectedDecisions = decisions.filter((r) => !r.accepted);
  const tradeWithoutSignal = opens.filter((r) => r.brokerConfirmed
    && !['sent', 'historical'].includes(r.notification));
  const closeWithoutSignal = closes.filter((r) => r.brokerConfirmed
    && !['sent', 'historical'].includes(r.notification));
  const closeWithoutOpen = closes.filter((r) => r.brokerConfirmed && !r.openMatched);
  const pendingNotifications = [...opens, ...closes].filter((r) => ['pending', 'failed'].includes(r.notification));
  const batched = closes.filter((r) => r.notification === 'batched');
  const rateLimited = [...opens, ...closes].filter((r) => r.lastError === 'telegram-rate-limited');
  const stuck = [...opens, ...closes].filter(isStuck);
  const summary = {
    candidates: candidates.length,
    brokerConfirmedOpens: opens.filter((r) => r.brokerConfirmed).length,
    brokerConfirmedCloses: closes.filter((r) => r.brokerConfirmed).length,
    notifiedOpens: opens.filter((r) => r.notification === 'sent').length,
    notifiedCloses: closes.filter((r) => r.notification === 'sent').length,
    unconfirmedCandidates: unconfirmedCandidates.length,
    signalWithoutTrade: unconfirmedCandidates.length,
    rejectedDecisions: rejectedDecisions.length,
    tradeWithoutSignal: tradeWithoutSignal.length,
    closeWithoutSignal: closeWithoutSignal.length,
    historicalCloses: closes.filter((r) => r.notification === 'historical').length,
    closeWithoutOpen: closeWithoutOpen.length,
    pendingNotifications: pendingNotifications.length,
    // F1/C3 gorunurluk: toplanmis kapanis normal bir gecis durumudur (saglikli
    // sayilir), ama TAKILMIS bildirim (>=8 deneme) asla sessiz kalmamali.
    batchedCloses: batched.length,
    rateLimited: rateLimited.length,
    stuckNotifications: stuck.length,
    healthy: unconfirmedCandidates.length === 0 && tradeWithoutSignal.length === 0
      && closeWithoutSignal.length === 0 && closeWithoutOpen.length === 0
      && pendingNotifications.length === 0 && stuck.length === 0,
    updatedAt: state.updatedAt,
  };
  if (!options.details) return summary;
  const limit = Math.max(1, Math.min(500, Number(options.limit) || 100));
  const compact = (rows) => rows.slice(-limit).map((r) => ({
    code: r.code, ticket: r.ticket || r.positionTicket, dealId: r.dealId,
    botId: r.botId, magic: r.magic, symbol: r.symbol, direction: r.direction,
    status: r.status || r.notification, reason: r.reason || r.lastError,
    firstSeenMs: r.firstSeenMs, lastSeenMs: r.lastSeenMs,
  }));
  return {
    ...summary,
    gaps: {
      unconfirmedCandidates: compact(unconfirmedCandidates),
      signalWithoutTrade: compact(unconfirmedCandidates),
      rejectedDecisions: compact(rejectedDecisions),
      tradeWithoutSignal: compact(tradeWithoutSignal),
      closeWithoutSignal: compact(closeWithoutSignal),
      closeWithoutOpen: compact(closeWithoutOpen),
      pendingNotifications: compact(pendingNotifications),
    },
    recentEvents: state.events.slice(-limit),
  };
}

function stats() { return auditStatus(); }
function resetForTest() {
  state = freshState(); loaded = true;
  rateTokens = null; rateWindowStartMs = 0;
  if (batchTimer) { clearTimeout(batchTimer); batchTimer = null; }
}
function reloadForTest() { state = freshState(); loaded = false; return load(); }

module.exports = {
  ingestState, observeCandidates, observeDecisions, auditStatus, stats,
  retryPending, pendingCount, flushCloseBatch, closeBatchMessage,
  openMessage, closeMessage, normalizeOpen, paperNotificationSuppressed,
  notificationsDisabled, resetForTest, reloadForTest,
};
