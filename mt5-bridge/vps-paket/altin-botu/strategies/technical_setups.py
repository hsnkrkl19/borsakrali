"""General technical setup strategies.

These are local implementations of common, well-documented trading ideas
seen across open-source trading frameworks (Donchian breakout, RSI/Bollinger
mean reversion). No third-party strategy code is copied.
"""
from __future__ import annotations

from typing import TYPE_CHECKING

from core.logger import get_logger
from strategies import indicators, registry
from strategies.base import Signal, Strategy

if TYPE_CHECKING:
    from core.mt5_client import MT5Client

log = get_logger(__name__)


def _closed_bars(mt5c: "MT5Client", symbol: str, timeframe: str, count: int):
    rates = mt5c.get_rates(symbol, timeframe, int(count))
    if rates is None or len(rates) < 3:
        return None
    # Last row is the forming bar.
    return rates.iloc[:-1].copy()


def _symbol_digits_point(mt5c: "MT5Client", symbol: str) -> tuple[int, float] | None:
    info = mt5c.symbol_info(symbol)
    if not info:
        return None
    try:
        digits = int(info.get("digits") or 0)
        point = float(info.get("point") or 0.0)
    except (TypeError, ValueError):
        return None
    if point <= 0:
        return None
    return digits, point


def _round_price(price: float, digits: int) -> float:
    return round(float(price), int(digits))


@registry.register
class DonchianAtrBreakout(Strategy):
    name = "donchian_atr_breakout"
    display_name = "Donchian + ATR Kırılım"
    description = (
        "Genel trend kırılım aday stratejisi: fiyat önceki Donchian kanalının "
        "üstüne/altına kapanırsa ATR tabanlı SL/TP ile giriş üretir. Altın ve BTC "
        "için adaydır; üretimden önce backtest/forward test gerekir."
    )
    symbols = ["gold", "btc"]
    default_params = {
        "tf_entry": "M15",
        "channel_period": 55,
        "atr_period": 14,
        "atr_sl_mult": 2.0,
        "atr_tp_mult": 3.0,
        "ema_filter_period": 200,
        "use_ema_filter": True,
        "max_spread_points": 0,
        "fetch_bars": 400,
    }

    def analyze(self, symbol: str, mt5c: "MT5Client", params: dict) -> Signal:
        try:
            return self._analyze(symbol, mt5c, self.merged_params(params))
        except Exception as exc:  # pragma: no cover - defensive
            log.exception("%s Donchian strateji hatası: %s", symbol, exc)
            return Signal(direction="none", reason=f"Strateji hatası: {exc}")

    def _analyze(self, symbol: str, mt5c: "MT5Client", p: dict) -> Signal:
        df = _closed_bars(mt5c, symbol, p["tf_entry"], int(p["fetch_bars"]))
        min_len = max(int(p["channel_period"]), int(p["ema_filter_period"]), int(p["atr_period"])) + 5
        if df is None or len(df) < min_len:
            return Signal(direction="none", reason="Yetersiz veri")

        meta = _symbol_digits_point(mt5c, symbol)
        info = mt5c.symbol_info(symbol)
        if meta is None or not info:
            return Signal(direction="none", reason="Sembol bilgisi alınamadı")
        digits, point = meta
        try:
            spread = float(info.get("spread") or 0.0)
            max_spread = float(p.get("max_spread_points") or 0.0)
        except (TypeError, ValueError):
            spread = max_spread = 0.0
        if max_spread > 0 and spread > max_spread:
            return Signal(direction="none", reason=f"Spread yüksek ({spread:g} > {max_spread:g})")

        close = df["close"]
        high = df["high"]
        low = df["low"]
        upper = indicators.donchian_high(high, int(p["channel_period"]))
        lower = indicators.donchian_low(low, int(p["channel_period"]))
        atr = indicators.atr(high, low, close, int(p["atr_period"]))
        ema = indicators.ema(close, int(p["ema_filter_period"]))

        last_close = float(close.iloc[-1])
        last_upper = float(upper.iloc[-1])
        last_lower = float(lower.iloc[-1])
        last_atr = float(atr.iloc[-1])
        last_ema = float(ema.iloc[-1])
        if not all(v == v and v > 0 for v in (last_close, last_upper, last_lower, last_atr)):
            return Signal(direction="none", reason="Kanal/ATR hesaplanamadı")

        direction = "none"
        if last_close > last_upper:
            direction = "buy"
        elif last_close < last_lower:
            direction = "sell"
        else:
            return Signal(direction="none", reason="Donchian kırılımı yok")

        if bool(p.get("use_ema_filter", True)):
            if direction == "buy" and last_close < last_ema:
                return Signal(direction="none", reason="EMA trend filtresi alışa izin vermiyor")
            if direction == "sell" and last_close > last_ema:
                return Signal(direction="none", reason="EMA trend filtresi satışa izin vermiyor")

        if direction == "buy":
            sl = last_close - float(p["atr_sl_mult"]) * last_atr
            tp = last_close + float(p["atr_tp_mult"]) * last_atr
        else:
            sl = last_close + float(p["atr_sl_mult"]) * last_atr
            tp = last_close - float(p["atr_tp_mult"]) * last_atr
        if abs(last_close - sl) < 10 * point:
            return Signal(direction="none", reason="SL mesafesi çok dar")

        reason = (
            f"{p['tf_entry']} Donchian {p['channel_period']} kırılımı, "
            f"ATR SLx{p['atr_sl_mult']} TPx{p['atr_tp_mult']}"
        )
        return Signal(
            direction=direction,
            reason=reason,
            sl_price=_round_price(sl, digits),
            tp_price=_round_price(tp, digits),
        )


