"""Rule-based performance analysis over the trade journal.

Reads journal.stats() and the current configuration, then produces
Turkish-language suggestions plus concrete config fragments
("proposed_params") that the user can apply from the panel.
Pure rules, no external ML — v1 per SPEC.
"""

from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING, Any

from core.execution import source as execution_source
from core.logger import get_logger
from strategies import registry

if TYPE_CHECKING:  # avoid runtime import cycles; duck-typed at runtime
    from core.config import ConfigManager
    from core.journal import Journal

logger = get_logger(__name__)

# Rule thresholds (SPEC v1)
MIN_TRADES_OVERALL = 10
MIN_TRADES_SEGMENT = 10
MIN_TRADES_HOUR = 5
LOW_WIN_RATE_PCT = 40.0
LOSS_TO_WIN_RATIO = 1.5
MIN_LOSS_STREAK = 4

# Fallback strategy defaults (must match strategies/trend_momentum.py defaults)
_FALLBACK_ATR_SL_MULT = 1.5
_FALLBACK_ATR_TP_MULT = 2.5

_SEVERITY_ORDER = {"high": 0, "medium": 1, "info": 2}

_NO_DATA_TEXT = "Analiz için yeterli veri yok (en az 10 kapanmış işlem gerekli)."

_DIRECTION_TR = {"buy": "alış (buy)", "sell": "satış (sell)"}


def _deep_merge(base: dict, extra: dict) -> dict:
    """Recursively merge `extra` into `base` (in place) and return `base`."""
    for key, value in extra.items():
        if isinstance(value, dict) and isinstance(base.get(key), dict):
            _deep_merge(base[key], value)
        else:
            base[key] = value
    return base


def _as_float(value: Any, default: float = 0.0) -> float:
    try:
        result = float(value)
    except (TypeError, ValueError):
        return default
    # Reject NaN (NaN != NaN)
    if result != result:
        return default
    return result


def _as_int(value: Any, default: int = 0) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _win_rate_pct(segment: dict) -> float | None:
    """Win rate in percent (0..100) computed from wins/total when possible.

    Computing locally from the raw counters keeps this module independent of
    whether journal.stats() reports win_rate as a fraction or a percentage.
    """
    total = _as_int(segment.get("total"))
    wins = segment.get("wins")
    if total > 0 and wins is not None:
        return _as_int(wins) / total * 100.0
    raw = segment.get("win_rate")
    if raw is None:
        return None
    rate = _as_float(raw, default=-1.0)
    if rate < 0:
        return None
    # Heuristic fallback: values <= 1 are treated as fractions.
    return rate * 100.0 if rate <= 1.0 else rate


def _direction_tr(direction: str) -> str:
    return _DIRECTION_TR.get(str(direction).lower(), str(direction))


def _strategy_effective_params(name: str, overrides: Any) -> dict:
    """Return registered strategy defaults overlaid with config overrides."""
    params: dict = {}
    try:
        params.update(getattr(registry.get(name), "default_params", {}) or {})
    except Exception:
        pass
    if isinstance(overrides, dict):
        params.update(overrides)
    return params


def _logical_symbol_key(symbol: str, cfg: dict) -> str | None:
    """Map a broker symbol name (e.g. 'XAUUSDm') back to 'gold'/'btc'."""
    name = str(symbol).upper()
    symbols_cfg = cfg.get("symbols") or {}
    for key in ("gold", "btc"):
        configured = str(symbols_cfg.get(key) or "").upper()
        if configured and (name == configured or name.startswith(configured)):
            return key
    if "XAU" in name or "GOLD" in name:
        return "gold"
    if "BTC" in name:
        return "btc"
    return None


def _best_hour_range(bad_hours: set[int]) -> tuple[int, int] | None:
    """Longest contiguous block of hours 0..23 avoiding all bad hours."""
    best: tuple[int, int] | None = None
    start: int | None = None
    for hour in range(24):
        if hour in bad_hours:
            start = None
            continue
        if start is None:
            start = hour
        if best is None or (hour - start) > (best[1] - best[0]):
            best = (start, hour)
    return best


