# -*- coding: utf-8 -*-
"""Backtester — a bar-by-bar, event-driven replay of a live Strategy.

The engine walks the entry-timeframe bars forward. At each bar N it sets the
:class:`BacktestClient` cursor to that bar's OPEN time, then either manages an
open position (strategy ``manage()`` then intrabar SL/TP) or asks the strategy
for a fresh signal (``analyze()``) and opens a position filled at bar N's OPEN.

The six lookahead invariants from BACKTEST_SPEC.md are enforced here together
with :class:`~backtest.client.BacktestClient`:

* decisions at bar N only ever see bars with ``open_time <= open_time[N]`` and
  the strategy itself drops the forming bar (invariants 1, 2, 5);
* entry fills at ``open[N]`` (+ spread for buy), never a close or future price
  (invariant 3);
* SL/TP are evaluated only on bars strictly AFTER the entry bar (invariant 4);
* when a bar touches both SL and TP, SL wins (invariant 6).
"""
from __future__ import annotations

import math
from typing import TYPE_CHECKING

from backtest import metrics

if TYPE_CHECKING:  # pragma: no cover - typing only
    from backtest.client import BacktestClient
    from strategies.base import Strategy

WARMUP_BARS = 300      # entry-tf bars skipped before the first decision
_MAGIC = 20260707      # simulated position magic (mirrors core.config.MAGIC_NUMBER)


