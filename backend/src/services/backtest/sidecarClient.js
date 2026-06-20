/**
 * sidecarClient — Node → Python backtest sidecar (kernc/backtesting.py) köprüsü.
 *
 * Sidecar AYRI bir Render servisidir (FastAPI/uvicorn). Strateji/sinyal üretimi
 * Node'da kalır; sidecar yalnızca (OHLCV + sinyaller) alıp backtesting.py ile
 * koşturup perBand kalibrasyon istatistikleri + tearsheet (Sortino/Calmar/SQN/
 * Kelly...) döner. CANLI sinyal yolu sidecar'ı ÇAĞIRMAZ — yalnız günlük backtest
 * cron'u çağırır, sonucu diske yazar, canlı motor cache'ten okur. Böylece sidecar
 * çökse/uyusa bile sinyaller durmaz (son kalibrasyon kullanılır, yoksa JS fallback).
 *
 * Etkinleştirme: process.env.BACKTEST_SERVICE_URL set ise. Yoksa isEnabled()=false
 * ve tüm çağrılar null döner → çağıranlar JS hesabına düşer.
 */

const axios = require('axios');
const logger = require('../../utils/logger');

const BASE_URL = (process.env.BACKTEST_SERVICE_URL || '').replace(/\/+$/, '');
const TIMEOUT_MS = Number(process.env.BACKTEST_SERVICE_TIMEOUT_MS) || 20000;
const BATCH_TIMEOUT_MS = Number(process.env.BACKTEST_SERVICE_BATCH_TIMEOUT_MS) || 120000;
const TOKEN = process.env.BACKTEST_SERVICE_TOKEN || '';

function isEnabled() { return !!BASE_URL; }

function headers() {
  const h = { 'Content-Type': 'application/json' };
  if (TOKEN) h['x-backtest-token'] = TOKEN;
  return h;
}

let _down = false;          // basit devre kesici: art arda hatada bir tur sus
let _downUntil = 0;
function markDown() { _down = true; _downUntil = Date.now() + 60_000; }
function available() {
  if (!isEnabled()) return false;
  if (_down && Date.now() < _downUntil) return false;
  _down = false;
  return true;
}

async function post(pathName, body, timeout) {
  if (!available()) return null;
  try {
    const { data } = await axios.post(`${BASE_URL}${pathName}`, body, { headers: headers(), timeout: timeout || TIMEOUT_MS });
    return data;
  } catch (e) {
    markDown();
    logger.warn(`backtest sidecar ${pathName} hata: ${e.message} → JS fallback`);
    return null;
  }
}

async function health() {
  if (!isEnabled()) return { ok: false, enabled: false };
  try {
    const { data } = await axios.get(`${BASE_URL}/health`, { headers: headers(), timeout: 5000 });
    return { ...data, enabled: true };
  } catch (e) {
    return { ok: false, enabled: true, error: e.message };
  }
}

/**
 * Tek backtest. payload: { symbol, timeframe, ohlcv:[{time,open,high,low,close,volume}],
 * signals:[{index,direction,entry,stop,target,band,atr?}], config:{horizon,...} }
 * → { ok, perBand:{all,high,mid,low,...}, tearsheet, ... } | null
 */
async function backtest(payload) { return post('/backtest', payload, TIMEOUT_MS); }

/** Toplu backtest. items: [payload, ...] → { ok, count, results:[...] } | null */
async function batch(items) { return post('/batch', { items }, BATCH_TIMEOUT_MS); }

/** SL/TP ATR çarpan taraması (yalnız analiz). → OptimizeResponse | null */
async function optimize(payload) { return post('/optimize', payload, BATCH_TIMEOUT_MS); }

module.exports = { isEnabled, available, health, backtest, batch, optimize, BASE_URL };
