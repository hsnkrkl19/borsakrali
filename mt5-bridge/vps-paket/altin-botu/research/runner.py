from __future__ import annotations

import copy
import hashlib
import json
import math
from datetime import datetime, timezone
from pathlib import Path
from statistics import median
from typing import Any

import pandas as pd

from backtest.client import BacktestClient
from backtest.engine import Backtester, WARMUP_BARS
from backtest.validation import score as validation_score
from strategies import registry


TF_MINUTES = {
    "M1": 1, "M5": 5, "M15": 15, "M30": 30, "H1": 60,
    "H4": 240, "D1": 1440, "W1": 10080, "MN1": 43200,
}


def _write_json(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(payload, indent=2, ensure_ascii=False, default=str), encoding="utf-8")
    tmp.replace(path)


def _candidate_params(strategy, overrides: dict | None) -> list[dict]:
    """Small, explicit grids; every candidate is executable by the same live class."""
    base = strategy.merged_params(overrides or {})
    variants = [copy.deepcopy(base)]
    name = strategy.name
    if name == "gold_trend":
        for n_h1, buffer_atr in ((4, 0.10), (5, 0.20), (6, 0.15)):
            p = copy.deepcopy(base)
            p.update({"n_h1": n_h1, "stop_buffer_atr": buffer_atr})
            variants.append(p)
    elif name == "gold_scalp":
        for n_m15, fresh in ((4, 2), (5, 3), (6, 2)):
            p = copy.deepcopy(base)
            p.update({"n_m15": n_m15, "bos_fresh_bars": fresh})
            variants.append(p)
    elif name == "trend_momentum":
        for fast, slow, adx_min in ((9, 21, 18.0), (12, 26, 20.0), (9, 30, 22.0)):
            p = copy.deepcopy(base)
            p.update({"entry_ema_fast": fast, "entry_ema_slow": slow, "adx_min": adx_min})
            variants.append(p)
    elif name == "donchian_atr_breakout":
        for channel, sl_mult, tp_mult in ((30, 1.8, 2.7), (55, 2.0, 3.0), (80, 2.2, 3.3)):
            p = copy.deepcopy(base)
            p.update({"channel_period": channel, "atr_sl_mult": sl_mult, "atr_tp_mult": tp_mult})
            variants.append(p)
    elif name == "rsi_bollinger_reversion":
        for period, std, rsi_buy, rsi_sell in ((20, 2.0, 32, 68), (30, 2.2, 30, 70), (20, 2.5, 28, 72)):
            p = copy.deepcopy(base)
            p.update({"bb_period": period, "bb_std": std, "rsi_buy_max": rsi_buy, "rsi_sell_min": rsi_sell})
            variants.append(p)
    unique: dict[str, dict] = {}
    for params in variants:
        key = json.dumps(params, sort_keys=True, default=str)
        unique[key] = params
    return list(unique.values())


def _timeframes(strategy, params: dict) -> list[str]:
    out = {str(strategy.entry_timeframe(params))}
    for key, value in strategy.merged_params(params).items():
        if str(key).startswith("tf_") and str(value) in TF_MINUTES:
            out.add(str(value))
    return sorted(out, key=lambda tf: TF_MINUTES.get(tf, 15))


def _bar_count(tf: str, years: float) -> int:
    per_year = 365.25 * 24 * 60 / TF_MINUTES.get(tf, 60)
    desired = int(per_year * max(0.5, years)) + 1000
    cap = 30_000 if TF_MINUTES.get(tf, 60) < 60 else 40_000
    return max(1500, min(desired, cap))


def _load_history(mt5c, symbol: str, timeframes: list[str], years: float) -> dict[str, pd.DataFrame]:
    history: dict[str, pd.DataFrame] = {}
    for tf in timeframes:
        frame = mt5c.get_rates(symbol, tf, _bar_count(tf, years))
        if frame is not None and len(frame) >= 350:
            frame = frame.sort_values("time").drop_duplicates("time").reset_index(drop=True)
            history[tf] = frame
    return history


def _run_window(
    mt5c,
    symbol: str,
    strategy,
    params: dict,
    history: dict[str, pd.DataFrame],
    start,
    end,
    risk_percent: float,
    *,
    spread_points: float | None = None,
    slippage_points: float = 1.0,
    commission_per_lot_side: float = 3.5,
) -> dict:
    client = BacktestClient(mt5c, symbol)
    for tf, frame in history.items():
        visible = frame[frame["time"] <= end].copy()
        if len(visible):
            client.preload(tf, visible)
    entry_tf = str(strategy.entry_timeframe(params))
    if entry_tf not in history:
        raise ValueError(f"{symbol} {entry_tf} verisi yok")
    backtester = Backtester(
        strategy,
        client,
        symbol,
        params,
        start_equity=10_000.0,
        risk_percent=risk_percent,
        spread_points=spread_points,
        decision_start=pd.Timestamp(start),
        decision_end=pd.Timestamp(end),
        slippage_points_per_side=slippage_points,
        commission_per_lot_per_side=commission_per_lot_side,
    )
    return backtester.run(entry_tf)


