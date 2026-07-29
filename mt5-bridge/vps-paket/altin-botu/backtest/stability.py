# -*- coding: utf-8 -*-
"""Stability checks over a saved backtest trade list.

This is not a parameter walk-forward optimizer. It is a conservative stability
view: split the closed trades chronologically and validate each slice. A system
that only wins in one slice but fails everywhere else should not be promoted.
"""
from __future__ import annotations

from datetime import datetime
from typing import Any

from backtest.metrics import compute
from backtest.validation import validate


def _parse_time(value: Any) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(str(value))
    except (TypeError, ValueError):
        return None


def _chunks(items: list[dict], folds: int) -> list[list[dict]]:
    if folds <= 1:
        return [items]
    n = len(items)
    if n == 0:
        return []
    out: list[list[dict]] = []
    for i in range(folds):
        start = round(i * n / folds)
        end = round((i + 1) * n / folds)
        part = items[start:end]
        if part:
            out.append(part)
    return out


def evaluate(report: dict, folds: int = 4) -> dict:
    """Return fold-by-fold stability metrics for one backtest report."""
    trades = list(report.get("trades") or [])
    start_equity = float(report.get("start_equity") or 10000.0)
    trades.sort(key=lambda t: str(t.get("exit_time") or t.get("entry_time") or ""))

    fold_results = []
    for idx, part in enumerate(_chunks(trades, folds), start=1):
        metrics = compute(part, start_equity)
        validation = validate(metrics)
        start = _parse_time(part[0].get("entry_time") or part[0].get("exit_time"))
        end = _parse_time(part[-1].get("exit_time") or part[-1].get("entry_time"))
        fold_results.append({
            "fold": idx,
            "start": start.isoformat() if start else "",
            "end": end.isoformat() if end else "",
            "trades": len(part),
            "metrics": metrics,
            "validation": validation,
        })

    positive = [
        f for f in fold_results
        if f["metrics"].get("profit_factor", 0) >= 1.0
        and f["metrics"].get("expectancy_R", 0) > 0
        and f["metrics"].get("total_return_pct", 0) > 0
    ]
    rejected = [f for f in fold_results if f["validation"].get("status") == "rejected"]
    approved = [f for f in fold_results if f["validation"].get("status") == "approved"]
    watchlist = [f for f in fold_results if f["validation"].get("status") == "watchlist"]

    if not fold_results:
        status = "insufficient_data"
        summary = "Islem yok; stabilite olculemedi."
    elif len(rejected) == 0 and len(positive) == len(fold_results):
        status = "stable"
        summary = "Tum dilimler pozitif; rejim stabilitesi iyi."
    elif len(positive) >= max(1, len(fold_results) - 1) and len(rejected) <= 1:
        status = "mixed_positive"
        summary = "Cogunluk pozitif; en az bir zayif dilim var."
    else:
        status = "unstable"
        summary = "Dilimler arasi edge tutarsiz; uretim icin zayif."

    return {
        "folds_requested": folds,
        "folds": fold_results,
        "positive_folds": len(positive),
        "approved_folds": len(approved),
        "watchlist_folds": len(watchlist),
        "rejected_folds": len(rejected),
        "status": status,
        "summary": summary,
    }
