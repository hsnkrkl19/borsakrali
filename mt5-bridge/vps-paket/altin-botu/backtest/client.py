# -*- coding: utf-8 -*-
"""BacktestClient — an MT5Client look-alike shim for historical replay.

Wraps a real MT5Client (only its already-fetched symbol_info is used) and a
per-timeframe preloaded price history. A moving ``sim_time`` cursor enforces
the lookahead invariants: ``get_rates`` never returns a bar whose open_time is
strictly after ``sim_time``, so a strategy replaying its live ``analyze()`` /
``manage()`` code can only ever see bars that had already opened at the
simulated decision moment.

The engine drives the cursor with :meth:`set_time` and reads open simulated
positions back through :meth:`positions` (so ``manage()`` sees them exactly as
in live trading).
"""
from __future__ import annotations

from typing import TYPE_CHECKING

import pandas as pd

if TYPE_CHECKING:  # pragma: no cover - typing only
    from core.mt5_client import MT5Client


class BacktestClient:
    """Mimics the subset of :class:`MT5Client` that strategies consume.

    Interface parity (columns / dict keys) with the live client is mandatory:
    ``get_rates`` returns the same ``time/open/high/low/close/tick_volume/spread``
    columns and ``symbol_info`` / ``positions`` return the same dict keys.
    """

    def __init__(self, real_mt5c: "MT5Client", symbol: str):
        self._real = real_mt5c
        self._symbol = symbol
        # Snapshot the real symbol_info once; every money/point calculation and
        # every strategy read of point/digits/spread flows from this dict.
        info = real_mt5c.symbol_info(symbol)
        if not info:
            raise ValueError(f"Sembol bilgisi alınamadı: {symbol}")
        self._symbol_info: dict = dict(info)
        self._real_spread = self._symbol_info.get("spread", 0)

        self._cache: dict[str, pd.DataFrame] = {}   # tf -> full history
        self._sim_time = None                        # current simulation cursor
        self._spread_source_tf: str | None = None    # tf whose bar 'spread' is "current"
        self._positions: list[dict] = []             # open simulated positions

    # ------------------------------------------------------------------
    # Preload / cursor
    # ------------------------------------------------------------------
    def preload(self, timeframe: str, df: pd.DataFrame) -> None:
        """Cache the full historical DataFrame for ``(symbol, timeframe)``.

        The runner fills this before the run. The frame must carry the live
        ``time`` (bar open time) column; a copy is stored so caller mutations
        can't leak into the replay.
        """
        if df is None or "time" not in df.columns:
            raise ValueError(f"Geçersiz veri çerçevesi (tf={timeframe}): 'time' sütunu yok")
        frame = df.reset_index(drop=True).copy()
        frame["time"] = pd.to_datetime(frame["time"])
        self._cache[str(timeframe)] = frame
        # Default the spread source to the finest (first-preloaded) timeframe.
        if self._spread_source_tf is None:
            self._spread_source_tf = str(timeframe)

    def use_spread_source(self, timeframe: str) -> None:
        """Designate which timeframe's bar 'spread' column is the "current" spread."""
        self._spread_source_tf = str(timeframe)

    def history(self, timeframe: str) -> pd.DataFrame:
        """Full preloaded history for a timeframe (engine iteration helper)."""
        tf = str(timeframe)
        if tf not in self._cache:
            raise ValueError(f"Önbellekte zaman dilimi yok: {tf}")
        return self._cache[tf]

    def set_time(self, sim_time) -> None:
        """Advance the simulation cursor to ``sim_time`` (a bar open time)."""
        self._sim_time = pd.Timestamp(sim_time)

    def set_positions(self, positions: list[dict]) -> None:
        """Replace the set of open simulated positions the engine exposes."""
        self._positions = list(positions or [])

    # ------------------------------------------------------------------
    # MT5Client-compatible surface
    # ------------------------------------------------------------------
    def get_rates(self, symbol: str, timeframe: str, count: int):
        """Last ``count`` bars with ``open_time <= sim_time`` (LOOKAHEAD GATE).

        Preserves the live "last forming bar" semantics: the final returned row
        may have ``open_time == sim_time`` and the strategy drops it. A bar whose
        open_time is strictly greater than ``sim_time`` is NEVER returned.
        """
        tf = str(timeframe)
        if tf not in self._cache:
            # Mimic the live MT5Client, which returns None when a timeframe's
            # data is unavailable. Strategies handle None gracefully (e.g.
            # gold_scalp skips its optional weekly filter). Raising here would
            # break that path and flood the log with per-bar errors.
            return None
        df = self._cache[tf]
        if self._sim_time is None:
            visible = df
        else:
            visible = df[df["time"] <= self._sim_time]
        n = int(count)
        if n <= 0:
            return visible.iloc[0:0].copy()
        return visible.tail(n).reset_index(drop=True).copy()

    def _current_spread(self) -> float:
        """Spread (points) at the current sim bar, or the real fallback spread."""
        tf = self._spread_source_tf
        if tf is not None and tf in self._cache and self._sim_time is not None:
            df = self._cache[tf]
            if "spread" in df.columns:
                visible = df[df["time"] <= self._sim_time]
                if len(visible):
                    try:
                        return float(visible["spread"].iloc[-1])
                    except (TypeError, ValueError):
                        pass
        try:
            return float(self._real_spread or 0.0)
        except (TypeError, ValueError):
            return 0.0

    def _current_open(self) -> float | None:
        """Open of the current sim bar (spread-source tf).

        The OPEN is known at bar-open (== ``sim_time``) and is non-anticipative.
        The forming bar's CLOSE is future data, so exposing it through
        :meth:`tick` would be lookahead (invariant 3). Live ``tick()`` at
        bar-open returns ~the open, which is what we mirror here.
        """
        tf = self._spread_source_tf
        if tf is not None and tf in self._cache and self._sim_time is not None:
            df = self._cache[tf]
            visible = df[df["time"] <= self._sim_time]
            if len(visible):
                try:
                    return float(visible["open"].iloc[-1])
                except (TypeError, ValueError):
                    return None
        return None

    def symbol_info(self, symbol: str) -> dict:
        """Stored real symbol_info, with ``spread`` set to the current bar spread."""
        info = dict(self._symbol_info)
        info["spread"] = self._current_spread()
        return info

    def tick(self, symbol: str) -> dict | None:
        """Synthetic non-anticipative tick: bid=open, ask=open+spread*point.

        Uses the current bar's OPEN (known at ``sim_time``), NEVER the forming
        bar's CLOSE, which is future data — exposing it would be lookahead
        (invariant 3).
        """
        price = self._current_open()
        if price is None:
            return None
        point = float(self._symbol_info.get("point", 0.0) or 0.0)
        spread = self._current_spread()
        bid = price
        ask = price + spread * point
        t = self._sim_time
        return {"bid": bid, "ask": ask, "time": t.isoformat() if t is not None else ""}

    def positions(self, magic: int | None = None) -> list[dict]:
        """Currently open simulated positions (so ``manage()`` can see them)."""
        return [dict(p) for p in self._positions]

    # ------------------------------------------------------------------
    # Connection stubs — always "connected" in replay
    # ------------------------------------------------------------------
    def is_connected(self) -> bool:
        return True

    def ensure_connected(self) -> bool:
        return True

    def __getattr__(self, name):
        """Delegate any unknown method to the wrapped real client.

        Only reached for attributes not defined above (``_real`` itself is set
        in ``__init__`` so it never recurses here).
        """
        return getattr(self._real, name)