def _max_loss_streak(closed_trades: list[dict]) -> int:
    """Longest run of consecutive losing trades, chronological order.

    `closed_trades` comes from journal.trades() which is newest-first,
    so we iterate it reversed.
    """
    streak = 0
    best = 0
    for trade in reversed(closed_trades):
        profit = trade.get("profit")
        if profit is None:
            continue
        if _as_float(profit) < 0:
            streak += 1
            if streak > best:
                best = streak
        else:
            streak = 0
    return best


def _weakest_segment(stats: dict) -> tuple[str, float] | None:
    """Return (Turkish description, profit) of the most losing segment."""
    candidates: list[tuple[str, float]] = []
    for sym, seg in (stats.get("by_symbol") or {}).items():
        candidates.append((f"{sym} sembolü", _as_float(seg.get("total_profit"))))
    for direction, seg in (stats.get("by_direction") or {}).items():
        candidates.append(
            (f"{_direction_tr(direction)} yönü", _as_float(seg.get("total_profit")))
        )
    for name, seg in (stats.get("by_strategy") or {}).items():
        candidates.append((f"'{name}' stratejisi", _as_float(seg.get("total_profit"))))
    for key, seg in (stats.get("by_hour") or {}).items():
        hour = _as_int(key, default=-1)
        if 0 <= hour <= 23 and _as_int(seg.get("trades")) > 0:
            candidates.append((f"saat {hour:02d}:00", _as_float(seg.get("profit"))))
    losing = [c for c in candidates if c[1] < 0]
    if not losing:
        return None
    return min(losing, key=lambda c: c[1])


def _rule_weak_symbols(stats: dict, cfg: dict,
                       suggestions: list[dict], proposed: dict) -> None:
    for symbol, seg in (stats.get("by_symbol") or {}).items():
        seg_total = _as_int(seg.get("total"))
        if seg_total < MIN_TRADES_SEGMENT:
            continue
        win_rate = _win_rate_pct(seg)
        if win_rate is None or win_rate >= LOW_WIN_RATE_PCT:
            continue
        seg_profit = _as_float(seg.get("total_profit"))
        suggestions.append({
            "severity": "high",
            "text": (
                f"{symbol} sembolünde kazanma oranı %{win_rate:.1f} "
                f"({seg_total} işlem, toplam K/Z {seg_profit:.2f}) — bu sembolü "
                f"kapatmayı veya stratejiyi gözden geçirmeyi düşünün."
            ),
        })
        key = _logical_symbol_key(symbol, cfg)
        if key is not None:
            _deep_merge(proposed, {"symbols": {"enabled": {key: False}}})


def _rule_direction_imbalance(stats: dict, suggestions: list[dict]) -> None:
    for direction, seg in (stats.get("by_direction") or {}).items():
        seg_total = _as_int(seg.get("total"))
        if seg_total < MIN_TRADES_SEGMENT:
            continue
        win_rate = _win_rate_pct(seg)
        if win_rate is None or win_rate >= LOW_WIN_RATE_PCT:
            continue
        seg_profit = _as_float(seg.get("total_profit"))
        suggestions.append({
            "severity": "medium",
            "text": (
                f"{_direction_tr(direction).capitalize()} yönündeki işlemlerde "
                f"kazanma oranı %{win_rate:.1f} ({seg_total} işlem, toplam K/Z "
                f"{seg_profit:.2f}) — bu yöndeki sinyalleri filtrelemeyi veya "
                f"strateji koşullarını sıkılaştırmayı düşünün."
            ),
        })


