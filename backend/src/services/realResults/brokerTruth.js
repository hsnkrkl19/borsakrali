'use strict';

/**
 * Broker gerçeği — merkez beynin her turda gönderdiği hesap anlık görüntüsü.
 *
 * 2026-07-31 olayı: Telegram raporu 18 işlem / −74,51 $ derken gerçek hesap
 * 60+ işlem / −3.234,88 $ gösterdi ve bu fark GÜNLERCE fark edilmeyebilirdi.
 * Kayıt hattındaki her delik kapatılsa bile, defterin brokerla uyuştuğunu
 * BAĞIMSIZ bir kaynaktan doğrulamak gerekir.
 *
 * Beyin `_snapshot()` içinde brokerdan okunan `realizedToday` (bugünün
 * gerçekleşen net P/L'i, komisyon+swap dahil) alanını zaten yolluyor. Burada
 * son anlık görüntü tutulur; günlük rapor kendi defter toplamını bununla
 * karşılaştırır ve fark varsa açıkça yazar.
 *
 * Bellekte tutulur (kalıcı değil): beyin 2 saniyede bir gönderdiği için
 * yeniden başlatmadan sonra saniyeler içinde tazelenir; kalıcılık gereksiz
 * karmaşıklık olurdu.
 */

let latest = null;

function finite(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Köprünün gönderdiği snapshot'ı kaydet. Geçersizse sessizce yok say. */
function note(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') return null;
  const realized = finite(snapshot.realizedToday);
  if (realized === null) return null;
  latest = {
    realizedToday: realized,
    floatingPnl: finite(snapshot.floatingPnl),
    balance: finite(snapshot.balance),
    equity: finite(snapshot.equity),
    openPositions: finite(snapshot.openPositions),
    account: finite(snapshot.login),
    server: typeof snapshot.server === 'string' ? snapshot.server : '',
    dryRun: snapshot.dryRun === true,
    atMs: Date.now(),
    brokerTimeSec: finite(snapshot.timeSec),
  };
  return latest;
}

/** En son anlık görüntü; `maxAgeMs` içinde tazelenmemişse null. */
function current(maxAgeMs = 15 * 60 * 1000) {
  if (!latest) return null;
  // >= : yas tam tavana esitse de BAYAT sayilir (0 = her zaman bayat).
  if (Date.now() - latest.atMs >= maxAgeMs) return null;
  return { ...latest };
}

/**
 * Defter toplamını broker gerçeğiyle karşılaştır.
 * @param {number} ledgerNet defterdeki bugünkü net (USD)
 * @returns {{ok:boolean, reason?:string, brokerNet?:number, ledgerNet?:number, diff?:number}}
 */
function reconcile(ledgerNet, opts = {}) {
  const snap = current(opts.maxAgeMs);
  if (!snap) return { ok: false, reason: 'broker-anlik-goruntusu-yok' };
  const ledger = Number(ledgerNet) || 0;
  const broker = snap.realizedToday;
  const diff = Math.round((ledger - broker) * 100) / 100;
  // Eşik: küçük yuvarlama/zamanlama farkı uyarı üretmesin.
  const tolerance = Math.max(1, Number(opts.toleranceUsd) || 1);
  return {
    ok: Math.abs(diff) <= tolerance,
    brokerNet: broker,
    ledgerNet: Math.round(ledger * 100) / 100,
    diff,
    account: snap.account,
    server: snap.server,
    ageSec: Math.round((Date.now() - snap.atMs) / 1000),
  };
}

function resetForTest() { latest = null; }

module.exports = { note, current, reconcile, resetForTest };
