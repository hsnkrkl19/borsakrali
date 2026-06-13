/**
 * Bot Risk Guard — paylaşılan kill-switch + max-drawdown + günlük-zarar devre kesici.
 *
 * Tüm paper bot motorları (BIST tradingBotV2 / Kripto cryptoBotV2 / TEMA34) YENİ
 * pozisyon AÇMADAN önce `shouldHaltEntries()` çağırır:
 *   - Manuel duraklatma (portfolio.tradingEnabled === false)  → halt
 *   - Tepe-noktasından düşüş (drawdown) ≥ maxDrawdownPct       → halt
 *   - Bugünkü gerçekleşen zarar ≥ dailyLossLimitPct            → halt
 * Halt iken: YENİ giriş YOK; ama mevcut pozisyonların yönetimi/çıkışı (tick,
 * stop/target) ETKİLENMEZ — risk yalnızca azaltılır, kilitlenmez.
 *
 * Saf fonksiyon (yan etkisiz) → golden test'li. Paper portföy; gerçek-para yok.
 */

const DEFAULTS = { maxDrawdownPct: 25, dailyLossLimitPct: 10 };

function isFiniteNum(v) { return typeof v === 'number' && Number.isFinite(v); }

// Tüm zamanların tepe öz-sermayesi (equityHistory + güncel equity + capital).
function peakEquity(portfolio) {
  const hist = Array.isArray(portfolio && portfolio.equityHistory) ? portfolio.equityHistory : [];
  const all = hist.map(h => h && h.equity).filter(isFiniteNum);
  if (isFiniteNum(portfolio && portfolio.equity)) all.push(portfolio.equity);
  if (isFiniteNum(portfolio && portfolio.capital)) all.push(portfolio.capital);
  return all.length ? Math.max(...all) : null;
}

// Tepe-noktasından güncel düşüş yüzdesi (0..100).
function drawdownPct(portfolio) {
  const peak = peakEquity(portfolio);
  if (!(peak > 0)) return 0;
  const cur = isFiniteNum(portfolio && portfolio.equity) ? portfolio.equity : peak;
  return Math.max(0, ((peak - cur) / peak) * 100);
}

// Bugün (YYYY-MM-DD) kapanan işlemlerin net realizedPnL toplamı.
// exitDate ISO ('2026-06-13T..') veya tarih-anahtarı ('2026-06-13') olabilir → slice(0,10).
function sumTodayRealizedPnL(trades, todayKey) {
  if (!Array.isArray(trades)) return 0;
  return trades.reduce((sum, t) => {
    const d = String((t && (t.exitDate || t.exitAt || t.recordedAt)) || '').slice(0, 10);
    return d === todayKey ? sum + (Number(t && t.realizedPnL) || 0) : sum;
  }, 0);
}

/**
 * @param {object} portfolio { tradingEnabled?, haltReason?, equity, capital, equityHistory }
 * @param {object} config { maxDrawdownPct, dailyLossLimitPct }
 * @param {number|null} todayRealizedPnL bugün kapanan işlemlerin net P&L toplamı (ops.)
 * @returns {{halt:boolean, reason:string|null, drawdownPct:number, dailyLossPct:number|null}}
 */
function shouldHaltEntries(portfolio, config = {}, todayRealizedPnL = null) {
  const maxDD = config.maxDrawdownPct != null ? config.maxDrawdownPct : DEFAULTS.maxDrawdownPct;
  const maxDaily = config.dailyLossLimitPct != null ? config.dailyLossLimitPct : DEFAULTS.dailyLossLimitPct;
  const dd = +drawdownPct(portfolio).toFixed(2);

  if (portfolio && portfolio.tradingEnabled === false) {
    return { halt: true, reason: portfolio.haltReason || 'manual_pause', drawdownPct: dd, dailyLossPct: null };
  }
  if (dd >= maxDD) {
    return { halt: true, reason: `max_drawdown ${dd}% >= ${maxDD}%`, drawdownPct: dd, dailyLossPct: null };
  }
  let dailyLossPct = null;
  const cap = portfolio && portfolio.capital;
  if (todayRealizedPnL != null && isFiniteNum(cap) && cap > 0) {
    dailyLossPct = +(((-todayRealizedPnL) / cap) * 100).toFixed(2); // zarar pozitif
    if (dailyLossPct >= maxDaily) {
      return { halt: true, reason: `daily_loss ${dailyLossPct}% >= ${maxDaily}%`, drawdownPct: dd, dailyLossPct };
    }
  }
  return { halt: false, reason: null, drawdownPct: dd, dailyLossPct };
}

module.exports = { shouldHaltEntries, drawdownPct, peakEquity, sumTodayRealizedPnL, DEFAULTS };
