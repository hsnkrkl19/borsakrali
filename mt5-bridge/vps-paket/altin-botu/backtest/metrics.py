# -*- coding: utf-8 -*-
"""Performance metrics computed from a closed-trade list.

All outputs are plain Python floats/ints/strings (JSON-serializable, no numpy)
so the report can be written straight to ``data/backtests/*.json``.
"""
from __future__ import annotations

from datetime import datetime

_MONTH_DAYS = 30.4375  # average days per month


def _f(value, default: float = 0.0) -> float:
    """Cast anything (incl. numpy scalars) to a finite Python float."""
    try:
        out = float(value)
    except (TypeError, ValueError):
        return default
    if out != out or out in (float("inf"), float("-inf")):  # NaN / inf guard
        return default
    return out


def _parse_time(value):
    if not value:
        return None
    try:
        return datetime.fromisoformat(str(value))
    except (ValueError, TypeError):
        return None


def compute(trades: list, start_equity: float) -> dict:
    """Aggregate a closed-trade list into a JSON-serializable metrics dict."""
    start_equity = _f(start_equity, 0.0)
    profits = [_f(t.get("profit")) for t in trades]
    r_values = [_f(t.get("R")) for t in trades]
    bars = [_f(t.get("bars_held")) for t in trades]

    total = len(trades)
    wins = sum(1 for p in profits if p > 0)
    losses = sum(1 for p in profits if p < 0)
    win_rate = (wins / total * 100.0) if total else 0.0

    gross_profit = sum(p for p in profits if p > 0)
    gross_loss = sum(p for p in profits if p < 0)          # <= 0
    gross_loss_abs = abs(gross_loss)
    if gross_loss_abs > 0:
        profit_factor = gross_profit / gross_loss_abs
    elif gross_profit > 0:
        profit_factor = 99.99          # wins with zero losses — genuinely huge
    else:
        profit_factor = 0.0            # no losses AND no wins (e.g. zero-trade run)
    profit_factor = min(profit_factor, 99.99)

    avg_win = (gross_profit / wins) if wins else 0.0
    avg_loss = (gross_loss / losses) if losses else 0.0    # <= 0
    expectancy_r = (sum(r_values) / total) if total else 0.0

    total_profit = sum(profits)
    total_return_pct = (total_profit / start_equity * 100.0) if start_equity > 0 else 0.0

    # Drawdown from the reconstructed equity curve (trade order = close order).
    peak = start_equity
    equity = start_equity
    max_dd_money = 0.0
    max_dd_pct = 0.0
    for p in profits:
        equity += p
        if equity > peak:
            peak = equity
        dd = peak - equity
        if dd > max_dd_money:
            max_dd_money = dd
        dd_pct = (dd / peak * 100.0) if peak > 0 else 0.0
        if dd_pct > max_dd_pct:
            max_dd_pct = dd_pct

    # Max consecutive losses.
    max_consec = 0
    run = 0
    for p in profits:
        if p < 0:
            run += 1
            max_consec = max(max_consec, run)
        else:
            run = 0

    avg_bars_held = (sum(bars) / total) if total else 0.0

    # Timespan / trades per month.
    entry_times = [t for t in (_parse_time(t.get("entry_time")) for t in trades) if t]
    exit_times = [t for t in (_parse_time(t.get("exit_time")) for t in trades) if t]
    months = 0.0
    if entry_times and exit_times:
        span_days = (max(exit_times) - min(entry_times)).total_seconds() / 86400.0
        months = span_days / _MONTH_DAYS
    trades_per_month = (total / months) if months > 0 else 0.0

    result = {
        "total": int(total),
        "wins": int(wins),
        "losses": int(losses),
        "win_rate": round(_f(win_rate), 2),
        "gross_profit": round(_f(gross_profit), 2),
        "gross_loss": round(_f(gross_loss), 2),
        "profit_factor": round(_f(profit_factor), 2),
        "avg_win": round(_f(avg_win), 2),
        "avg_loss": round(_f(avg_loss), 2),
        "expectancy_R": round(_f(expectancy_r), 3),
        "total_profit": round(_f(total_profit), 2),
        "total_return_pct": round(_f(total_return_pct), 2),
        "max_drawdown_pct": round(_f(max_dd_pct), 2),
        "max_drawdown_money": round(_f(max_dd_money), 2),
        "max_consec_losses": int(max_consec),
        "avg_bars_held": round(_f(avg_bars_held), 1),
        "months": round(_f(months), 2),
        "trades_per_month": round(_f(trades_per_month), 2),
    }
    result["summary_tr"] = _summary_tr(result)
    return result


def _summary_tr(m: dict) -> str:
    """One-line human-readable Turkish summary."""
    if m["total"] == 0:
        return "İşlem yok — strateji bu dönemde hiç sinyal üretmedi."
    return (
        "{total} işlem | Kazanma %{win_rate:.1f} | PF {pf:.2f} | "
        "Beklenti {exp:+.2f}R | Toplam getiri %{ret:+.2f} | "
        "Maks düşüş %{dd:.2f} | Ayda ~{tpm:.1f} işlem"
    ).format(
        total=m["total"], win_rate=m["win_rate"], pf=m["profit_factor"],
        exp=m["expectancy_R"], ret=m["total_return_pct"], dd=m["max_drawdown_pct"],
        tpm=m["trades_per_month"],
    )
