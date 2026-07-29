"""Trend + Momentum (ATR) strategy.

Higher-timeframe EMA stack defines the trend; the entry timeframe waits
for an EMA cross in the trend direction, confirmed by RSI and ADX.
SL/TP are derived from ATR multiples. All computations run on CLOSED
bars only — the forming (last) bar returned by get_rates is dropped.
"""
from __future__ import annotations

import math
from datetime import datetime
from typing import TYPE_CHECKING

from core.logger import get_logger
from strategies import indicators, registry
from strategies.base import Signal, Strategy

if TYPE_CHECKING:
    from core.mt5_client import MT5Client

log = get_logger(__name__)

MIN_CLOSED_BARS = 300   # minimum CLOSED bars required per timeframe
FETCH_BARS = 360        # requested bar count (buffer + forming bar)


@registry.register
class TrendMomentumStrategy(Strategy):
    name = "trend_momentum"
    display_name = "Trend + Momentum (ATR)"
    description = (
        "Üst zaman diliminde (varsayılan H1) EMA50/EMA200 ile trend yönü belirlenir; "
        "giriş zaman diliminde (varsayılan M15) EMA9/EMA21 kesişimi trend yönünde sinyal üretir. "
        "Sinyal RSI aralığı ve ADX gücüyle doğrulanır; SL/TP mesafeleri ATR çarpanlarından hesaplanır. "
        "Tüm hesaplamalar kapanmış mumlar üzerinde yapılır."
    )
    default_params = {
        "tf_trend": "H1",
        "tf_entry": "M15",
        "trend_ema_fast": 50,
        "trend_ema_slow": 200,
        "entry_ema_fast": 9,
        "entry_ema_slow": 21,
        "rsi_period": 14,
        "rsi_buy_min": 50.0,
        "rsi_buy_max": 70.0,
        "rsi_sell_max": 50.0,
        "rsi_sell_min": 30.0,
        "adx_period": 14,
        "adx_min": 20.0,
        "atr_period": 14,
        "atr_sl_mult": 1.5,
        "atr_tp_mult": 2.5,
        "max_spread_points": 0,
        "trade_hours": "",
    }

    def analyze(self, symbol: str, mt5c: "MT5Client", params: dict) -> Signal:
        try:
            return self._analyze(symbol, mt5c, self.merged_params(params))
        except Exception as exc:  # defensive: never raise into the engine loop
            log.exception("Strateji analizi sırasında hata (%s): %s", symbol, exc)
            return Signal(direction="none", reason=f"Strateji hatası: {exc}")

    # ------------------------------------------------------------------
    def _analyze(self, symbol: str, mt5c: "MT5Client", p: dict) -> Signal:
        tf_trend = str(p["tf_trend"])
        tf_entry = str(p["tf_entry"])

        # --- data (closed bars only) ----------------------------------
        trend_df = self._closed_bars(mt5c, symbol, tf_trend)
        if trend_df is None:
            return Signal(direction="none", reason="Yetersiz veri")
        entry_df = self._closed_bars(mt5c, symbol, tf_entry)
        if entry_df is None:
            return Signal(direction="none", reason="Yetersiz veri")

        # --- 1) trend on the higher timeframe -------------------------
        trend_close = float(trend_df["close"].iloc[-1])
        trend_ema_fast = float(
            indicators.ema(trend_df["close"], int(p["trend_ema_fast"])).iloc[-1]
        )
        trend_ema_slow = float(
            indicators.ema(trend_df["close"], int(p["trend_ema_slow"])).iloc[-1]
        )
        if trend_close > trend_ema_fast > trend_ema_slow:
            trend = "up"
        elif trend_close < trend_ema_fast < trend_ema_slow:
            trend = "down"
        else:
            return Signal(direction="none", reason=f"Trend yok/karışık ({tf_trend})")

        # --- 2) EMA cross on the entry timeframe (closed bars) --------
        ema_fast = indicators.ema(entry_df["close"], int(p["entry_ema_fast"]))
        ema_slow = indicators.ema(entry_df["close"], int(p["entry_ema_slow"]))
        fast_prev = float(ema_fast.iloc[-2])
        fast_last = float(ema_fast.iloc[-1])
        slow_prev = float(ema_slow.iloc[-2])
        slow_last = float(ema_slow.iloc[-1])
        bullish_cross = fast_prev <= slow_prev and fast_last > slow_last
        bearish_cross = fast_prev >= slow_prev and fast_last < slow_last

        if trend == "up" and bullish_cross:
            direction = "buy"
        elif trend == "down" and bearish_cross:
            direction = "sell"
        else:
            return Signal(
                direction="none",
                reason=f"Giriş sinyali yok ({tf_entry} EMA kesişimi bekleniyor)",
            )

        # --- 3) RSI + ADX confirmation --------------------------------
        rsi_val = float(
            indicators.rsi(entry_df["close"], int(p["rsi_period"])).iloc[-1]
        )
        adx_val = float(
            indicators.adx(
                entry_df["high"], entry_df["low"], entry_df["close"],
                int(p["adx_period"]),
            ).iloc[-1]
        )
        if math.isnan(rsi_val) or math.isnan(adx_val):
            return Signal(direction="none", reason="Yetersiz veri")

        if direction == "buy":
            lo, hi = float(p["rsi_buy_min"]), float(p["rsi_buy_max"])
        else:
            lo, hi = float(p["rsi_sell_min"]), float(p["rsi_sell_max"])
        if not (lo < rsi_val < hi):
            return Signal(
                direction="none",
                reason=f"RSI onayı yok (RSI {rsi_val:.1f}, beklenen {lo:g}-{hi:g})",
            )

        adx_min = float(p["adx_min"])
        if adx_val < adx_min:
            return Signal(
                direction="none",
                reason=f"ADX zayıf ({adx_val:.1f} < {adx_min:g})",
            )

        # --- 4) filters: spread and trading hours ---------------------
        max_spread = float(p.get("max_spread_points", 0) or 0)
        if max_spread > 0:
            info = mt5c.symbol_info(symbol)
            if info is None:
                return Signal(direction="none", reason="Sembol bilgisi alınamadı")
            spread = float(info.get("spread") or 0)
            if spread > max_spread:
                return Signal(
                    direction="none",
                    reason=f"Spread çok yüksek ({spread:.0f} > {max_spread:.0f} puan)",
                )

        trade_hours = str(p.get("trade_hours", "") or "").strip()
        if trade_hours:
            hours = self._parse_trade_hours(trade_hours)
            if hours is None:
                log.warning(
                    "Geçersiz trade_hours ayarı yok sayıldı: '%s' (örnek: '9-23')",
                    trade_hours,
                )
            else:
                start, end = hours
                hour = datetime.now().hour
                if start <= end:
                    inside = start <= hour <= end
                else:  # overnight range, e.g. "22-6"
                    inside = hour >= start or hour <= end
                if not inside:
                    return Signal(
                        direction="none",
                        reason=f"İşlem saatleri dışında ({trade_hours})",
                    )

        # --- 5) SL/TP from ATR on the entry timeframe -----------------
        atr_val = float(
            indicators.atr(
                entry_df["high"], entry_df["low"], entry_df["close"],
                int(p["atr_period"]),
            ).iloc[-1]
        )
        if not math.isfinite(atr_val) or atr_val <= 0:
            return Signal(direction="none", reason="ATR hesaplanamadı")

        entry_close = float(entry_df["close"].iloc[-1])
        sl_mult = float(p["atr_sl_mult"])
        tp_mult = float(p["atr_tp_mult"])
        if direction == "buy":
            sl_price = entry_close - sl_mult * atr_val
            tp_price = entry_close + tp_mult * atr_val
            trend_txt = "yükseliş"
        else:
            sl_price = entry_close + sl_mult * atr_val
            tp_price = entry_close - tp_mult * atr_val
            trend_txt = "düşüş"

        reason = (
            f"{tf_trend} {trend_txt} trendi + {tf_entry} EMA kesişimi, "
            f"RSI {rsi_val:.1f}, ADX {adx_val:.1f}"
        )
        log.info("Sinyal (%s): %s -> %s", symbol, direction.upper(), reason)
        return Signal(
            direction=direction,
            reason=reason,
            sl_price=sl_price,
            tp_price=tp_price,
        )

    # ------------------------------------------------------------------
    @staticmethod
    def _closed_bars(mt5c: "MT5Client", symbol: str, timeframe: str):
        """Fetch rates and drop the forming bar; None if not enough data."""
        rates = mt5c.get_rates(symbol, timeframe, FETCH_BARS)
        # +1: the last row may be the still-forming bar, which is dropped.
        if rates is None or len(rates) < MIN_CLOSED_BARS + 1:
            return None
        return rates.iloc[:-1]

    @staticmethod
    def _parse_trade_hours(spec: str) -> tuple[int, int] | None:
        """Parse 'H-H' (e.g. '9-23') into (start, end); None if invalid."""
        try:
            parts = spec.replace(" ", "").split("-")
            if len(parts) != 2:
                return None
            start, end = int(parts[0]), int(parts[1])
        except (ValueError, TypeError):
            return None
        if 0 <= start <= 23 and 0 <= end <= 23:
            return start, end
        return None
