# -*- coding: utf-8 -*-
"""Build a combined strategy scoreboard from backtests and live journal stats."""
from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path
from typing import Any

from backtest.stability import evaluate as evaluate_stability
from backtest.validation import validate

_STATUS_RANK = {
    "approved": 0,
    "watchlist": 1,
    "insufficient_data": 2,
    "rejected": 3,
}


def _load_json(path: Path) -> dict | None:
    try:
        with path.open("r", encoding="utf-8") as fh:
            data = json.load(fh)
    except (OSError, json.JSONDecodeError):
        return None
    return data if isinstance(data, dict) else None


def _latest_reports(report_dir: Path) -> list[tuple[Path, dict]]:
    latest: dict[tuple[str, str], tuple[Path, dict]] = {}
    if not report_dir.exists():
        return []
    for path in report_dir.glob("*.json"):
        data = _load_json(path)
        if not data:
            continue
        key = (str(data.get("strategy") or ""), str(data.get("symbol") or ""))
        old = latest.get(key)
        if old is None or path.stat().st_mtime > old[0].stat().st_mtime:
            latest[key] = (path, data)
    return list(latest.values())


def _report_entry(path: Path, report: dict) -> dict:
    metrics = report.get("metrics") or {}
    validation = report.get("validation") or validate(metrics)
    stability = report.get("stability") or evaluate_stability(report)
    return {
        "strategy": str(report.get("strategy") or ""),
        "symbol": str(report.get("symbol") or ""),
        "symbol_key": str(report.get("symbol_key") or ""),
        "report": str(path),
        "modified_at": datetime.fromtimestamp(path.stat().st_mtime).isoformat(timespec="seconds"),
        "metrics": metrics,
        "validation": validation,
        "stability": stability,
    }


def _live_strategy_entries(stats: dict) -> list[dict]:
    by_strategy = stats.get("by_strategy") or {}
    out = []
    for name, segment in by_strategy.items():
        if not isinstance(segment, dict):
            continue
        out.append({
            "strategy": str(name),
            "metrics": segment,
            "score": float(segment.get("quality_score") or 0.0),
            "total": int(segment.get("total") or 0),
        })
    return sorted(out, key=lambda item: (-item["score"], item["strategy"]))


def build(journal: Any | None = None,
          report_dir: str | Path = Path("data") / "backtests",
          source: str | None = None) -> dict:
    """Return the current strategy scoreboard.

    Backtest entries rank long-term evidence; live entries rank real closed
    trades. With little live data, the backtest board should dominate decisions.
    """
    report_path = Path(report_dir)
    backtests = [_report_entry(path, report) for path, report in _latest_reports(report_path)]
    backtests.sort(
        key=lambda item: (
            _STATUS_RANK.get(item["validation"].get("status"), 9),
            -float(item["validation"].get("score") or 0.0),
            item["symbol"],
            item["strategy"],
        )
    )

    live_stats = {}
    if journal is not None:
        try:
            live_stats = journal.stats(source=source) or {}
        except Exception:
            live_stats = {}

    return {
        "generated_at": datetime.now().isoformat(timespec="seconds"),
        "backtest_reports_dir": str(report_path),
        "backtests": backtests,
        "live": {
            "source": source or "all",
            "stats": live_stats,
            "strategies": _live_strategy_entries(live_stats),
        },
        "policy": {
            "approved": "Varsayilan/uretim adayi; yine de demo-forward izlenir.",
            "watchlist": "Pozitif edge; kucuk risk ve ileri test olmadan varsayilan yapma.",
            "rejected": "Canli otomatik islem icin blokla.",
            "insufficient_data": "Karar icin yeterli ornek yok.",
        },
    }
