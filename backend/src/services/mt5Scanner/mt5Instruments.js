/**
 * MT5 Gün-içi Tarayıcı — Enstrümanlar (kullanıcı listesi, 2026-07-02)
 *
 * 9 enstrüman, hepsi forex/CFD fiyatı: kripto top (BTC/ETH/XRP/SOL) + Altın +
 * Gümüş (USD) + EUR/USD + Nasdaq100 + S&P500. Yahoo sembolleri forex evreniyle
 * aynı (GC=F/SI=F/NQ=F/ES=F — sürekli işlem gören vadeliler; broker fiyat
 * beslemesi varsa o kullanılır, bkz. brokerPrices).
 *
 * ⚠️ contractSize / volumeMin / volumeStep / volumeMax BROKER GERÇEĞİ:
 * canlı FTMO MT5 terminalinden symbol_info ile okundu (2026-07-02):
 *   BTCUSD 1 · ETHUSD 10 · XRPUSD 10000 · SOLUSD 100 · XAUUSD 100 ·
 *   XAGUSD 5000 · US100.cash 1 · US500.cash 1 · EURUSD 100000
 * (forexInstruments'taki kripto contractSize=1 değerleri bu broker için YANLIŞTI —
 * lot hesabı MT5'te elle işlem açan kullanıcı için birebir olmalı.)
 * Farklı broker için env MT5_CONTRACT_SIZES='{"ETHUSD":1,...}' ile override edilir.
 */

const { getInstrument: forexGet } = require('../forex/forexInstruments');

// Broker (FTMO) sözleşme özellikleri — MT5 symbol_info doğrulu
const BROKER_SPECS = {
  BTCUSD: { contractSize: 1,      volumeMin: 0.01, volumeStep: 0.01, volumeMax: 5 },
  ETHUSD: { contractSize: 10,     volumeMin: 0.01, volumeStep: 0.01, volumeMax: 5 },
  XRPUSD: { contractSize: 10000,  volumeMin: 0.01, volumeStep: 0.01, volumeMax: 5 },
  SOLUSD: { contractSize: 100,    volumeMin: 0.01, volumeStep: 0.01, volumeMax: 5 },
  XAUUSD: { contractSize: 100,    volumeMin: 0.01, volumeStep: 0.01, volumeMax: 100 },
  XAGUSD: { contractSize: 5000,   volumeMin: 0.01, volumeStep: 0.01, volumeMax: 100 },
  NAS100: { contractSize: 1,      volumeMin: 0.01, volumeStep: 0.01, volumeMax: 1000 },
  SPX500: { contractSize: 1,      volumeMin: 0.01, volumeStep: 0.01, volumeMax: 1000 },
  EURUSD: { contractSize: 100000, volumeMin: 0.01, volumeStep: 0.01, volumeMax: 50 },
};

// Kullanıcının istediği 9 enstrüman (sıra: kripto → metal → fx → endeks)
const IDS = ['BTCUSD', 'ETHUSD', 'XRPUSD', 'SOLUSD', 'XAUUSD', 'XAGUSD', 'EURUSD', 'NAS100', 'SPX500'];

function envOverrides() {
  try { return JSON.parse(process.env.MT5_CONTRACT_SIZES || '{}'); } catch (_) { return {}; }
}

const INSTRUMENTS = IDS.map((id) => {
  const base = forexGet(id);
  if (!base) throw new Error(`mt5Instruments: forex evreninde eksik enstrüman ${id}`);
  const spec = BROKER_SPECS[id] || {};
  const ov = envOverrides();
  return {
    ...base,
    contractSize: Number(ov[id]) > 0 ? Number(ov[id]) : (spec.contractSize || base.contractSize || 1),
    volumeMin: spec.volumeMin ?? 0.01,
    volumeStep: spec.volumeStep ?? 0.01,
    volumeMax: spec.volumeMax ?? 100,
  };
});

const BY_ID = new Map(INSTRUMENTS.map((i) => [i.id, i]));

function getInstrument(id) { return BY_ID.get((id || '').toUpperCase()) || null; }
function listInstruments() { return INSTRUMENTS.map((i) => ({ ...i })); }

module.exports = { INSTRUMENTS, getInstrument, listInstruments, IDS };