@registry.register
class RsiBollingerReversion(Strategy):
    name = "rsi_bollinger_reversion"
    display_name = "RSI + Bollinger Dönüş"
    description = (
        "Genel mean-reversion aday stratejisi: fiyat Bollinger bandı dışına taşar "
        "ve RSI aşırı bölgeden geri dönerse ATR tabanlı SL/TP ile işlem üretir. "
        "Aday stratejidir; üretimden önce backtest/forward test gerekir."
    )
    symbols = ["gold", "btc"]
    default_params = {
        "tf_entry": "M15",
        "bb_period": 20,
        "bb_std": 2.0,
        "rsi_period": 14,
        "rsi_buy_max": 32,
        "rsi_sell_min": 68,
        "atr_period": 14,
        "atr_sl_mult": 1.5,
        "atr_tp_mult": 2.0,
        "max_spread_points": 0,
        "fetch_bars": 300,
    }

    def analyze(self, symbol: str, mt5c: "MT5Client", params: dict) -> Signal:
        try:
            return self._analyze(symbol, mt5c, self.merged_params(params))
        except Exception as exc:  # pragma: no cover - defensive
            log.exception("%s RSI/Bollinger strateji hatası: %s", symbol, exc)
            return Signal(direction="none", reason=f"Strateji hatası: {exc}")

    def _analyze(self, symbol: str, mt5c: "MT5Client", p: dict) -> Signal:
        df = _closed_bars(mt5c, symbol, p["tf_entry"], int(p["fetch_bars"]))
        min_len = max(int(p["bb_period"]), int(p["rsi_period"]), int(p["atr_period"])) + 5
        if df is None or len(df) < min_len:
            return Signal(direction="none", reason="Yetersiz veri")

        meta = _symbol_digits_point(mt5c, symbol)
        info = mt5c.symbol_info(symbol)
        if meta is None or not info:
            return Signal(direction="none", reason="Sembol bilgisi alınamadı")
        digits, point = meta
        try:
            spread = float(info.get("spread") or 0.0)
            max_spread = float(p.get("max_spread_points") or 0.0)
        except (TypeError, ValueError):
            spread = max_spread = 0.0
        if max_spread > 0 and spread > max_spread:
            return Signal(direction="none", reason=f"Spread yüksek ({spread:g} > {max_spread:g})")

        close = df["close"]
        high = df["high"]
        low = df["low"]
        ma = indicators.sma(close, int(p["bb_period"]))
        std = indicators.rolling_std(close, int(p["bb_period"]))
        upper = ma + float(p["bb_std"]) * std
        lower = ma - float(p["bb_std"]) * std
        rsi = indicators.rsi(close, int(p["rsi_period"]))
        atr = indicators.atr(high, low, close, int(p["atr_period"]))

        last_close = float(close.iloc[-1])
        prev_close = float(close.iloc[-2])
        last_upper = float(upper.iloc[-1])
        last_lower = float(lower.iloc[-1])
        prev_upper = float(upper.iloc[-2])
        prev_lower = float(lower.iloc[-2])
        last_rsi = float(rsi.iloc[-1])
        prev_rsi = float(rsi.iloc[-2])
        last_atr = float(atr.iloc[-1])
        if not all(v == v and v > 0 for v in (last_close, last_upper, last_lower, last_atr)):
            return Signal(direction="none", reason="Bollinger/ATR hesaplanamadı")

        direction = "none"
        buy_max = float(p["rsi_buy_max"])
        sell_min = float(p["rsi_sell_min"])
        if prev_close < prev_lower and last_close > last_lower and prev_rsi <= buy_max and last_rsi > prev_rsi:
            direction = "buy"
        elif prev_close > prev_upper and last_close < last_upper and prev_rsi >= sell_min and last_rsi < prev_rsi:
            direction = "sell"
        else:
            return Signal(direction="none", reason="RSI+Bollinger dönüş şartı yok")

        if direction == "buy":
            sl = last_close - float(p["atr_sl_mult"]) * last_atr
            tp = last_close + float(p["atr_tp_mult"]) * last_atr
        else:
            sl = last_close + float(p["atr_sl_mult"]) * last_atr
            tp = last_close - float(p["atr_tp_mult"]) * last_atr
        if abs(last_close - sl) < 10 * point:
            return Signal(direction="none", reason="SL mesafesi çok dar")

        reason = (
            f"{p['tf_entry']} RSI+Bollinger dönüşü, RSI {last_rsi:.1f}, "
            f"ATR SLx{p['atr_sl_mult']} TPx{p['atr_tp_mult']}"
        )
        return Signal(
            direction=direction,
            reason=reason,
            sl_price=_round_price(sl, digits),
            tp_price=_round_price(tp, digits),
        )
