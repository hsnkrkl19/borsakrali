"""runner — turns (OHLCV + signal series) into calibration stats + a
backtesting.py portfolio tearsheet.

Design notes
------------
* No look-ahead: a signal at bar `i` is filled at bar `i`'s close (Node already
  decided it from candles[0..i]); SL/TP are only checked on bars AFTER `i`.
* perBand uses PER-SIGNAL INDEPENDENT forward evaluation (overlapping allowed),
  mirroring the Node `forexBacktest.evalForward` semantics EXACTLY:
    - walk forward up to `horizon` bars,
    - SL checked before TP on each bar (ties → conservative loss),
    - unresolved → 'open', returns mark-to-last-close.
  This preserves sample size (vital — calibration is disabled below 8 closed
  samples) and yields expectancy + profit factor, which fix the win-rate-only
  bias that punishes profitable low-win-rate (wide-stop / high-R/R) setups.
* tearsheet uses the REAL backtesting.py engine (single position, exclusive
  bracket orders, commission, optional time-stop) for the ~30 risk ratios the
  Node stack lacks (Sortino/Calmar/SQN/Kelly/Volatility/Exposure/...).
"""

from __future__ import annotations

import math
from typing import Dict, List, Optional

import numpy as np
import pandas as pd
from backtesting import Backtest, Strategy

from .models import (
    BacktestConfig,
    BacktestRequest,
    BacktestResponse,
    Candle,
    OptimizeRequest,
    OptimizeResponse,
    OptimizeResult,
    PerBandStat,
    Signal,
    Tearsheet,
)

BANDS = ("high", "mid", "low")
DEFAULT_HORIZON = 12


# ───────────────────────── helpers ─────────────────────────

def _finite(x) -> Optional[float]:
    """Coerce numpy/pandas scalars to a JSON-safe float or None (NaN/inf → None)."""
    try:
        if x is None:
            return None
        v = float(x)
        return v if math.isfinite(v) else None
    except (TypeError, ValueError):
        return None


def candles_to_df(candles: List[Candle]) -> pd.DataFrame:
    """Build a backtesting.py-ready DataFrame (OHLCV + unique sorted DatetimeIndex)."""
    rows = {
        "Open": [c.open for c in candles],
        "High": [c.high for c in candles],
        "Low": [c.low for c in candles],
        "Close": [c.close for c in candles],
        "Volume": [c.volume for c in candles],
    }
    idx = pd.to_datetime([c.time for c in candles], unit="s", utc=True)
    df = pd.DataFrame(rows, index=idx)
    # backtesting.py needs a strictly increasing unique index
    df = df[~df.index.duplicated(keep="last")].sort_index()
    return df


def _forward_outcome(sig: Signal, candles: List[Candle], horizon: int):
    """Per-signal forward eval — returns (result, return_pct).

    result ∈ {'win','loss','open'}. Mirrors Node forexBacktest.evalForward:
    SL has priority over TP on the same bar (conservative).
    """
    is_long = sig.direction == "long"
    entry = sig.entry
    if not entry:
        return None
    end = min(len(candles), sig.index + 1 + horizon)
    for j in range(sig.index + 1, end):
        c = candles[j]
        sl_hit = c.low <= sig.stop if is_long else c.high >= sig.stop
        tp_hit = c.high >= sig.target if is_long else c.low <= sig.target
        if sl_hit:
            r = (sig.stop - entry) if is_long else (entry - sig.stop)
            return ("loss", r / entry * 100.0)
        if tp_hit:
            r = (sig.target - entry) if is_long else (entry - sig.target)
            return ("win", r / entry * 100.0)
    # unresolved within horizon → mark to last bar in the window
    last_idx = end - 1
    if last_idx <= sig.index:
        return ("open", 0.0)
    last = candles[last_idx]
    r = (last.close - entry) if is_long else (entry - last.close)
    return ("open", r / entry * 100.0)


def _summarize_band(band: str, outcomes: List) -> PerBandStat:
    """outcomes: list of (result, ret) for one band."""
    wins = [r for (res, r) in outcomes if res == "win"]
    losses = [r for (res, r) in outcomes if res == "loss"]
    opens = [r for (res, r) in outcomes if res == "open"]
    closed = len(wins) + len(losses)
    all_ret = wins + losses + opens
    gross_win = sum(wins)
    gross_loss = abs(sum(losses))
    if gross_loss > 0:
        pf = gross_win / gross_loss
    elif gross_win > 0 and len(losses) == 0:
        pf = float("inf")          # gerçekten kayıpsız → mükemmel PF
    else:
        pf = None                  # kayıp var ama %0 getirili (stop==entry) → belirsiz, 999 deme
    return PerBandStat(
        band=band,
        sampleSize=closed,
        win=len(wins),
        loss=len(losses),
        open=len(opens),
        grossWin=round(gross_win, 4),
        grossLoss=round(gross_loss, 4),
        winRate=round(len(wins) / closed * 100, 1) if closed else None,
        avgReturn=round(sum(all_ret) / len(all_ret), 2) if all_ret else None,
        expectancy=round((gross_win - gross_loss) / closed, 3) if closed else None,
        profitFactor=(round(pf, 3) if (pf is not None and math.isfinite(pf)) else
                      (999.0 if pf == float("inf") else None)),
    )