def _rule_loss_win_ratio(stats: dict, active_strategy: str, strat_params: dict,
                         suggestions: list[dict], proposed: dict) -> None:
    if "atr_sl_mult" not in strat_params or "atr_tp_mult" not in strat_params:
        return
    avg_win = _as_float(stats.get("avg_win"))
    avg_loss = abs(_as_float(stats.get("avg_loss")))
    if avg_win <= 0 or avg_loss <= LOSS_TO_WIN_RATIO * avg_win:
        return
    ratio = avg_loss / avg_win
    cur_sl = _as_float(strat_params.get("atr_sl_mult"), _FALLBACK_ATR_SL_MULT)
    cur_tp = _as_float(strat_params.get("atr_tp_mult"), _FALLBACK_ATR_TP_MULT)
    new_tp = round(cur_tp + 0.5, 2)
    new_sl = round(max(0.8, cur_sl - 0.3), 2)
    param_fragment: dict = {"atr_tp_mult": new_tp}
    hint = f"atr_tp_mult {cur_tp:g} → {new_tp:g}"
    if new_sl < cur_sl:
        param_fragment["atr_sl_mult"] = new_sl
        hint += f", atr_sl_mult {cur_sl:g} → {new_sl:g}"
    suggestions.append({
        "severity": "medium",
        "text": (
            f"Ortalama zarar ({avg_loss:.2f}) ortalama kazancın ({avg_win:.2f}) "
            f"{ratio:.1f} katı — SL/TP oranı aleyhinize. ATR çarpanlarını "
            f"değiştirerek hedefi büyütüp stopu daraltmayı düşünün "
            f"(öneri: {hint})."
        ),
    })
    _deep_merge(
        proposed,
        {"strategy": {"params": {active_strategy: param_fragment}}},
    )


def _rule_bad_hours(stats: dict, active_strategy: str, strat_params: dict,
                    suggestions: list[dict], proposed: dict) -> None:
    bad: list[tuple[int, int, float]] = []
    for key, seg in (stats.get("by_hour") or {}).items():
        hour = _as_int(key, default=-1)
        if not 0 <= hour <= 23:
            continue
        trades = _as_int(seg.get("trades"))
        profit = _as_float(seg.get("profit"))
        if trades >= MIN_TRADES_HOUR and profit < 0:
            bad.append((hour, trades, profit))
    if not bad:
        return
    bad.sort(key=lambda item: item[0])
    hours_txt = ", ".join(
        f"{hour:02d}:00 ({profit:.2f}, {trades} işlem)"
        for hour, trades, profit in bad
    )
    total_bad = sum(profit for _, _, profit in bad)
    text = (
        f"Şu saatlerde sürekli zarar var: {hours_txt} — toplam {total_bad:.2f}. "
    )
    hour_range = _best_hour_range({hour for hour, _, _ in bad})
    supports_trade_hours = "trade_hours" in strat_params
    if supports_trade_hours and hour_range is not None and (hour_range[1] - hour_range[0]) < 23:
        trade_hours = f"{hour_range[0]}-{hour_range[1]}"
        text += (
            f"İşlem saatlerini '{trade_hours}' aralığıyla sınırlamak bu "
            f"saatleri dışarıda bırakır."
        )
        _deep_merge(
            proposed,
            {"strategy": {"params": {active_strategy: {"trade_hours": trade_hours}}}},
        )
    elif not supports_trade_hours:
        text += "Aktif strateji saat filtresi parametresi desteklemiyor; bu yalnizca izleme uyarisi olarak tutuldu."
    else:
        text += "Bu saatlerde işlem açmamak için işlem saatleri filtresi kullanılabilir."
    suggestions.append({"severity": "medium", "text": text})


def _rule_profit_factor(stats: dict, suggestions: list[dict]) -> None:
    raw = stats.get("profit_factor")
    if raw is None:
        return
    pf = _as_float(raw, default=-1.0)
    if pf < 0 or pf >= 1.0:
        return
    total_profit = _as_float(stats.get("total_profit"))
    text = (
        f"Genel profit factor {pf:.2f} (1'in altında) — strateji şu an "
        f"toplamda zarar ediyor (toplam K/Z {total_profit:.2f})."
    )
    weakest = _weakest_segment(stats)
    if weakest is not None:
        text += f" En zayıf segment: {weakest[0]} ({weakest[1]:.2f})."
    suggestions.append({"severity": "high", "text": text})