class Backtester:
    """Replays one strategy over one symbol's preloaded history."""

    def __init__(self, strategy: "Strategy", client: "BacktestClient", symbol: str,
                 params: dict, start_equity: float = 10000.0, risk_percent: float = 1.0,
                 spread_points: "float | None" = None,
                 decision_start=None, decision_end=None,
                 slippage_points_per_side: float = 0.0,
                 commission_per_lot_per_side: float = 0.0,
                 max_lot: float = 0.10,
                 max_spread_bps: float = 20.0):
        self.strategy = strategy
        self.client = client
        self.symbol = symbol
        self.params = dict(params or {})
        self.start_equity = float(start_equity)
        self.risk_percent = float(risk_percent)
        # None => take the spread from each bar's 'spread' column at fill time.
        self.spread_points = None if spread_points is None else float(spread_points)
        self.decision_start = decision_start
        self.decision_end = decision_end
        self.slippage_points_per_side = max(0.0, float(slippage_points_per_side or 0.0))
        self.commission_per_lot_per_side = max(0.0, float(commission_per_lot_per_side or 0.0))
        self.max_lot = max(0.0, float(max_lot or 0.0))
        self.max_spread_bps = max(0.0, float(max_spread_bps or 0.0))

        info = client.symbol_info(symbol)
        self.point = float(info.get("point", 0.0) or 0.0)
        tick_value = float(info.get("trade_tick_value", 0.0) or 0.0)
        tick_size = float(info.get("trade_tick_size", 0.0) or 0.0)
        # pv = account-currency value of a 1-point move on 1.0 lot (mirrors risk.py).
        self.pv = (tick_value / tick_size * self.point) if tick_size > 0 else 0.0
        self.volume_min = float(info.get("volume_min", 0.01) or 0.01)
        self.volume_max = min(
            float(info.get("volume_max", 100.0) or 100.0), self.max_lot
        )
        self.volume_step = float(info.get("volume_step", 0.01) or 0.01)
        self.trade_stops_points = float(info.get("trade_stops_level", 0.0) or 0.0)

        self._ticket = 0

    # ------------------------------------------------------------------
    # money model
    # ------------------------------------------------------------------
    def _round_lot(self, lot: float) -> float:
        """Round to volume_step and clamp into [volume_min, volume_max]."""
        step = self.volume_step if self.volume_step > 0 else 0.01
        # FLOOR to the step (ROUND_FLOOR), mirroring live RiskManager._floor_to_step;
        # rounding half-up could size one step above what live would ever open.
        steps = math.floor(lot / step)
        rounded = round(steps * step, 8)
        if self.volume_max < self.volume_min or rounded < self.volume_min:
            return 0.0
        if rounded > self.volume_max:
            return self.volume_max
        return rounded

    def _profit(self, entry: float, exit_price: float, direction: str, lot: float) -> float:
        """profit = (exit - entry) * dir * lot * pv / point (buy +1, sell -1)."""
        sign = 1.0 if direction == "buy" else -1.0
        if self.point <= 0:
            return 0.0
        return (exit_price - entry) * sign * lot * self.pv / self.point

    def _spread_at(self, bar_spread) -> float:
        """Effective spread in points for a fill (fixed override or bar column)."""
        if self.spread_points is not None:
            return self.spread_points
        try:
            return float(bar_spread or 0.0)
        except (TypeError, ValueError):
            return 0.0

    # ------------------------------------------------------------------
    # run
    # ------------------------------------------------------------------
    def run(self, entry_tf: str) -> dict:
        """Replay the strategy over ``entry_tf`` bars and return results."""
        client = self.client
        client.use_spread_source(entry_tf)
        df = client.history(entry_tf)

        times = df["time"].tolist()
        opens = df["open"].astype(float).tolist()
        highs = df["high"].astype(float).tolist()
        lows = df["low"].astype(float).tolist()
        closes = df["close"].astype(float).tolist()
        spreads = df["spread"].tolist() if "spread" in df.columns else [0.0] * len(df)

        n_bars = len(df)
        equity = self.start_equity
        trades: list[dict] = []
        equity_curve: list[dict] = []
        if n_bars:
            equity_curve.append({
                "time": self._iso(times[min(WARMUP_BARS, n_bars - 1)]),
                "equity": float(equity),
            })

        position: dict | None = None

        for n in range(WARMUP_BARS, n_bars):
            sim_time = times[n]
            if self.decision_start is not None and sim_time < self.decision_start:
                continue
            if self.decision_end is not None and sim_time > self.decision_end:
                break
            client.set_time(sim_time)

            if position is not None:
                # --- 2. manage an open position ---------------------------
                client.set_positions([self._position_view(position, opens[n])])
                actions = self.strategy.manage(
                    self.symbol, client, self.params,
                    [self._position_view(position, opens[n])],
                )
                closed = False
                for act in actions or []:
                    if str(act.get("action")) == "close" and act.get("ticket") == position["ticket"]:
                        # manage close fills at bar N's OPEN (raw price).
                        trade = self._close(position, opens[n], n, sim_time,
                                            reason=str(act.get("reason") or "manage kapatma"),
                                            exit_kind="manage", sp=self._spread_at(spreads[n]))
                        equity += trade["profit"]
                        trade["equity_after"] = float(equity)
                        trades.append(trade)
                        equity_curve.append({"time": trade["exit_time"], "equity": float(equity)})
                        position = None
                        closed = True
                        break
                if closed:
                    continue

                # --- 2b. intrabar SL/TP on bar N (strictly after entry) ---
                hit = self._check_sl_tp(position, highs[n], lows[n])
                if hit is not None:
                    exit_price, exit_kind, reason = hit
                    trade = self._close(position, exit_price, n, sim_time,
                                        reason=reason, exit_kind=exit_kind,
                                        sp=self._spread_at(spreads[n]))
                    equity += trade["profit"]
                    trade["equity_after"] = float(equity)
                    trades.append(trade)
                    equity_curve.append({"time": trade["exit_time"], "equity": float(equity)})
                    position = None
                # A bar that held an open position never opens a new one.
                continue

            # --- 3. no open position: look for an entry -------------------
            client.set_positions([])
            signal = self.strategy.analyze(self.symbol, client, self.params)
            direction = getattr(signal, "direction", "none")
            if direction not in ("buy", "sell"):
                continue

            sl = self._as_price(getattr(signal, "sl_price", None))
            tp = self._as_price(getattr(signal, "tp_price", None))
            if sl is None:
                # No stop => no risk-based lot => skip (spec: SL yoksa işlemi atla).
                continue

            sp = self._spread_at(spreads[n])
            spread_bps = (sp * self.point / opens[n] * 10_000.0) if opens[n] > 0 else 99999.0
            if self.max_spread_bps and spread_bps > self.max_spread_bps:
                continue
            if direction == "buy":
                entry = opens[n] + (sp + self.slippage_points_per_side) * self.point
            else:
                entry = opens[n] - self.slippage_points_per_side * self.point

            if direction == "buy" and (sl >= entry or (tp is not None and tp <= entry)):
                continue
            if direction == "sell" and (sl <= entry or (tp is not None and tp >= entry)):
                continue
            if self.trade_stops_points > 0:
                min_stop = self.trade_stops_points * self.point
                if abs(entry - sl) < min_stop:
                    continue
                if tp is not None and abs(tp - entry) < min_stop:
                    continue

            sl_pts = abs(entry - sl) / self.point if self.point > 0 else 0.0
            if sl_pts <= 0 or self.pv <= 0:
                continue
            risk_amount = equity * self.risk_percent / 100.0
            lot = self._round_lot(risk_amount / (sl_pts * self.pv))
            if lot <= 0:
                continue

            self._ticket += 1
            position = {
                "ticket": self._ticket,
                "direction": direction,
                "entry": float(entry),
                "sl": float(sl),
                "tp": float(tp) if tp is not None else 0.0,
                "lot": float(lot),
                "risk_amount": float(risk_amount),
                "entry_index": n,
                "entry_time": self._iso(sim_time),
                "reason": str(getattr(signal, "reason", "") or ""),
            }
            # Do not evaluate SL/TP on the entry bar itself (invariants 3/4).

        # Do not let an unrecorded open trade disappear at a fold/holdout
        # boundary. Mark it to market at the last eligible bar's close.
        if position is not None and n_bars:
            last_index = n_bars - 1
            if self.decision_end is not None:
                eligible = [i for i, ts in enumerate(times) if ts <= self.decision_end]
                if eligible:
                    last_index = eligible[-1]
            sim_time = times[last_index]
            trade = self._close(
                position,
                closes[last_index],
                last_index,
                sim_time,
                reason="test penceresi sonu",
                exit_kind="window_end",
                sp=self._spread_at(spreads[last_index]),
            )
            equity += trade["profit"]
            trade["equity_after"] = float(equity)
            trades.append(trade)
            equity_curve.append({"time": trade["exit_time"], "equity": float(equity)})

        result = {
            "symbol": self.symbol,
            "strategy": getattr(self.strategy, "name", ""),
            "params": dict(self.params),
            "start_equity": float(self.start_equity),
            "trades": trades,
            "equity_curve": equity_curve,
            "metrics": metrics.compute(trades, self.start_equity),
        }
        return result

    # ------------------------------------------------------------------
    # helpers
    # ------------------------------------------------------------------
    def _check_sl_tp(self, position: dict, high: float, low: float):
        """Intrabar SL/TP resolution for one bar. SL wins ties (invariant 6)."""
        sl = position["sl"]
        tp = position["tp"]
        if position["direction"] == "buy":
            if low <= sl:
                return sl, "sl", "SL vuruldu"
            if tp and tp > 0 and high >= tp:
                return tp, "tp", "TP vuruldu"
        else:  # sell
            if high >= sl:
                return sl, "sl", "SL vuruldu"
            if tp and tp > 0 and low <= tp:
                return tp, "tp", "TP vuruldu"
        return None

    def _close(self, position: dict, exit_price: float, exit_index: int,
               sim_time, reason: str, exit_kind: str, sp: float = 0.0) -> dict:
        """Build a closed-trade record (round-trip spread charged once).

        A buy already paid the spread at entry (filled at the ask) and exits at
        the raw price. A sell entered at the bid (open), so it closes by BUYING
        BACK at the ask: its exit fill is ``level + sp*point`` — one spread, so a
        short bears the same round-trip cost as a long (spec: 'Round-trip spread
        bir kez'). Without this a short paid zero spread and was optimistic.
        """
        direction = position["direction"]
        lot = position["lot"]
        entry = position["entry"]
        fill = float(exit_price)
        if direction == "sell":
            fill = fill + (sp + self.slippage_points_per_side) * self.point
        else:
            fill = fill - self.slippage_points_per_side * self.point
        gross_profit = self._profit(entry, fill, direction, lot)
        commission = 2.0 * self.commission_per_lot_per_side * lot
        profit = gross_profit - commission
        risk_amount = position["risk_amount"]
        r_multiple = (profit / risk_amount) if risk_amount else 0.0
        bars_held = int(exit_index - position["entry_index"])
        return {
            "ticket": int(position["ticket"]),
            "symbol": self.symbol,
            "strategy": getattr(self.strategy, "name", ""),
            "direction": direction,
            "volume": float(lot),
            "entry_time": position["entry_time"],
            "exit_time": self._iso(sim_time),
            "entry_price": float(entry),
            "exit_price": float(fill),
            "sl": float(position["sl"]),
            "tp": float(position["tp"]),
            "profit": float(profit),
            "gross_profit": float(gross_profit),
            "commission": float(commission),
            "R": float(r_multiple),
            "risk_amount": float(risk_amount),
            "bars_held": bars_held,
            "exit_kind": exit_kind,
            "entry_reason": position["reason"],
            "exit_reason": reason,
        }

    def _position_view(self, position: dict, current_price: float) -> dict:
        """Live-shaped position dict (same keys as MT5Client.positions())."""
        floating = self._profit(position["entry"], float(current_price),
                                 position["direction"], position["lot"])
        return {
            "ticket": int(position["ticket"]),
            "symbol": self.symbol,
            "direction": position["direction"],
            "volume": float(position["lot"]),
            "price_open": float(position["entry"]),
            "sl": float(position["sl"]),
            "tp": float(position["tp"]),
            "profit": float(floating),
            "swap": 0.0,
            "comment": "backtest",
            "magic": _MAGIC,
            "time": position["entry_time"],
        }

    @staticmethod
    def _as_price(value) -> "float | None":
        """Normalize an sl/tp price: None/0 -> None (no level)."""
        if value is None:
            return None
        try:
            v = float(value)
        except (TypeError, ValueError):
            return None
        if v == 0.0:
            return None
        return v

    @staticmethod
    def _iso(ts) -> str:
        try:
            import pandas as pd
            return pd.Timestamp(ts).isoformat()
        except Exception:  # pragma: no cover - defensive
            return str(ts)