def per_band_stats(candles: List[Candle], signals: List[Signal], horizon: int) -> Dict[str, PerBandStat]:
    """Bucket per-signal outcomes by `signal.band` (arbitrary labels supported —
    forex uses high/mid/low; BIST uses fine confidence buckets like b75/b80).
    Canonical high/mid/low + 'all' are always present for back-compat."""
    by_band: Dict[str, List] = {}
    all_outcomes: List = []
    for sig in signals:
        oc = _forward_outcome(sig, candles, horizon)
        if oc is None:
            continue
        all_outcomes.append(oc)
        by_band.setdefault(sig.band or "all", []).append(oc)
    out = {b: _summarize_band(b, ocs) for b, ocs in by_band.items()}
    out["all"] = _summarize_band("all", all_outcomes)
    for b in BANDS:                       # forex always expects these keys
        out.setdefault(b, _summarize_band(b, []))
    return out


# ───────────────────────── backtesting.py tearsheet ─────────────────────────

def _make_strategy(signal_by_bar: Dict[int, Signal], horizon: int):
    """A backtesting.py Strategy that opens a bracket trade on each signal bar
    and force-closes it after `horizon` bars (time-stop)."""

    class _SignalReplay(Strategy):
        def init(self):
            self._entry_bar = None

        def next(self):
            i = len(self.data.Close) - 1
            # time-stop on the open position
            if self.position and self._entry_bar is not None and (i - self._entry_bar) >= horizon:
                self.position.close()
                self._entry_bar = None
                return
            if self.position:
                return
            sig = signal_by_bar.get(i)
            if sig is None:
                return
            price = float(self.data.Close[-1])
            # guard: backtesting.py rejects malformed brackets
            if sig.direction == "long":
                if not (sig.stop < price < sig.target):
                    return
                self.buy(sl=sig.stop, tp=sig.target, tag=sig.band)
            else:
                if not (sig.target < price < sig.stop):
                    return
                self.sell(sl=sig.stop, tp=sig.target, tag=sig.band)
            self._entry_bar = i

    return _SignalReplay


def portfolio_tearsheet(candles: List[Candle], signals: List[Signal], cfg: BacktestConfig) -> Optional[Tearsheet]:
    df = candles_to_df(candles)
    if df.empty or len(df) < 3:
        return None
    # signal.index, ORİJİNAL candles dizinine göredir. candles_to_df dup/sıralama
    # yüzünden satır düşürür/yeniden sıralarsa df-konumu ≠ candle-dizini olur →
    # tearsheet sinyali yanlış bara bağlar. Hizalama bozulduysa tearsheet'i atla
    # (perBand ham candles'ı indekslediğinden ETKİLENMEZ).
    if len(df) != len(candles):
        return None
    horizon = cfg.horizon or DEFAULT_HORIZON
    signal_by_bar = {s.index: s for s in signals if 0 <= s.index < len(df)}
    strat = _make_strategy(signal_by_bar, horizon)
    try:
        bt = Backtest(
            df,
            strat,
            cash=cfg.cash,
            commission=cfg.commission,
            trade_on_close=cfg.tradeOnClose,
            exclusive_orders=cfg.exclusiveOrders,
            finalize_trades=True,
        )
        s = bt.run()
    except Exception:
        return None

    def g(key):
        return _finite(s.get(key))

    return Tearsheet(
        trades=int(s.get("# Trades", 0) or 0),
        returnPct=g("Return [%]"),
        buyHoldReturnPct=g("Buy & Hold Return [%]"),
        cagrPct=g("CAGR [%]"),
        volatilityAnnPct=g("Volatility (Ann.) [%]"),
        sharpe=g("Sharpe Ratio"),
        sortino=g("Sortino Ratio"),
        calmar=g("Calmar Ratio"),
        maxDrawdownPct=g("Max. Drawdown [%]"),
        avgDrawdownPct=g("Avg. Drawdown [%]"),
        winRate=g("Win Rate [%]"),
        profitFactor=g("Profit Factor"),
        expectancyPct=g("Expectancy [%]"),
        sqn=g("SQN"),
        kelly=g("Kelly Criterion"),
        exposureTimePct=g("Exposure Time [%]"),
        bestTradePct=g("Best Trade [%]"),
        worstTradePct=g("Worst Trade [%]"),
        avgTradePct=g("Avg. Trade [%]"),
    )


