'use strict';

const fs = require('fs');
const path = require('path');

const catalog = require('./catalog');
const botPersistence = require('../botPersistence');

const DATA_DIR = process.env.BOT_CENTER_DATA_DIR
  || path.join(__dirname, '..', '..', 'data', 'bot-center');
const STATE_FILE = path.join(DATA_DIR, 'registry.json');

let state = { version: 1, overrides: {} };

function cleanState(input) {
  const overrides = {};
  const raw = input && typeof input === 'object' ? input.overrides : null;
  if (raw && typeof raw === 'object') {
    for (const entry of catalog) {
      const saved = raw[entry.id];
      if (!saved || typeof saved.enabled !== 'boolean') continue;
      overrides[entry.id] = {
        enabled: saved.enabled,
        updatedAt: String(saved.updatedAt || ''),
        updatedBy: String(saved.updatedBy || ''),
      };
    }
  }
  return { version: 1, overrides };
}

function readState() {
  try {
    if (!fs.existsSync(STATE_FILE)) return { version: 1, overrides: {} };
    return cleanState(JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')));
  } catch (error) {
    console.error('[BotCenter] ayar dosyası okunamadı:', error.message);
    return { version: 1, overrides: {} };
  }
}

function envEnabled(entry) {
  const current = process.env[entry.disableEnv];
  if (entry.enabledValue != null) {
    if (current == null || current === '') return entry.defaultEnabled !== false;
    return String(current) === String(entry.enabledValue);
  }
  if (current == null || current === '') return entry.defaultEnabled !== false;
  return String(current) !== String(entry.disabledValue || '1');
}

function applyEntry(entry, enabled) {
  process.env[entry.disableEnv] = enabled
    ? String(entry.enabledValue != null ? entry.enabledValue : '0')
    : String(entry.disabledValue || '1');
}

function reload() {
  state = readState();
  for (const entry of catalog) {
    const saved = state.overrides[entry.id];
    if (saved && typeof saved.enabled === 'boolean') applyEntry(entry, saved.enabled);
  }
  return summary();
}

function persist() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const temp = `${STATE_FILE}.tmp`;
  fs.writeFileSync(temp, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
  fs.renameSync(temp, STATE_FILE);
  try { botPersistence.save('bot-center', 'registry.json', state); } catch (_) {}
}

function publicEntry(entry) {
  const saved = state.overrides[entry.id];
  const enabled = saved ? saved.enabled : envEnabled(entry);
  const configuredChannels = entry.channelEnvs.filter((key) => Boolean(process.env[key]));
  const tokenConfigured = Boolean(process.env.TELEGRAM_BOT_TOKEN);
  const channelConfigured = configuredChannels.length > 0;
  return {
    id: entry.id,
    name: entry.name,
    category: entry.category,
    description: entry.description,
    schedule: entry.schedule,
    enabled,
    ready: enabled && tokenConfigured && channelConfigured,
    token_configured: tokenConfigured,
    channel_configured: channelConfigured,
    configured_channel_keys: configuredChannels,
    source: saved ? 'panel' : 'environment',
    updated_at: saved?.updatedAt || null,
    updated_by: saved?.updatedBy || null,
  };
}

function summary() {
  const bots = catalog.map(publicEntry);
  return {
    ok: true,
    telegram: {
      username: process.env.TELEGRAM_BOT_USERNAME || 'Borsa_krali_aibot',
      token_configured: Boolean(process.env.TELEGRAM_BOT_TOKEN),
    },
    total: bots.length,
    enabled: bots.filter((bot) => bot.enabled).length,
    ready: bots.filter((bot) => bot.ready).length,
    bots,
  };
}

function setEnabled(id, enabled, actor = '') {
  const entry = catalog.find((item) => item.id === id);
  if (!entry) {
    const error = new Error(`Bilinmeyen bildirim botu: ${id}`);
    error.code = 'NOT_FOUND';
    throw error;
  }
  if (typeof enabled !== 'boolean') {
    const error = new Error('enabled alanı true veya false olmalıdır');
    error.code = 'BAD_REQUEST';
    throw error;
  }
  const updatedAt = new Date().toISOString();
  state.overrides[id] = {
    enabled,
    updatedAt,
    updatedBy: String(actor || 'admin'),
  };
  applyEntry(entry, enabled);
  persist();
  return publicEntry(entry);
}

reload();

module.exports = {
  summary,
  setEnabled,
  reload,
  STATE_FILE,
};
