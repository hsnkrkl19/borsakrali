'use strict';

/**
 * LOT SINIRLARI — tek kaynak (2026-07-24, kullanıcı talebi).
 *
 * "tüm botların lot sayısını 0.01 ile 0.15 arasına getir. sadece bot 37 konsensüs
 *  değerlendirme sonuçlarında birden çok botun ortak karar aldığı işlemlere 0.20
 *  lot açsın sadece."
 *
 * Bu dosya mt5-bridge/trade_guard.py içindeki LOT_HARD_MIN/LOT_HARD_MAX/
 * CONSENSUS_LOT ile AYNI değerleri taşır — ikisi birlikte güncellenmelidir.
 * (Python tarafı gerçek emri açar; buradaki değerler kullanıcıya gösterilen
 * lotun ve köprüye giden feed'in aynı sayıyı söylemesini sağlar.)
 *
 * Neden iki yerde: gün-içi tarayıcı zincirinde lot OTORİTESİ backend'dir
 * (mt5Scanner.routes.js /positions çıktısındaki `lots` köprüce aynen kullanılır);
 * 39-bot yarışma zincirinde ise lot'u Python hesaplar. Tek taraf sınırlanırsa
 * ya mesajdaki lot ile açılan lot ayrışır ya da sınır hiç uygulanmaz.
 */

const LOT_HARD_MIN = 0.01;
const LOT_HARD_MAX = 0.15;

// Bot 37 — Konsensüs Radarı. TANIMI GEREĞİ yalnız ≥CONSENSUS_MIN (vars. 3)
// FARKLI bot aynı sembol+yönde pozisyondayken sinyal üretir (botConsensus/
// index.js findConsensus) → bu istisna doğrudan "birden çok botun ortak karar
// aldığı işlemler"e karşılık gelir, ayrı bir koşula gerek yoktur.
const CONSENSUS_BOT_ID = 'consensus-radar';
const CONSENSUS_LOT = 0.20;

/** Bu bot için azami lot. */
function lotCapFor(botId) {
  return botId === CONSENSUS_BOT_ID ? CONSENSUS_LOT : LOT_HARD_MAX;
}

/** Lot'u [min, cap] aralığına kırpar (aşağı; risk asla artmaz). */
function clampLot(lots, botId) {
  const n = Number(lots);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return +Math.min(Math.max(n, LOT_HARD_MIN), lotCapFor(botId)).toFixed(2);
}

module.exports = {
  LOT_HARD_MIN,
  LOT_HARD_MAX,
  CONSENSUS_LOT,
  CONSENSUS_BOT_ID,
  lotCapFor,
  clampLot,
};
