/**
 * botClient — Node → "Altın Botu" (Python/FastAPI, MT5) köprüsü.
 *
 * Bot AYRI bir makinede (Windows + MT5) çalışır; kendini bir cloudflared tüneliyle
 * dışarı açar. Bu istemci, backtest sidecar'ının (sidecarClient.js) aynısı desende
 * bota HTTP proxy yapar. Tarayıcı asla doğrudan bota konuşmaz — yalnızca same-origin
 * /api/bot/* çağırır, Node buradan bota gider. Bot yalnızca TEK çağıranı (bu backend)
 * Yerel/VPS bakımı için X-Auth-Token kullanabilir. BorsaKrali panelinden gelen
 * isteklerde ise backend'in doğruladığı admin Bearer oturumu bota aktarılır;
 * bot aynı oturumu site üzerinden ikinci kez doğrular.
 *
 * BOT_API_URL verilmezse yalnızca bu proje için ayrılmış HTTPS tüneli kullanılır.
 */

const axios = require('axios');
const logger = require('../utils/logger');

const BASE_URL = (process.env.BOT_API_URL || 'https://botapi.borsakrali.com').replace(/\/+$/, '');
const TOKEN = process.env.BOT_API_TOKEN || '';
const TIMEOUT_MS = Number(process.env.BOT_API_TIMEOUT_MS) || 12000;

function configurationError() {
  if (!BASE_URL) return 'BOT_API_URL yapılandırılmadı';
  try {
    const url = new URL(BASE_URL);
    const loopback = ['127.0.0.1', 'localhost', '::1'].includes(url.hostname);
    if (url.protocol !== 'https:' && !loopback) {
      return 'BOT_API_URL yalnızca HTTPS veya yerel geliştirme adresi olabilir';
    }
  } catch (_) {
    return 'BOT_API_URL geçersiz';
  }
  return '';
}

function isEnabled() { return !configurationError(); }

function headers(authorization) {
  const result = {
    'Content-Type': 'application/json',
  };
  if (TOKEN) result['X-Auth-Token'] = TOKEN;
  if (authorization && /^Bearer\s+\S+$/i.test(authorization)) {
    result.Authorization = authorization;
  }
  return result;
}

// Basit devre kesici: art arda hatada bir tur sus (backend'i yormamak için).
let _down = false;
let _downUntil = 0;
function markDown() { _down = true; _downUntil = Date.now() + 30_000; }
function available() {
  if (!isEnabled()) return false;
  if (_down && Date.now() < _downUntil) return false;
  _down = false;
  return true;
}

async function get(pathName, params, authorization) {
  if (!isEnabled()) { const e = new Error(configurationError()); e.code = 'DISABLED'; throw e; }
  try {
    const { data } = await axios.get(`${BASE_URL}${pathName}`, {
      headers: headers(authorization), params: params || undefined, timeout: TIMEOUT_MS,
    });
    return data;
  } catch (e) {
    if (!e.response || Number(e.response.status) >= 500) markDown();
    logger.warn(`bot ${pathName} GET hata: ${e.message}`);
    throw e;
  }
}

async function post(pathName, body, authorization) {
  if (!isEnabled()) { const e = new Error(configurationError()); e.code = 'DISABLED'; throw e; }
  try {
    const { data } = await axios.post(`${BASE_URL}${pathName}`, body || {}, {
      headers: headers(authorization), timeout: TIMEOUT_MS,
    });
    return data;
  } catch (e) {
    if (!e.response || Number(e.response.status) >= 500) markDown();
    logger.warn(`bot ${pathName} POST hata: ${e.message}`);
    throw e;
  }
}

module.exports = { isEnabled, available, configurationError, get, post, BASE_URL };