def _quality(metrics: dict) -> float:
    return float(
        validation_score(metrics)
        + max(-20.0, min(20.0, float(metrics.get("total_return_pct", 0.0))))
        - 0.5 * float(metrics.get("max_drawdown_pct", 0.0))
    )


def _fingerprint(history: dict[str, pd.DataFrame]) -> str:
    digest = hashlib.sha256()
    for tf in sorted(history):
        digest.update(tf.encode())
        digest.update(pd.util.hash_pandas_object(history[tf], index=True).values.tobytes())
    return digest.hexdigest()


def research_one(mt5c, cfg: dict, symbol_key: str, symbol: str, strategy_name: str) -> dict:
    strategy = registry.get(strategy_name)
    if strategy.symbols is not None and symbol_key not in strategy.symbols:
        raise ValueError("Strateji bu sembolü desteklemiyor")
    configured = (((cfg.get("strategy") or {}).get("params") or {}).get(strategy_name) or {})
    candidates = _candidate_params(strategy, configured)
    all_tfs = sorted({tf for p in candidates for tf in _timeframes(strategy, p)}, key=lambda tf: TF_MINUTES.get(tf, 15))
    rcfg = cfg.get("research") or {}
    history = _load_history(mt5c, symbol, all_tfs, float(rcfg.get("years", 3.0) or 3.0))
    entry_tf = str(strategy.entry_timeframe(candidates[0]))
    if entry_tf not in history:
        raise ValueError(f"Yeterli {entry_tf} verisi yok")
    entry = history[entry_tf]
    times = pd.to_datetime(entry["time"]).reset_index(drop=True)
    n = len(times)
    if n < 1800:
        raise ValueError(f"Walk-forward için veri az: {n} bar")

    holdout_fraction = float(rcfg.get("final_holdout_fraction", 0.20) or 0.20)
    holdout_index = int(n * (1.0 - holdout_fraction))
    gap = int(rcfg.get("gap_bars", 24) or 24)
    folds_requested = max(3, int(rcfg.get("folds", 3) or 3))
    min_train = max(900, WARMUP_BARS * 3)
    available = holdout_index - min_train - gap
    test_size = max(240, available // (folds_requested + 1))
    folds: list[dict[str, Any]] = []

    for fold_no in range(folds_requested):
        train_end = min_train + fold_no * test_size
        test_start = train_end + gap
        test_end = min(test_start + test_size - 1, holdout_index - 1)
        if test_end <= test_start:
            continue
        val_end = train_end - gap - 1
        val_start = max(WARMUP_BARS, val_end - test_size + 1)
        scored = []
        for params in candidates:
            result = _run_window(
                mt5c, symbol, strategy, params, history,
                times.iloc[val_start], times.iloc[val_end],
                risk_percent=0.25,
            )
            scored.append({"params": params, "score": _quality(result["metrics"]), "metrics": result["metrics"]})
        scored.sort(key=lambda row: row["score"], reverse=True)
        winner = scored[0]
        oos = _run_window(
            mt5c, symbol, strategy, winner["params"], history,
            times.iloc[test_start], times.iloc[test_end],
            risk_percent=0.25,
        )
        folds.append({
            "fold": fold_no + 1,
            "validation_start": times.iloc[val_start].isoformat(),
            "validation_end": times.iloc[val_end].isoformat(),
            "test_start": times.iloc[test_start].isoformat(),
            "test_end": times.iloc[test_end].isoformat(),
            "gap_bars": gap,
            "selected_params": winner["params"],
            "inner_score": winner["score"],
            "oos_score": _quality(oos["metrics"]),
            "oos_metrics": oos["metrics"],
        })

    if len(folds) < 3:
        raise ValueError("En az üç walk-forward fold üretilemedi")

    final_val_end = holdout_index - gap - 1
    final_val_start = max(WARMUP_BARS, final_val_end - test_size + 1)
    final_scored = []
    for params in candidates:
        result = _run_window(
            mt5c, symbol, strategy, params, history,
            times.iloc[final_val_start], times.iloc[final_val_end],
            risk_percent=0.25,
        )
        final_scored.append({"params": params, "score": _quality(result["metrics"]), "metrics": result["metrics"]})
    final_scored.sort(key=lambda row: row["score"], reverse=True)
    selected = final_scored[0]
    holdout = _run_window(
        mt5c, symbol, strategy, selected["params"], history,
        times.iloc[holdout_index], times.iloc[-1], risk_percent=0.25,
    )
    development_spread = pd.to_numeric(entry.loc[: holdout_index - 1, "spread"], errors="coerce").dropna()
    median_spread = float(development_spread.median()) if len(development_spread) else 0.0
    double_spread = _run_window(
        mt5c, symbol, strategy, selected["params"], history,
        times.iloc[holdout_index], times.iloc[-1], risk_percent=0.25,
        spread_points=max(0.0, median_spread * 2.0),
    )

    profitable_fraction = sum(float(f["oos_metrics"].get("total_return_pct", 0.0)) > 0 for f in folds) / len(folds)
    total_oos_trades = sum(int(f["oos_metrics"].get("total", 0)) for f in folds)
    median_oos_score = float(median([float(f["oos_score"]) for f in folds]))
    median_inner_score = float(median([float(f["inner_score"]) for f in folds]))
    checks = {
        "profitable_fold_fraction": {
            "pass": profitable_fraction >= float(rcfg.get("min_profitable_fold_fraction", 0.67)),
            "value": profitable_fraction,
            "threshold": float(rcfg.get("min_profitable_fold_fraction", 0.67)),
        },
        "minimum_oos_trades": {
            "pass": total_oos_trades >= int(rcfg.get("minimum_oos_trades", 12)),
            "value": total_oos_trades,
            "threshold": int(rcfg.get("minimum_oos_trades", 12)),
        },
        "holdout_profit_factor": {
            "pass": float(holdout["metrics"].get("profit_factor", 0.0)) >= float(rcfg.get("min_holdout_profit_factor", 1.05)),
            "value": float(holdout["metrics"].get("profit_factor", 0.0)),
            "threshold": float(rcfg.get("min_holdout_profit_factor", 1.05)),
        },
        "holdout_drawdown": {
            "pass": float(holdout["metrics"].get("max_drawdown_pct", 999.0)) <= float(rcfg.get("max_holdout_drawdown_pct", 10.0)),
            "value": float(holdout["metrics"].get("max_drawdown_pct", 999.0)),
            "threshold": float(rcfg.get("max_holdout_drawdown_pct", 10.0)),
        },
        "double_spread_return": {
            "pass": float(double_spread["metrics"].get("total_return_pct", 0.0)) > 0 if bool(rcfg.get("double_spread_must_profit", True)) else True,
            "value": float(double_spread["metrics"].get("total_return_pct", 0.0)),
            "threshold": "> 0",
        },
        "selection_overfit_gap": {
            "pass": (median_inner_score - median_oos_score) <= 25.0,
            "value": median_inner_score - median_oos_score,
            "threshold": 25.0,
        },
    }
    return {
        "schema_version": 1,
        "kind": "mt5_demo_challenger",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "symbol_key": symbol_key,
        "symbol": symbol,
        "strategy": strategy_name,
        "params": selected["params"],
        "entry_timeframe": entry_tf,
        "data_start": times.iloc[0].isoformat(),
        "data_end": times.iloc[-1].isoformat(),
        "holdout_start": times.iloc[holdout_index].isoformat(),
        "data_fingerprint": _fingerprint(history),
        "folds": folds,
        "fold_summary": {
            "count": len(folds),
            "profitable_fraction": profitable_fraction,
            "total_oos_trades": total_oos_trades,
            "median_oos_score": median_oos_score,
            "median_inner_score": median_inner_score,
        },
        "holdout_metrics": holdout["metrics"],
        "double_spread_metrics": double_spread["metrics"],
        "gates": {"all_pass": all(item["pass"] for item in checks.values()), "checks": checks},
        "approval": None,
        "execution_scope": "mt5_demo_only",
    }


def run_research(mt5c, config_manager, out_root: Path = Path("data/research")) -> dict:
    cfg = config_manager.get()
    resolved = mt5c.resolve_symbols() or {}
    strategy_cfg = cfg.get("strategy") or {}
    verified = strategy_cfg.get("verified_assignments") or {}
    candidates_cfg = strategy_cfg.get("candidate_assignments") or {}
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    run_dir = out_root / "runs" / stamp
    rows = []
    failures = []
    universe = list((cfg.get("research") or {}).get("universe") or ["gold", "btc"])
    for symbol_key in universe:
        symbol = resolved.get(symbol_key)
        if not symbol:
            failures.append({"symbol_key": symbol_key, "error": "Broker sembolü çözümlenemedi"})
            continue
        names = list(dict.fromkeys(list(verified.get(symbol_key) or []) + list(candidates_cfg.get(symbol_key) or [])))
        for strategy_name in names:
            try:
                candidate = research_one(mt5c, cfg, symbol_key, symbol, strategy_name)
                path = run_dir / f"{symbol_key}-{strategy_name}.json"
                _write_json(path, candidate)
                candidate["manifest_path"] = str(path.resolve())
                rows.append(candidate)
            except Exception as exc:
                failures.append({"symbol_key": symbol_key, "symbol": symbol, "strategy": strategy_name, "error": f"{type(exc).__name__}: {exc}"})
    rows.sort(
        key=lambda row: (
            bool(row["gates"]["all_pass"]),
            float(row["fold_summary"]["median_oos_score"]),
            float(row["holdout_metrics"].get("total_return_pct", 0.0)),
        ),
        reverse=True,
    )
    latest = {
        "run_id": stamp,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "mode": "MT5_DEMO_RESEARCH",
        "disclaimer": "Backtest sonucu kârlılık garantisi değildir; yalnızca gate-passing challenger panelden onaylanabilir.",
        "candidates": rows,
        "failures": failures,
    }
    _write_json(run_dir / "summary.json", latest)
    _write_json(out_root / "latest.json", latest)
    return latest
