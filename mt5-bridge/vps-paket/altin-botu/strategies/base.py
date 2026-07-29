"""Strategy base types: the Signal dataclass and the Strategy ABC.

All concrete strategies subclass Strategy and are registered in
strategies.registry so the engine and the web panel can discover them.
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import TYPE_CHECKING

if TYPE_CHECKING:  # avoid importing MT5-dependent modules at runtime
    from core.mt5_client import MT5Client


@dataclass
class Signal:
    """Result of a strategy analysis for one symbol."""

    direction: str = "none"        # "buy" | "sell" | "none"
    reason: str = ""               # Turkish, shown in panel/journal
    sl_price: float | None = None
    tp_price: float | None = None


class Strategy(ABC):
    """Abstract base class for all trading strategies.

    Subclasses must define the class attributes below and implement
    analyze(). Instances are stateless with respect to market data;
    per-call parameters arrive via the `params` dict (config overrides
    merged over `default_params` by the engine, and defensively merged
    again inside analyze()).
    """

    name: str = ""            # unique key, e.g. "trend_momentum"
    display_name: str = ""    # Turkish display name
    description: str = ""     # Turkish one-paragraph description
    default_params: dict = {}
    # Logical symbol keys this strategy supports ("gold", "btc"). None = all.
    # The engine skips symbols not in this list (e.g. gold-only structure models).
    symbols: "list[str] | None" = None

    def merged_params(self, params: dict | None) -> dict:
        """Return default_params overlaid with the given overrides."""
        merged = dict(self.default_params)
        if params:
            merged.update(params)
        return merged

    def entry_timeframe(self, params: dict) -> str:
        """Timeframe whose new-bar event should trigger analyze()."""
        return str(self.merged_params(params).get("tf_entry", "M15"))

    @abstractmethod
    def analyze(self, symbol: str, mt5c: "MT5Client", params: dict) -> Signal:
        """Analyze the symbol and return a Signal (never raises to caller)."""
        raise NotImplementedError

    def manage(self, symbol: str, mt5c: "MT5Client", params: dict,
               positions: "list[dict]") -> "list[dict]":
        """Optional exit management, called on each new entry-timeframe bar
        BEFORE analyze(), with `positions` = this strategy's open positions on
        the symbol. Returns a list of action dicts the engine applies:
          {"action": "close",  "ticket": int, "reason": <Turkish>}
          {"action": "modify", "ticket": int, "sl": float|None, "tp": float|None, "reason": <Turkish>}
        Strategies with pure SL/TP exits keep the default (no actions).
        """
        return []
