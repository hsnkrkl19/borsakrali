"""Execution-mode helpers.

The bot has two order paths:
- paper: use MT5 market data, but record simulated positions locally.
- mt5: send orders to the connected MetaTrader 5 terminal.
"""

from __future__ import annotations


def mode(cfg: dict | None) -> str:
    """Return the normalized execution mode."""
    raw = ((cfg or {}).get("execution") or {}).get("mode", "paper")
    value = str(raw or "paper").strip().lower()
    return "mt5" if value == "mt5" else "paper"


def is_paper(cfg: dict | None) -> bool:
    return mode(cfg) == "paper"


def source(cfg: dict | None) -> str:
    return "paper" if is_paper(cfg) else "mt5"


def paper_balance(cfg: dict | None) -> float:
    paper = (((cfg or {}).get("execution") or {}).get("paper") or {})
    try:
        value = float(paper.get("balance", 10000.0) or 10000.0)
    except (TypeError, ValueError):
        value = 10000.0
    return value if value > 0 else 10000.0


def paper_currency(cfg: dict | None) -> str:
    paper = (((cfg or {}).get("execution") or {}).get("paper") or {})
    currency = str(paper.get("currency", "USD") or "USD").strip().upper()
    return currency or "USD"


def require_demo_account(cfg: dict | None) -> bool:
    execution = ((cfg or {}).get("execution") or {})
    return bool(execution.get("require_demo_account", True))