# ───────────────────────── public entrypoints ─────────────────────────

def run_backtest(req: BacktestRequest) -> BacktestResponse:
    candles = req.ohlcv
    if not candles or len(candles) < 5:
        return BacktestResponse(ok=False, symbol=req.symbol, timeframe=req.timeframe,
                                error="insufficient candles")
    horizon = req.config.horizon or DEFAULT_HORIZON
    # only signals whose forward window exists are useful, but keep all for perBand 'open'
    sigs = [s for s in req.signals if 0 <= s.index < len(candles)]
    per_band = per_band_stats(candles, sigs, horizon)
    tearsheet = portfolio_tearsheet(candles, sigs, req.config)
    return BacktestResponse(
        ok=True,
        symbol=req.symbol,
        timeframe=req.timeframe,
        bars=len(candles),
        signals=len(sigs),
        perBand=per_band,
        tearsheet=tearsheet,
    )


def _objective_value(objective: str, stat: PerBandStat, tearsheet: Optional[Tearsheet]) -> Optional[float]:
    if objective == "winRate":
        return stat.winRate
    if objective == "profitFactor":
        return stat.profitFactor
    if objective == "expectancy":
        return stat.expectancy
    if tearsheet is None:
        return None
    if objective == "sqn":
        return tearsheet.sqn
    if objective == "sharpe":
        return tearsheet.sharpe
    if objective == "returnPct":
        return tearsheet.returnPct
    return stat.expectancy


def _relevel(signals: List[Signal], slm: float, tpm: float) -> List[Signal]:
    out = []
    for s in signals:
        if not s.atr or not s.entry:
            continue
        if s.direction == "long":
            stop = s.entry - slm * s.atr
            target = s.entry + tpm * s.atr
        else:
            stop = s.entry + slm * s.atr
            target = s.entry - tpm * s.atr
        out.append(Signal(index=s.index, direction=s.direction, entry=s.entry,
                          stop=stop, target=target, band=s.band, atr=s.atr))
    return out


def optimize(req: OptimizeRequest) -> OptimizeResponse:
    candles = req.ohlcv
    sigs = [s for s in req.signals if 0 <= s.index < len(candles) and s.atr]
    if not candles or not sigs:
        return OptimizeResponse(ok=False, symbol=req.symbol, timeframe=req.timeframe,
                                objective=req.objective, error="no candles or atr-bearing signals")
    horizon = req.config.horizon or DEFAULT_HORIZON
    needs_tearsheet = req.objective in ("sqn", "sharpe", "returnPct")

    grid: List[OptimizeResult] = []
    best: Optional[OptimizeResult] = None
    for slm in req.slGrid:
        for tpm in req.tpGrid:
            releveled = _relevel(sigs, slm, tpm)
            bands = per_band_stats(candles, releveled, horizon)
            stat = bands["all"]
            tear = portfolio_tearsheet(candles, releveled, req.config) if needs_tearsheet else None
            val = _objective_value(req.objective, stat, tear)
            res = OptimizeResult(
                sl=slm, tp=tpm, objective=req.objective, value=_finite(val),
                winRate=stat.winRate, expectancy=stat.expectancy,
                profitFactor=stat.profitFactor, sampleSize=stat.sampleSize,
            )
            grid.append(res)
            if res.value is not None and stat.sampleSize >= 8:
                if best is None or res.value > (best.value if best.value is not None else -1e9):
                    best = res

    # current = stats with the signals as-passed (existing live levels)
    cur_bands = per_band_stats(candles, sigs, horizon)
    cur_stat = cur_bands["all"]
    cur_tear = portfolio_tearsheet(candles, sigs, req.config) if needs_tearsheet else None
    current = OptimizeResult(
        sl=0.0, tp=0.0, objective=req.objective,
        value=_finite(_objective_value(req.objective, cur_stat, cur_tear)),
        winRate=cur_stat.winRate, expectancy=cur_stat.expectancy,
        profitFactor=cur_stat.profitFactor, sampleSize=cur_stat.sampleSize,
    )
    return OptimizeResponse(
        ok=True, symbol=req.symbol, timeframe=req.timeframe, objective=req.objective,
        best=best, current=current, grid=grid,
    )