def _rule_loss_streak(journal: "Journal", cfg: dict,
                      suggestions: list[dict]) -> None:
    try:
        closed = journal.trades(
            limit=500, status="closed", source=execution_source(cfg)
        )
    except Exception as exc:  # pragma: no cover - defensive
        logger.warning("İşlem geçmişi okunamadı, seri analizi atlandı: %s", exc)
        return
    streak = _max_loss_streak(closed or [])
    if streak < MIN_LOSS_STREAK:
        return
    daily = (cfg.get("risk") or {}).get("daily_limit") or {}
    max_loss = _as_float(daily.get("max_loss"))
    text = (
        f"Geçmişte üst üste {streak} zararlı işlem var — günlük zarar "
        f"limitinin düşürülmesi düşünülebilir"
    )
    if max_loss > 0:
        text += f" (mevcut günlük maksimum zarar limiti: {max_loss:.2f})."
    else:
        text += " (günlük zarar limiti şu an devre dışı görünüyor)."
    suggestions.append({"severity": "medium", "text": text})


def analyze(journal: "Journal", config: "ConfigManager") -> dict:
    """Run all v1 rules over journal.stats() and return the analysis report.

    Return shape (SPEC):
    {"generated_at": iso, "stats": journal.stats(),
     "suggestions": [{"severity": "high"|"medium"|"info", "text": <Turkish>}...],
     "proposed_params": dict}
    """
    generated_at = datetime.now().isoformat(timespec="seconds")

    try:
        cfg = config.get() or {}
    except Exception as exc:  # pragma: no cover - defensive
        logger.error("Yapılandırma okunamadı: %s", exc)
        cfg = {}

    data_source = execution_source(cfg)
    try:
        stats = journal.stats(source=data_source) or {}
    except Exception as exc:  # pragma: no cover - defensive
        logger.error("İstatistikler alınamadı: %s", exc)
        stats = {}

    total = _as_int(stats.get("total"))
    if total < MIN_TRADES_OVERALL:
        return {
            "generated_at": generated_at,
            "source": data_source,
            "stats": stats,
            "suggestions": [{"severity": "info", "text": _NO_DATA_TEXT}],
            "proposed_params": {},
        }

    strategy_cfg = cfg.get("strategy") or {}
    active_strategy = str(strategy_cfg.get("active") or "trend_momentum")
    all_params = strategy_cfg.get("params") or {}
    strat_params = _strategy_effective_params(active_strategy, all_params.get(active_strategy))

    suggestions: list[dict] = []
    proposed: dict = {}

    try:
        _rule_weak_symbols(stats, cfg, suggestions, proposed)
        _rule_direction_imbalance(stats, suggestions)
        _rule_loss_win_ratio(stats, active_strategy, strat_params,
                             suggestions, proposed)
        _rule_bad_hours(stats, active_strategy, strat_params, suggestions, proposed)
        _rule_profit_factor(stats, suggestions)
        _rule_loss_streak(journal, cfg, suggestions)
    except Exception as exc:  # pragma: no cover - defensive
        logger.error("Analiz kuralları çalıştırılırken hata: %s", exc)
        suggestions.append({
            "severity": "info",
            "text": "Analiz sırasında bir hata oluştu, sonuçlar eksik olabilir.",
        })

    if not suggestions:
        win_rate = _win_rate_pct(stats)
        pf = _as_float(stats.get("profit_factor"), default=-1.0)
        summary_bits = [f"{total} kapanmış işlem"]
        if win_rate is not None:
            summary_bits.append(f"kazanma oranı %{win_rate:.1f}")
        if pf >= 0:
            summary_bits.append(f"profit factor {pf:.2f}")
        suggestions.append({
            "severity": "info",
            "text": (
                "Belirgin bir zayıflık tespit edilmedi (" +
                ", ".join(summary_bits) +
                "). Mevcut ayarlarla devam edilebilir."
            ),
        })

    suggestions.sort(key=lambda s: _SEVERITY_ORDER.get(s.get("severity"), 3))

    return {
        "generated_at": generated_at,
        "source": data_source,
        "stats": stats,
        "suggestions": suggestions,
        "proposed_params": proposed,
    }
