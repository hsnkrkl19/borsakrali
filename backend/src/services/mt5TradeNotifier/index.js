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
const DELIVERY_INFLIGHT_MS = () => {
  const configured = Number(process.env.MT5_NOTIFY_INFLIGHT_MS || 20000);
  return Number.isFinite(configured) ? Math.max(1000, configured) : 20000;
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
    if (!row || row.notification !== 'pending') continue;
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

function findOpenForClose(deal) {
  for (const identifier of [deal.positionIdentifier, deal.positionTicket]) {
    const exactKey = resolveOpenKey(identifier, deal);
    if (exactKey) return state.opens[exactKey];
  }
  const rows = Object.values(state.opens).filter((o) => o && o.magic === deal.magic
    && sameAccount(o, deal) && symbolKey(o.symbol) === symbolKey(deal.symbol)
    && (!directionOf(deal.direction) || !directionOf(o.direction)
      || directionOf(o.direction) === directionOf(deal.direction))
    && !o.closedDealId);
  rows.sort((a, b) => Number(b.firstSeenMs || 0) - Number(a.firstSeenMs || 0));
  return rows[0] || null;
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

function openMessage(p) {
  const bot = botFor(p.magic, p.botName);
  return [
    `🤖 <b>${html(bot.label)}</b>`,
    '✅ <b>MT5 GERÇEK AÇILIŞ</b>',
    `Bot: <b>${html(bot.label)}</b> · Magic: <code>${html(p.magic)}</code>`,
    `Hesap: <code>${html(accountDisplay(p))}</code>`,
    `Kod: <code>${html(p.code)}</code> · Ticket: <code>${html(p.ticket)}</code>`,
    `Sembol: <b>${html(p.symbol)}</b> · Yön: <b>${dirWord(p.direction)}</b>`,
    `Gerçek giriş: <b>${fmt(p.entry)}</b> · Lot: <b>${fmt(p.lot, 2)}</b>`,
    `SL: <b>${fmt(p.sl)}</b> · TP: <b>${fmt(p.tp)}</b>`,
  ].join('\n');
}

function closeMessage(d) {
  const bot = botFor(d.magic, d.botName);
  const pnl = finite(d.netPnl) || 0;
  const icon = pnl > 0 ? '✅' : pnl < 0 ? '🛑' : '⚪';
  return [
    `🤖 <b>${html(bot.label)}</b>`,
    `${icon} <b>MT5 GERÇEK KAPANIŞ</b> · <b>${html(d.symbol)}</b>`,
    `Bot: <b>${html(bot.label)}</b> · Magic: <code>${html(d.magic)}</code>`,
    `Hesap: <code>${html(accountDisplay(d))}</code>`,
    `Kod: <code>${html(d.code || '—')}</code> · Pozisyon ticket: <code>${html(d.positionTicket || 'eşleşmedi')}</code>`,
    `Çıkış deal: <code>${html(d.dealId)}</code> · Çıkış: <b>${fmt(d.exitPrice)}</b> · Lot: <b>${fmt(d.volume, 2)}</b>`,
    `Sebep: <b>${html(d.reason)}</b>`,
    `Net K/Z: <b>${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)}</b>`,
    `Kâr/Zarar: ${fmt(d.profit, 2)} · Komisyon: ${fmt(d.commission, 2)} · Swap: ${fmt(d.swap, 2)} · Ücret: ${fmt(d.fee, 2)}`,
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

function deliveryInFlight(record) {
  if (!record || record.notification !== 'pending') return false;
  const startedMs = Date.parse(text(record.lastAttemptAt));
  if (!Number.isFinite(startedMs)) return false;
  const ageMs = nowMs() - startedMs;
  return ageMs >= -60000 && ageMs < DELIVERY_INFLIGHT_MS();
}

async function deliver(kind, record, message) {
  record.notification = 'pending';
  record.attempts = Number(record.attempts || 0) + 1;
  record.lastAttemptAt = nowISO();
  if (!(await persistDurable())) {
    record.notification = 'failed';
    record.lastError = 'notification-state-not-durable';
    addEvent(`${kind}_notify_failed`, {
      ticket: record.ticket, dealId: record.dealId, code: record.code, reason: record.lastError,
    });
    persist();
    return false;
  }
  try {
    await send(message);
    record.notification = 'sent'; record.notifiedAt = nowISO(); delete record.lastError;
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
    addEvent(`${kind}_notify_failed`, { ticket: record.ticket, dealId: record.dealId, code: record.code, reason: record.lastError });
    await persistDurable();
    return false;
  }
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
    if (deliveryInFlight(record)) { skipped++; continue; }
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
      if (notificationsDisabled()) retryableFailures++;
      continue;
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
    if (deliveryInFlight(record)) { skipped++; continue; }
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
    if (deliveryInFlight(record)) {
      skipped++;
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
    const openRecord = findOpenForClose(deal);
    const dealKey = brokerStateKey(deal.id, deal);
    const old = state.closes[dealKey];
    const exactComponents = old && old.componentsExact && !deal.componentsExact ? old : deal;
    const incoming = {
      dealId: deal.id,
      positionTicket: (openRecord && (openRecord.positionTicket || openRecord.ticket)) || deal.positionTicket || '',
      positionIdentifier: deal.positionIdentifier || (openRecord && openRecord.positionIdentifier) || '',
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
      notificationRequired: notificationRequired || !!(old && old.notificationRequired),
      accountLogin: deal.accountLogin, accountServer: deal.accountServer,
    };
    const record = old || {};
    state.closes[dealKey] = record;
    for (const [field, value] of Object.entries(incoming)) {
      if (value !== undefined && value !== null && value !== '') record[field] = value;
    }
    if (openRecord) { openRecord.closedDealId = deal.id; openRecord.closedAt = new Date(deal.closedSec * 1000).toISOString(); }
    addEvent(old ? 'exit_deal_seen_again' : 'exit_deal_confirmed', {
      dealId: deal.id, ticket: record.positionTicket, code: record.code, magic: record.magic,
      ...(openRecord ? {} : { reason: 'open-ticket-not-reconciled' }),
    });
    if (record.notification === 'sent') { skipped++; continue; }
    if (record.notification === 'historical' && !notificationRequired) { skipped++; continue; }
    if (record.notification === 'historical' && notificationRequired) {
      delete record.notification;
      delete record.lastError;
      addEvent('historical_close_promoted', { dealId: deal.id, reason: 'notification-required' });
    }
    if (deliveryInFlight(record)) {
      skipped++;
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
    if (openRecord && openRecord.notification !== 'sent') {
      record.notification = 'waiting-open';
      record.pendingOpenTicket = openRecord.ticket || openRecord.positionTicket;
      record.lastError = 'waiting-for-open-notification';
      skipped++;
      if (notificationsDisabled()) retryableFailures++;
      addEvent('close_waiting_for_open', {
        dealId: deal.id, ticket: record.positionTicket, openTicket: record.pendingOpenTicket,
      });
      continue;
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
    if (await deliver('close', record, closeMessage(record))) closeNotified++;
    else retryableFailures++;
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
    healthy: unconfirmedCandidates.length === 0 && tradeWithoutSignal.length === 0
      && closeWithoutSignal.length === 0 && closeWithoutOpen.length === 0
      && pendingNotifications.length === 0,
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
function resetForTest() { state = freshState(); loaded = true; }
function reloadForTest() { state = freshState(); loaded = false; return load(); }

module.exports = {
  ingestState, observeCandidates, observeDecisions, auditStatus, stats,
  openMessage, closeMessage, normalizeOpen, paperNotificationSuppressed,
  notificationsDisabled, resetForTest, reloadForTest,
};
