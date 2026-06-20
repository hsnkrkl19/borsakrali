"""Golden tests for the backtest runner — deterministic, no network."""

import math

from app.models import BacktestConfig, BacktestRequest, Candle, OptimizeRequest, Signal
from app import runner


def _ramp(n=200, start=100.0, step=0.0, noise=0.0):
    """Build n candles. By default a flat series; step adds a linear drift."""
    candles = []
    price = start
    for i in range(n):
        price = start + step * i
        hi = price + 1.0 + noise
        lo = price - 1.0 - noise
        candles.append(Candle(time=1_700_000_000 + i * 86400, open=price,
                              high=hi, low=lo, close=price, volume=1000))
    return candles


def _long_signal(i, entry, stop, target, band="high", atr=2.0):
    return Signal(index=i, direction="long", entry=entry, stop=stop, target=target, band=band, atr=atr)


def test_forward_outcome_win_loss_open():
    # rising market: a long with tight TP just above should WIN
    candles = _ramp(n=60, start=100.0, step=1.0)  # +1/bar
    sig = _long_signal(10, entry=candles[10].close, stop=candles[10].close - 5,
                       target=candles[10].close + 3)
    res, ret = runner._forward_outcome(sig, candles, horizon=12)
    assert res == "win"
    assert ret > 0

    # falling market: long stop below should LOSS
    down = _ramp(n=60, start=200.0, step=-1.0)
    sig2 = _long_signal(10, entry=down[10].close, stop=down[10].close - 3,
                        target=down[10].close + 50)
    res2, ret2 = runner._forward_outcome(sig2, down, horizon=12)
    assert res2 == "loss"
    assert ret2 < 0

    # neither hit within horizon → open
    flat = _ramp(n=60, start=100.0, step=0.0)
    sig3 = _long_signal(10, entry=100.0, stop=80.0, target=130.0)
    res3, _ = runner._forward_outcome(sig3, flat, horizon=5)
    assert res3 == "open"


def test_sl_priority_on_tie():
    # bar where BOTH stop and target are inside [low, high] → conservative loss
    candles = _ramp(n=30, start=100.0, step=0.0)
    # widen one bar so both levels are touched
    candles[11] = Candle(time=candles[11].time, open=100, high=110, low=90, close=100, volume=1)
    sig = _long_signal(10, entry=100.0, stop=95.0, target=105.0)
    res, _ = runner._forward_outcome(sig, candles, horizon=5)
    assert res == "loss"  # SL checked before TP


def test_profit_factor_and_expectancy_reward_low_winrate():
    # Construct 3 wins of +1% and 2 losses of -1% style via direct band summary.
    outcomes = [("win", 5.0), ("win", 5.0), ("loss", -2.0), ("loss", -2.0), ("loss", -2.0)]
    stat = runner._summarize_band("high", outcomes)
    assert stat.sampleSize == 5
    assert stat.winRate == 40.0                     # sub-50% win rate ...
    assert stat.profitFactor is not None and stat.profitFactor > 1  # ... but profitable
    assert stat.expectancy is not None and stat.expectancy > 0


def test_run_backtest_shape_and_tearsheet():
    candles = _ramp(n=120, start=100.0, step=0.5)
    signals = [_long_signal(i, entry=candles[i].close, stop=candles[i].close - 4,
                            target=candles[i].close + 6, band="high")
               for i in range(30, 90, 10)]
    req = BacktestRequest(symbol="TEST", timeframe="1d", ohlcv=candles, signals=signals,
                          config=BacktestConfig(horizon=12))
    resp = runner.run_backtest(req)
    assert resp.ok
    assert resp.bars == 120
    assert "all" in resp.perBand and "high" in resp.perBand
    assert resp.perBand["all"].sampleSize >= 1
    # backtesting.py tearsheet present with the new ratios
    assert resp.tearsheet is not None
    assert resp.tearsheet.trades >= 1
    # sortino/calmar/sqn are the metrics the Node stack lacked
    for f in ("sharpe", "sortino", "sqn"):
        assert hasattr(resp.tearsheet, f)


def test_run_backtest_insufficient_candles():
    resp = runner.run_backtest(BacktestRequest(symbol="X", timeframe="1d",
                                               ohlcv=_ramp(n=3), signals=[]))
    assert resp.ok is False
    assert resp.error


def test_optimize_picks_a_grid_point():
    candles = _ramp(n=150, start=100.0, step=0.4)
    signals = [_long_signal(i, entry=candles[i].close, stop=candles[i].close - 4,
                            target=candles[i].close + 6, band="high", atr=2.0)
               for i in range(30, 120, 6)]
    req = OptimizeRequest(symbol="TEST", timeframe="1d", ohlcv=candles, signals=signals,
                          objective="expectancy", config=BacktestConfig(horizon=15))
    resp = runner.optimize(req)
    assert resp.ok
    assert len(resp.grid) == len(req.slGrid) * len(req.tpGrid)
    assert resp.current is not None
    # every grid point carries an sl/tp multiplier
    assert all(g.sl in req.slGrid and g.tp in req.tpGrid for g in resp.grid)
