"""Technical indicators implemented with pandas/numpy only (no TA-Lib).

Conventions:
- EMA uses pandas ewm(span=period, adjust=False).
- RSI, ATR and ADX use Wilder smoothing: ewm(alpha=1/period, adjust=False).
- All functions expect pandas Series of CLOSED bars (callers must drop the
  forming bar before computing) and return pandas Series aligned to input.
"""
from __future__ import annotations

import numpy as np
import pandas as pd


def ema(series: pd.Series, period: int) -> pd.Series:
    """Exponential moving average."""
    return series.ewm(span=int(period), adjust=False).mean()


def sma(series: pd.Series, period: int) -> pd.Series:
    """Simple moving average."""
    return series.rolling(int(period), min_periods=int(period)).mean()


def rolling_std(series: pd.Series, period: int) -> pd.Series:
    """Rolling standard deviation."""
    return series.rolling(int(period), min_periods=int(period)).std(ddof=0)


def rsi(close: pd.Series, period: int = 14) -> pd.Series:
    """Relative Strength Index with Wilder smoothing (0..100)."""
    period = int(period)
    delta = close.diff()
    gain = delta.clip(lower=0.0).fillna(0.0)
    loss = (-delta).clip(lower=0.0).fillna(0.0)
    avg_gain = gain.ewm(alpha=1.0 / period, adjust=False).mean()
    avg_loss = loss.ewm(alpha=1.0 / period, adjust=False).mean()
    # Avoid division by zero: where avg_loss == 0 the market had no down
    # moves in the smoothed window -> RSI 100 (or neutral 50 if flat).
    rs = avg_gain / avg_loss.replace(0.0, np.nan)
    out = 100.0 - (100.0 / (1.0 + rs))
    zero_loss = avg_loss == 0.0
    out = out.mask(zero_loss & (avg_gain > 0.0), 100.0)
    out = out.mask(zero_loss & (avg_gain == 0.0), 50.0)
    return out


def true_range(high: pd.Series, low: pd.Series, close: pd.Series) -> pd.Series:
    """True Range: max(high-low, |high-prev_close|, |low-prev_close|)."""
    prev_close = close.shift(1)
    ranges = pd.concat(
        [high - low, (high - prev_close).abs(), (low - prev_close).abs()],
        axis=1,
    )
    # max(skipna=True): first bar falls back to high-low (prev_close is NaN)
    return ranges.max(axis=1)


def atr(high: pd.Series, low: pd.Series, close: pd.Series, period: int = 14) -> pd.Series:
    """Average True Range with Wilder smoothing."""
    period = int(period)
    return true_range(high, low, close).ewm(alpha=1.0 / period, adjust=False).mean()


def donchian_high(high: pd.Series, period: int) -> pd.Series:
    """Highest high over the previous `period` closed bars, excluding current bar."""
    return high.shift(1).rolling(int(period), min_periods=int(period)).max()


def donchian_low(low: pd.Series, period: int) -> pd.Series:
    """Lowest low over the previous `period` closed bars, excluding current bar."""
    return low.shift(1).rolling(int(period), min_periods=int(period)).min()


def adx(high: pd.Series, low: pd.Series, close: pd.Series, period: int = 14) -> pd.Series:
    """Average Directional Index with Wilder smoothing (0..100)."""
    period = int(period)
    up_move = high.diff()
    down_move = -low.diff()
    # NaN comparisons evaluate False -> first bar contributes 0 movement.
    plus_dm = pd.Series(
        np.where((up_move > down_move) & (up_move > 0.0), up_move, 0.0),
        index=high.index,
    )
    minus_dm = pd.Series(
        np.where((down_move > up_move) & (down_move > 0.0), down_move, 0.0),
        index=high.index,
    )
    alpha = 1.0 / period
    atr_smooth = true_range(high, low, close).ewm(alpha=alpha, adjust=False).mean()
    atr_safe = atr_smooth.replace(0.0, np.nan)
    plus_di = (100.0 * plus_dm.ewm(alpha=alpha, adjust=False).mean() / atr_safe).fillna(0.0)
    minus_di = (100.0 * minus_dm.ewm(alpha=alpha, adjust=False).mean() / atr_safe).fillna(0.0)
    denom = (plus_di + minus_di).replace(0.0, np.nan)
    dx = (100.0 * (plus_di - minus_di).abs() / denom).fillna(0.0)
    return dx.ewm(alpha=alpha, adjust=False).mean()
