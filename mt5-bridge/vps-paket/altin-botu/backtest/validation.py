# -*- coding: utf-8 -*-
"""Validation rules for deciding whether a backtest result is tradable.

This module does not run a backtest. It reads the metrics already produced by
``backtest.metrics`` and assigns a conservative status:

* approved: strong enough to be a production default candidate
* watchlist: positive edge, but should stay small / disabled until forward-test
* rejected: negative or too fragile
* insufficient_data: too few trades to judge
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class ValidationThresholds:
    min_trades: int = 30
    approved_min_trades: int = 60
    watchlist_profit_factor: float = 1.10
    approved_profit_factor: float = 1.35
    watchlist_expectancy_r: float = 0.01
    approved_expectancy_r: float = 0.15
    max_watchlist_drawdown_pct: float = 25.0
    max_approved_drawdown_pct: float = 20.0
    min_trades_per_month: float = 0.2


DEFAULT_THRESHOLDS = ValidationThresholds()


def _f(value: Any, default: float = 0.0) -> float:
    try:
        out = float(value)
    except (TypeError, ValueError):
        return default
    if out != out or out in (float("inf"), float("-inf")):
        return default
    return out


def _i(value: Any, default: int = 0) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def score(metrics: dict, thresholds: ValidationThresholds = DEFAULT_THRESHOLDS) -> float:
    """Return a 0..100 quality score from a metrics dict."""
    total = _i(metrics.get("total"))
    pf = min(_f(metrics.get("profit_factor")), 3.0)
    exp = _f(metrics.get("expectancy_R"))
    dd = _f(metrics.get("max_drawdown_pct"))
    tpm = _f(metrics.get("trades_per_month"))

    sample = min(total / max(thresholds.approved_min_trades, 1), 1.0)
    pf_part = min(max((pf - 1.0) / 1.0, 0.0), 1.0) * 42.0
    exp_part = min(max(exp / 0.50, 0.0), 1.0) * 28.0
    dd_part = min(max(1.0 - (dd / 35.0), 0.0), 1.0) * 20.0
    activity_part = min(max(tpm / 5.0, 0.0), 1.0) * 10.0
    return round((pf_part + exp_part + dd_part + activity_part) * sample, 2)


def validate(metrics: dict,
             thresholds: ValidationThresholds = DEFAULT_THRESHOLDS) -> dict:
    """Classify one backtest metrics block."""
    total = _i(metrics.get("total"))
    pf = _f(metrics.get("profit_factor"))
    exp = _f(metrics.get("expectancy_R"))
    ret = _f(metrics.get("total_return_pct"))
    dd = _f(metrics.get("max_drawdown_pct"))
    tpm = _f(metrics.get("trades_per_month"))
    quality = score(metrics, thresholds)

    reasons: list[str] = []
    status = "rejected"

    if total < thresholds.min_trades:
        status = "insufficient_data"
        reasons.append(
            f"Yetersiz örnek: {total} işlem < {thresholds.min_trades}"
        )
    elif pf < 1.0 or exp <= 0 or ret <= 0:
        status = "rejected"
        if pf < 1.0:
            reasons.append(f"Profit factor düşük: {pf:.2f} < 1.00")
        if exp <= 0:
            reasons.append(f"Beklenti negatif/sıfır: {exp:+.3f}R")
        if ret <= 0:
            reasons.append(f"Toplam getiri negatif/sıfır: %{ret:+.2f}")
    elif (
        total >= thresholds.approved_min_trades
        and pf >= thresholds.approved_profit_factor
        and exp >= thresholds.approved_expectancy_r
        and dd <= thresholds.max_approved_drawdown_pct
        and tpm >= thresholds.min_trades_per_month
    ):
        status = "approved"
        reasons.append("Güçlü edge: PF, beklenti ve drawdown eşikleri geçti")
    elif (
        pf >= thresholds.watchlist_profit_factor
        and exp >= thresholds.watchlist_expectancy_r
        and dd <= thresholds.max_watchlist_drawdown_pct
        and tpm >= thresholds.min_trades_per_month
    ):
        status = "watchlist"
        reasons.append("Pozitif ama üretim varsayılanı için zayıf edge")
    else:
        status = "rejected"
        if pf < thresholds.watchlist_profit_factor:
            reasons.append(
                f"PF izleme eşiğinin altında: {pf:.2f} < {thresholds.watchlist_profit_factor:.2f}"
            )
        if exp < thresholds.watchlist_expectancy_r:
            reasons.append(
                f"Beklenti izleme eşiğinin altında: {exp:+.3f}R"
            )
        if dd > thresholds.max_watchlist_drawdown_pct:
            reasons.append(
                f"Drawdown yüksek: %{dd:.2f} > %{thresholds.max_watchlist_drawdown_pct:.2f}"
            )
        if tpm < thresholds.min_trades_per_month:
            reasons.append(
                f"İşlem frekansı düşük: ayda {tpm:.2f}"
            )

    return {
        "status": status,
        "score": quality,
        "reasons": reasons,
        "thresholds": {
            "min_trades": thresholds.min_trades,
            "approved_min_trades": thresholds.approved_min_trades,
            "watchlist_profit_factor": thresholds.watchlist_profit_factor,
            "approved_profit_factor": thresholds.approved_profit_factor,
            "watchlist_expectancy_r": thresholds.watchlist_expectancy_r,
            "approved_expectancy_r": thresholds.approved_expectancy_r,
            "max_watchlist_drawdown_pct": thresholds.max_watchlist_drawdown_pct,
            "max_approved_drawdown_pct": thresholds.max_approved_drawdown_pct,
            "min_trades_per_month": thresholds.min_trades_per_month,
        },
    }


def decision_text(validation: dict) -> str:
    """Turkish one-line decision for CLI output."""
    status = str(validation.get("status") or "")
    score_value = _f(validation.get("score"))
    label = {
        "approved": "ONAY",
        "watchlist": "IZLEME",
        "rejected": "RET",
        "insufficient_data": "VERI AZ",
    }.get(status, status.upper())
    reasons = validation.get("reasons") or []
    reason = str(reasons[0]) if reasons else "Gerekçe yok"
    return f"{label} | skor {score_value:.1f}/100 | {reason}"
