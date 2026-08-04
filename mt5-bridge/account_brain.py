#!/usr/bin/env python3
"""Deterministic, account-wide pre-trade risk brain.

The module is deliberately pure/stdlib-only and never sends an order, calls an
LLM, or performs network I/O.  MT5 bridges translate their data into the small
dataclasses below, call :func:`evaluate_pretrade` (or the process-safe
``AccountBrain.evaluate_and_reserve`` wrapper), and execute only the returned
plan.  A ``close_and_reverse`` result is one atomic plan: all listed tickets
must be confirmed closed before the proposed entry may be sent.
"""

from __future__ import annotations

import copy
import json
import math
import os
import re
import time
import uuid
from contextlib import contextmanager
from dataclasses import dataclass, field, replace
from enum import Enum
from pathlib import Path
from typing import Any, Callable, Mapping, Sequence


ACCOUNT_TIERS = (10_000, 25_000, 50_000, 100_000, 200_000)
LIVE_ORDER_AUTHORITY = False


class Direction(str, Enum):
    BUY = "buy"
    SELL = "sell"

    @classmethod
    def parse(cls, value: "Direction | str") -> "Direction":
        if isinstance(value, cls):
            return value
        text = str(value).strip().lower()
        if text in {"buy", "long"}:
            return cls.BUY
        if text in {"sell", "short"}:
            return cls.SELL
        raise ValueError("direction must be buy/long or sell/short")


class DecisionAction(str, Enum):
    ALLOW = "allow"
    REJECT = "reject"
    CLOSE_AND_REVERSE = "close_and_reverse"
    FLATTEN_ALL = "flatten_all"
    STOP_PROFIT_TARGET = "stop_profit_target"


@dataclass(frozen=True)
class BrainConfig:
    """Validated policy. Percentages are account-equity percentages."""

    risk_profile: str = "balanced"
    aggressive_opt_in: bool = False
    # YARIŞ MODU (kullanıcı, 2026-07-30): giriş kısıtı YOK — aynı underlying'de
    # çoklu pozisyon ve hedge serbest, sembol/bot/portföy tavanları atlanır.
    # Kalanlar: işlem-başı boyutlama, $15 tabanları, 3R hedef politikası ve
    # hesap frenleri (günlük/toplam zarar + kâr hedefi) = tutarlılık + kâr kontrolü.
    race_mode: bool = False
    trade_risk_pct: float | None = None
    max_portfolio_risk_pct: float = 1.5
    max_open_risk_pct: float = 1.5
    hard_max_open_risk_pct: float = 2.0
    max_symbol_side_risk_pct: float = 0.5
    max_bot_risk_pct: float = 0.5
    daily_entry_brake_pct: float = 1.5
    daily_loss_warning_pct_account: float = 4.0
    daily_loss_flatten_pct_account: float = 4.25
    max_daily_loss_pct_account: float = 4.5
    total_drawdown_warning_pct_account: float = 9.0
    total_drawdown_flatten_pct_account: float = 9.25
    max_total_drawdown_pct_account: float = 9.5
    profit_target_pct_account: float = 10.0
    min_expected_profit_usd: float = 15.0
    min_initial_risk_usd: float = 15.0
    # ISLEM BASINA MUTLAK DOLAR RISK TAVANI (kullanici karari 2026-07-31: 250 $).
    # Yuzde hesabi ne derse desin bu tavani ASAMAZ. Buyuk hesapta yuzde tek
    # basina devasa lot uretiyordu: 197k x %0.25 = 492 $/islem -> lot surekli
    # 1.00 tavanina dayaniyor, altin/kripto tek islemde -400 $ yaziyordu.
    # Ayrica bu tavan enstrumanlar arasi dolar-riskini de esitler: lot,
    # tavan/stop-mesafesi oraniyla kucultuldugu icin 1 lot altin ile 1 lot
    # EURUSD ayni riski tasir.
    max_trade_risk_usd: float = 250.0
    # YARIS MODU TOPLAM ACIK RISK TAVANI (kullanici karari D3, 2026-07-31).
    # Yaris giris SAYISINI serbest birakir ama hesabin toplam acik riskini
    # sinirsiz birakamaz: 2026-07-31'de 20+ pozisyon neredeyse tamami ayni
    # yondeydi; piyasa donunce hepsi birden kaybetti. Tavana gelince yeni
    # girisler BEKLEMEYE alinir (mevcutlar yonetilmeye devam eder).
    race_max_open_risk_pct: float = 3.0
    # D2g — REJIM FARKINDALIGI: gun ici gerceklesen zarar bu esigi asinca YENI
    # girislerin riski YARIYA iner. Bu bir FREN degil KISICI'dir; mutlak %4,5
    # gunluk fren ve %1,5 giris freni aynen yerinde kalir. Amac: kotu bir gunde
    # sistemin kendini kucultmesi, ayni boyutta israr edip cukuru derinlestirmemesi.
    risk_halving_daily_loss_pct: float = 0.75
    risk_halving_factor: float = 0.5
    min_rr: float = 3.0
    min_feed_rr: float = 1.5
    target_strong_signal: float = 0.75
    target_extreme_signal: float = 0.90
    reversal_confirmation_min: float = 0.85
    reversal_hysteresis: float = 0.15
    reversal_confirmations: int = 2
    reversal_observation_window_seconds: float = 30.0
    reversal_cooldown_seconds: float = 15.0
    heartbeat_max_age_seconds: float = 10.0
    reservation_ttl_seconds: float = 120.0
    profit_giveback_activation_r: float = 1.0
    max_profit_giveback_fraction: float = 0.25
    volatility_exit_multiple: float = 2.0
    volatility_adverse_r: float = 0.25

    def __post_init__(self) -> None:
        profile = str(self.risk_profile).strip().lower()
        if profile not in {"balanced", "aggressive"}:
            raise ValueError("risk_profile must be balanced or aggressive")
        object.__setattr__(self, "risk_profile", profile)
        risk = self.trade_risk_pct
        if profile == "balanced":
            risk = 0.25 if risk is None else float(risk)
            if not 0.10 <= risk <= 0.25:
                raise ValueError("balanced trade_risk_pct must be 0.10..0.25")
        else:
            if not self.aggressive_opt_in:
                raise ValueError("aggressive profile requires aggressive_opt_in=true")
            risk = 0.50 if risk is None else float(risk)
            if not 0.50 <= risk <= 1.00:
                raise ValueError("aggressive trade_risk_pct must be 0.50..1.00")
        object.__setattr__(self, "trade_risk_pct", risk)
        if not 0 < self.max_symbol_side_risk_pct <= 0.5:
            raise ValueError("symbol+side hard cap cannot exceed 0.5%")
        if not 0 < self.max_bot_risk_pct <= 0.5:
            raise ValueError("bot hard cap cannot exceed 0.5%")
        if not 0 < self.max_portfolio_risk_pct <= 2.0:
            raise ValueError("portfolio risk must be in (0, 2]")
        if not 0 < self.max_open_risk_pct <= self.hard_max_open_risk_pct <= 2.0:
            raise ValueError("open risk must be positive and hard-capped at 2%")
        if not (0 < self.daily_loss_warning_pct_account
                < self.daily_loss_flatten_pct_account
                < self.max_daily_loss_pct_account <= 4.5):
            raise ValueError("daily warning < flatten < hard ceiling <= 4.5 required")
        if not 0 < self.daily_entry_brake_pct <= 1.5:
            raise ValueError("daily entry brake must be in (0, 1.5]")
        if not (0 < self.total_drawdown_warning_pct_account
                < self.total_drawdown_flatten_pct_account
                < self.max_total_drawdown_pct_account <= 9.5):
            raise ValueError("drawdown warning < flatten < hard ceiling <= 9.5 required")
        if self.profit_target_pct_account != 10.0:
            raise ValueError("profit target is fixed at 10%")
        if self.min_expected_profit_usd < 15 or self.min_initial_risk_usd < 15:
            raise ValueError("entry TP and initial-risk dollar floors cannot be below $15")
        if not _finite_positive(self.max_trade_risk_usd):
            raise ValueError("max_trade_risk_usd must be finite and positive")
        if self.max_trade_risk_usd < self.min_initial_risk_usd:
            raise ValueError("max_trade_risk_usd cannot be below min_initial_risk_usd")
        if not 0 < self.race_max_open_risk_pct <= 10.0:
            raise ValueError("race_max_open_risk_pct must be in (0, 10]")
        # Kisici, giris freninden ONCE devreye girmeli; sonra girerse hicbir ise
        # yaramaz (o noktada zaten hicbir yeni giris yok).
        if not 0 < self.risk_halving_daily_loss_pct < self.daily_entry_brake_pct:
            raise ValueError("risk_halving_daily_loss_pct must be in (0, daily_entry_brake_pct)")
        if not 0 < self.risk_halving_factor < 1.0:
            raise ValueError("risk_halving_factor must be in (0, 1)")
        if float(self.min_rr) not in {3.0, 4.0, 5.0}:
            raise ValueError("min_rr must be 3, 4 or 5")
        if not 0.0 <= self.min_feed_rr <= 3.0:
            raise ValueError("min_feed_rr must be in [0, 3]")
        if not 0.5 <= self.target_strong_signal < self.target_extreme_signal <= 1.0:
            raise ValueError("target signal thresholds must satisfy 0.5 <= strong < extreme <= 1")
        if not 0 <= self.reversal_hysteresis < 1:
            raise ValueError("reversal_hysteresis must be in [0,1)")
        if not 0 < self.reversal_confirmation_min <= 1:
            raise ValueError("reversal_confirmation_min must be in (0,1]")
        if self.reversal_confirmations < 1:
            raise ValueError("reversal_confirmations must be positive")
        if min(self.reversal_cooldown_seconds, self.reversal_observation_window_seconds,
               self.heartbeat_max_age_seconds,
               self.reservation_ttl_seconds) <= 0:
            raise ValueError("cooldown, heartbeat age and reservation TTL must be positive")
        if self.profit_giveback_activation_r <= 0:
            raise ValueError("profit_giveback_activation_r must be positive")
        if not 0 < self.max_profit_giveback_fraction < 1:
            raise ValueError("max_profit_giveback_fraction must be in (0,1)")
        if self.volatility_exit_multiple <= 1 or self.volatility_adverse_r < 0:
            raise ValueError("invalid volatility exit policy")


@dataclass(frozen=True)
class AccountSnapshot:
    balance: float
    equity: float
    start_balance: float
    day_start_equity: float
    high_water_equity: float
    mt5_ok: bool = True
    account_ok: bool = True
    positions_ok: bool = True
    deals_ok: bool = True
    trading_allowed: bool = True
    as_of: float = field(default_factory=time.time)


@dataclass(frozen=True)
class OpenRisk:
    ticket: str
    bot_id: str
    symbol: str
    direction: Direction | str
    timeframe: str
    risk_usd: float
    signal_strength: float = 0.5
    underlying: str | None = None

    def __post_init__(self) -> None:
        object.__setattr__(self, "direction", Direction.parse(self.direction))

    @property
    def asset(self) -> str:
        return canonical_underlying(self.underlying or self.symbol)


@dataclass(frozen=True)
class SymbolSpec:
    tick_size: float
    tick_value: float
    volume_min: float
    volume_step: float
    volume_max: float


@dataclass(frozen=True)
class TradeRequest:
    candidate_id: str
    bot_id: str
    symbol: str
    direction: Direction | str
    timeframe: str
    entry: float
    stop: float
    target: float
    signal_strength: float
    confirmations: int
    now_ts: float = field(default_factory=time.time)
    underlying: str | None = None

    def __post_init__(self) -> None:
        object.__setattr__(self, "direction", Direction.parse(self.direction))

    @property
    def asset(self) -> str:
        return canonical_underlying(self.underlying or self.symbol)


@dataclass(frozen=True)
class RuntimeState:
    last_reversal_at: Mapping[str, float] = field(default_factory=dict)


@dataclass(frozen=True)
class PreTradeDecision:
    allowed: bool
    action: DecisionAction
    reasons: tuple[str, ...]
    tier: int | None = None
    lot: float = 0.0
    risk_usd: float = 0.0
    reward_usd: float = 0.0
    rr: float = 0.0
    target: float = 0.0
    target_r: float = 0.0
    close_tickets: tuple[str, ...] = ()
    projected: Mapping[str, float] = field(default_factory=dict)
    reservation_id: str | None = None

    @property
    def requires_atomic_execution(self) -> bool:
        return self.action == DecisionAction.CLOSE_AND_REVERSE


class ExitAction(str, Enum):
    HOLD = "hold"
    EXIT = "exit"
    EXIT_FOR_CONFIRMED_REVERSAL = "exit_for_confirmed_reversal"


@dataclass(frozen=True)
class ExitContext:
    """Inputs maintained by a bridge; all money fields are net USD values."""

    ticket: str
    initial_risk_usd: float
    current_profit_usd: float
    peak_profit_usd: float
    baseline_volatility: float
    current_volatility: float
    original_signal_strength: float = 0.5
    opposing_signal_strength: float = 0.0
    opposing_confirmations: int = 0
    seconds_since_last_reversal: float = math.inf
    market_data_ok: bool = True


@dataclass(frozen=True)
class ExitDecision:
    action: ExitAction
    reasons: tuple[str, ...]
    metrics: Mapping[str, float] = field(default_factory=dict)

    @property
    def should_exit(self) -> bool:
        return self.action != ExitAction.HOLD


def decide_exit(context: ExitContext, config: BrainConfig,
                force_flatten: bool = False) -> ExitDecision:
    """Deterministic exit policy; emergency exits are exempt from the $15 entry floor.

    This function only recommends closing the current ticket.  Even a confirmed
    reversal must pass ``evaluate_pretrade`` again before the opposite order is
    opened, preserving the one-underlying invariant and the atomic close plan.
    """
    if force_flatten:
        return ExitDecision(ExitAction.EXIT, ("account_force_flatten",))
    values = (context.initial_risk_usd, context.current_profit_usd,
              context.peak_profit_usd, context.baseline_volatility,
              context.current_volatility, context.original_signal_strength,
              context.opposing_signal_strength, context.seconds_since_last_reversal)
    if (not context.market_data_ok or not all(math.isfinite(float(x)) for x in values)
            or context.initial_risk_usd <= 0 or context.baseline_volatility <= 0
            or context.current_volatility < 0
            or not 0 <= context.original_signal_strength <= 1
            or not 0 <= context.opposing_signal_strength <= 1):
        return ExitDecision(ExitAction.HOLD, ("fail_closed:invalid_exit_market_data",))
    peak = max(context.peak_profit_usd, context.current_profit_usd, 0.0)
    current_r = context.current_profit_usd / context.initial_risk_usd
    peak_r = peak / context.initial_risk_usd
    giveback = (peak - context.current_profit_usd) / peak if peak > 0 else 0.0
    volatility_ratio = context.current_volatility / context.baseline_volatility
    metrics = {"current_r": current_r, "peak_r": peak_r,
               "profit_giveback_fraction": giveback,
               "volatility_ratio": volatility_ratio}
    if (peak_r >= config.profit_giveback_activation_r
            and giveback >= config.max_profit_giveback_fraction):
        return ExitDecision(ExitAction.EXIT, ("peak_profit_giveback",), metrics)
    if (volatility_ratio >= config.volatility_exit_multiple
            and current_r <= config.volatility_adverse_r):
        return ExitDecision(ExitAction.EXIT, ("adverse_volatility_expansion",), metrics)
    if (context.opposing_signal_strength >= config.reversal_confirmation_min
            and context.opposing_confirmations >= config.reversal_confirmations
            and context.opposing_signal_strength - context.original_signal_strength
            >= config.reversal_hysteresis
            and context.seconds_since_last_reversal >= config.reversal_cooldown_seconds):
        return ExitDecision(ExitAction.EXIT_FOR_CONFIRMED_REVERSAL,
                            ("confirmed_reversal_exit_only",), metrics)
    return ExitDecision(ExitAction.HOLD, ("no_exit_trigger",), metrics)


def select_account_tier(balance: float) -> int:
    """Return the nearest supported nominal tier; midpoint ties go upward."""
    if not _finite_positive(balance):
        raise ValueError("balance must be finite and positive")
    return min(ACCOUNT_TIERS, key=lambda tier: (abs(tier - balance), -tier))


def canonical_underlying(symbol: str) -> str:
    """Collapse common broker aliases/suffixes; timeframe is intentionally ignored."""
    raw = str(symbol).strip().upper()
    base = re.split(r"[._#\s]", raw, maxsplit=1)[0].replace("/", "").replace("-", "")
    for suffix in ("PRO", "RAW", "ECN"):
        if base.endswith(suffix) and len(base) > len(suffix) + 2:
            base = base[:-len(suffix)]
    # Common broker suffix without a separator: EURUSDm / XAUUSDm / BTCUSDm.
    if len(base) == 7 and base[-1] in {"M", "C", "R", "S"} and base[:6].isalpha():
        base = base[:6]
    if base.startswith("GOLD"):
        base = "GOLD"
    aliases = {
        "XBTUSD": "BTCUSD", "BTCUSDT": "BTCUSD",
        "USTEC": "NAS100", "US100": "NAS100", "NDX": "NAS100",
        "SPX500": "SP500", "US500": "SP500", "S&P500": "SP500",
        "DE40": "DAX40", "GER40": "DAX40", "GOLD": "XAUUSD",
    }
    return aliases.get(base, base)


def required_target_multiple(config: BrainConfig, signal_strength: float) -> float:
    """User policy: every entry targets at least 3R; strong signals 4R, extreme 5R."""
    multiple = 3.0
    if signal_strength >= config.target_strong_signal:
        multiple = 4.0
    if signal_strength >= config.target_extreme_signal:
        multiple = 5.0
    return max(multiple, float(config.min_rr))


def effective_target(request: TradeRequest, config: BrainConfig) -> tuple[float, float]:
    """Return (target, r_multiple) after extending a too-close feed target.

    A feed target beyond the required multiple is kept (more reward, never
    less); a closer one is pushed out so the position always risks 1 to make
    at least the score-based multiple.  The stop is never moved here.
    """
    required = required_target_multiple(config, request.signal_strength)
    risk_dist = abs(request.entry - request.stop)
    if risk_dist <= 0:
        return request.target, 0.0
    if request.direction == Direction.BUY:
        target = max(request.target, request.entry + risk_dist * required)
    else:
        target = min(request.target, request.entry - risk_dist * required)
    return target, abs(target - request.entry) / risk_dist


def heartbeat_ok(path: str | os.PathLike[str], max_age_seconds: float,
                 now_ts: float | None = None) -> bool:
    """Fail-closed validation of the external central-daemon heartbeat JSON."""
    try:
        with open(path, "r", encoding="utf-8-sig") as fh:
            value = json.load(fh)
        stamp = float(value["timeSec"])
        now = time.time() if now_ts is None else float(now_ts)
        age = now - stamp
        return value.get("ok") is True and -2.0 <= age <= float(max_age_seconds)
    except (OSError, ValueError, TypeError, KeyError, json.JSONDecodeError):
        return False


def evaluate_pretrade(snapshot: AccountSnapshot | None,
                      positions: Sequence[OpenRisk], request: TradeRequest,
                      spec: SymbolSpec, config: BrainConfig,
                      runtime: RuntimeState | None = None,
                      advisory_scale: float = 1.0) -> PreTradeDecision:
    """Return one complete deterministic lot/risk/underlying entry decision."""
    runtime = runtime or RuntimeState()
    bad_health = _snapshot_error(snapshot)
    if bad_health:
        return _reject("fail_closed:" + bad_health)
    assert snapshot is not None
    tier = select_account_tier(snapshot.start_balance)
    guard = _account_guard(snapshot, config, tier)
    if guard is not None:
        return guard
    request_error = _request_error(request, spec)
    if request_error:
        return _reject(request_error, tier)
    # TP policy: never closer than the score-based multiple (3R / 4R / 5R).
    # Anti-chase floor first: when the feed's own target offers almost no room
    # (price already ran / degenerate signal), extending would invent a target
    # the signal engine never predicted — reject instead of fabricating.
    feed_risk_dist = abs(request.entry - request.stop)
    feed_r = (abs(request.target - request.entry) / feed_risk_dist
              if feed_risk_dist > 0 else 0.0)
    if feed_r + 1e-9 < config.min_feed_rr:
        return _reject("feed_target_too_close_to_extend", tier)
    extended_target, target_r = effective_target(request, config)
    if extended_target != request.target:
        request = replace(request, target=extended_target)
        # An extended target must remain a representable broker price with
        # valid geometry (a wide SELL stop can push it to zero or below).
        extended_error = _request_error(request, spec)
        if extended_error:
            return _reject("extended_target_not_representable:" + extended_error,
                           tier)
    for position in positions:
        if (not _finite_nonnegative(position.risk_usd) or not position.bot_id
                or not 0 <= position.signal_strength <= 1):
            return _reject("fail_closed:invalid_open_position_risk", tier)

    if config.race_mode:
        same_asset, same_side, opposite = [], [], []
    else:
        same_asset = [p for p in positions if p.asset == request.asset]
        same_side = [p for p in same_asset if p.direction == request.direction]
        opposite = [p for p in same_asset if p.direction != request.direction]
    if same_side:
        return _reject("same_underlying_already_open_across_timeframes", tier)
    if opposite:
        strongest_old = max(p.signal_strength for p in opposite)
        if request.signal_strength < config.reversal_confirmation_min:
            return _reject("reversal_confirmation_too_weak", tier)
        if request.confirmations < config.reversal_confirmations:
            return _reject("reversal_confirmation_count_too_low", tier)
        if request.signal_strength - strongest_old < config.reversal_hysteresis:
            return _reject("reversal_hysteresis_not_met", tier)
        last = runtime.last_reversal_at.get(request.asset)
        if last is not None and request.now_ts - float(last) < config.reversal_cooldown_seconds:
            return _reject("reversal_cooldown_active", tier)

    # A valid atomic reversal removes its old side before projected-risk math.
    retained = [p for p in positions if p not in opposite]
    equity = snapshot.equity
    current_symbol = sum(p.risk_usd for p in retained
                         if p.asset == request.asset and p.direction == request.direction)
    current_bot = sum(p.risk_usd for p in retained if p.bot_id == request.bot_id)
    current_account = sum(p.risk_usd for p in retained)
    if config.race_mode:
        # Yarış: yalnız işlem-başı boyutlama; havuz/sembol/bot tavanı yok.
        # Mutlak dolar tavanı yarışta da geçerlidir (giriş SAYISI serbest,
        # işlem BÜYÜKLÜĞÜ değil).
        limits_usd = {
            "trade": equity * float(config.trade_risk_pct) / 100.0,
            "race_total_open": (equity * config.race_max_open_risk_pct / 100.0
                                - current_account),
        }
    else:
        limits_usd = {
            "trade": equity * float(config.trade_risk_pct) / 100.0,
            "symbol_side": equity * config.max_symbol_side_risk_pct / 100.0 - current_symbol,
            "bot": equity * config.max_bot_risk_pct / 100.0 - current_bot,
            "portfolio": equity * config.max_portfolio_risk_pct / 100.0 - current_account,
            "account": equity * config.max_open_risk_pct / 100.0 - current_account,
            "hard_account": equity * config.hard_max_open_risk_pct / 100.0 - current_account,
        }
    # Mutlak dolar tavanı her iki profilde de bağlayıcıdır.
    limits_usd["trade_usd_cap"] = float(config.max_trade_risk_usd)
    # D2g — REJİM KISICISI: kötü bir günde aynı boyutta ısrar etmek çukuru
    # derinleştirir. Günlük zarar eşiği aşılınca YENİ girişlerin riski yarıya
    # iner. Açık pozisyonlara dokunmaz; mutlak frenler aynen yerinde kalır.
    scale = risk_scale(snapshot, config)
    if scale < 1.0:
        limits_usd["trade"] *= scale
        limits_usd["trade_usd_cap"] *= scale
    # AI KONSEYI: yalniz kisabilir. Kirpma BURADA da yapilir (cagiranin
    # dogrulugu varsayilmaz); bozuk/asiri deger notr veya tabana oturur.
    advisory = advisory_scale if math.isfinite(advisory_scale) else 1.0
    advisory = min(1.0, max(ADVISORY_MIN_SCALE, advisory))
    advisory_limits = dict(limits_usd)
    if advisory < 1.0:
        advisory_limits["trade"] = limits_usd["trade"] * advisory
        advisory_limits["trade_usd_cap"] = limits_usd["trade_usd_cap"] * advisory
    risk_budget = min(advisory_limits.values())
    if not _finite_positive(risk_budget):
        return _reject("no_remaining_risk_budget", tier)
    sizing = _safe_lot(request, spec, risk_budget)
    if sizing[0] is None and advisory < 1.0:
        # ⚠️ 2026-08-04: AI sozlesmesi "yalniz KIS, asla ENGELLEME"dir. Ama
        # kisilan butce brokerin MINIMUM lot riskinin altina duserse _safe_lot
        # tamamen RED doner ve tavsiye fiilen VETO'ya donusur.
        # Olculen ornek (canli FTMO): XAUUSD volume_min=0.01, tick_size=0.01,
        # tick_value=1.0; 139 puanlik stopta min-lot riski 139,45 $. Tavan
        # 250 $ iken giris GECER, temkin (x0.5 -> 125 $) ile TAMAMEN kapanir.
        # Bu durumda tavsiye O ISLEM ICIN gecersiz sayilir: deterministik
        # kurallar (D2g rejim kisicisi, dolar tavani, gunluk fren) aynen
        # gecerlidir — yalnizca AI'nin ekstra kismasi geri alinir.
        fallback = _safe_lot(request, spec, min(limits_usd.values()))
        if fallback[0] is not None:
            advisory = 1.0
            risk_budget = min(limits_usd.values())
            sizing = fallback
    if sizing[0] is None:
        return _reject(sizing[3], tier)
    lot, risk_usd, reward_usd, _ = sizing
    assert lot is not None
    if risk_usd < config.min_initial_risk_usd:
        return _reject("safe_lot_initial_risk_below_minimum_no_upsize", tier)
    if reward_usd < config.min_expected_profit_usd:
        return _reject("expected_profit_below_minimum", tier)
    rr = reward_usd / risk_usd
    if rr + 1e-12 < config.min_rr:
        return _reject("rr_below_minimum", tier)

    projected_symbol = current_symbol + risk_usd
    projected_bot = current_bot + risk_usd
    projected_account = current_account + risk_usd
    projected = {
        "candidate_risk_usd": risk_usd,
        "symbol_side_risk_pct": projected_symbol / equity * 100.0,
        "bot_risk_pct": projected_bot / equity * 100.0,
        "account_open_risk_pct": projected_account / equity * 100.0,
        "risk_scale": scale,                 # D2g: 1.0 normal, 0.5 kisici aktif
        "advisory_scale": advisory,          # AI konseyi: 1.0 notr, <1.0 temkin
        "daily_loss_pct": daily_loss_pct(snapshot),
    }
    violations = []
    if config.race_mode:
        if projected["account_open_risk_pct"] > config.race_max_open_risk_pct + 1e-9:
            violations.append("race_total_open_risk_ceiling")
    if not config.race_mode:
        if projected["symbol_side_risk_pct"] > config.max_symbol_side_risk_pct + 1e-9:
            violations.append("symbol_side_hard_cap")
        if projected["bot_risk_pct"] > config.max_bot_risk_pct + 1e-9:
            violations.append("bot_hard_cap")
        if projected["account_open_risk_pct"] > min(
                config.max_portfolio_risk_pct, config.max_open_risk_pct,
                config.hard_max_open_risk_pct) + 1e-9:
            violations.append("account_open_risk_cap")
    if violations:
        return PreTradeDecision(False, DecisionAction.REJECT, tuple(violations), tier=tier,
                                lot=lot, risk_usd=risk_usd, reward_usd=reward_usd,
                                rr=rr, target=extended_target, target_r=target_r,
                                projected=projected)
    action = DecisionAction.CLOSE_AND_REVERSE if opposite else DecisionAction.ALLOW
    return PreTradeDecision(True, action, ("risk_checks_passed",), tier=tier, lot=lot,
                            risk_usd=risk_usd, reward_usd=reward_usd, rr=rr,
                            target=extended_target, target_r=target_r,
                            close_tickets=tuple(str(p.ticket) for p in opposite),
                            projected=projected)


def _safe_lot(request: TradeRequest, spec: SymbolSpec,
              risk_budget: float) -> tuple[float | None, float, float, str]:
    loss_per_lot = abs(request.entry - request.stop) / spec.tick_size * spec.tick_value
    reward_per_lot = abs(request.target - request.entry) / spec.tick_size * spec.tick_value
    min_lot_risk = loss_per_lot * spec.volume_min
    if min_lot_risk > risk_budget + 1e-9:
        return None, 0.0, 0.0, "minimum_lot_exceeds_risk_budget"
    steps = math.floor((risk_budget / loss_per_lot + 1e-12) / spec.volume_step)
    lot = min(spec.volume_max, steps * spec.volume_step)
    lot = math.floor((lot + 1e-12) / spec.volume_step) * spec.volume_step
    if lot + 1e-12 < spec.volume_min:
        return None, 0.0, 0.0, "no_safe_broker_lot"
    lot = round(lot, 10)
    return lot, loss_per_lot * lot, reward_per_lot * lot, "ok"


# ── AI KONSEYI TAVSIYESI (2026-08-01) ────────────────────────────────────────
# ai_council.py (Ollama + istege bagli Gemini) periyodik analiz yazar. Sozlesme:
#   1. AI ASLA islem acmaz, yon secmez, kural gevsetemez.
#   2. Tavsiye YALNIZ kisabilir: carpan (0, 1] araligina kirpilir; 1.0 ustu
#      "riski artir" tavsiyesi SESSIZCE 1.0 olur.
#   3. Dosya yok / bayat / bozuk => NOTR (1.0). Fail-open notr yondedir cunku
#      olu bir AI sureci trade'i durduramamali (kullanici kurali: "tum botlar
#      islem alsin"); AI yalniz temkin onerebilir, engel koyamaz.
ADVISORY_MAX_AGE_SEC = 1800.0     # konsey 10 dk'da bir yazar; 3 tur kacarsa notr
ADVISORY_MIN_SCALE = 0.25         # AI en fazla 4'te 1'e kisabilir


def load_advisory_scale(path: str | os.PathLike[str], now_ts: float,
                        max_age_seconds: float = ADVISORY_MAX_AGE_SEC) -> float:
    """AI konseyi tavsiye carpani; HER hata durumunda notr 1.0."""
    try:
        raw = json.loads(Path(path).read_text(encoding="utf-8"))
        if not isinstance(raw, dict):
            return 1.0
        generated = float(raw.get("generatedAtSec", 0) or 0)
        age = now_ts - generated
        # Gelecek tarihli dosya da bayat sayilir (saat oynamasi guvene donusmesin).
        if age < -60 or age > max_age_seconds:
            return 1.0
        scale = float(raw.get("scale", 1.0))
        if not math.isfinite(scale):
            return 1.0
        return min(1.0, max(ADVISORY_MIN_SCALE, scale))
    except Exception:
        return 1.0


def daily_loss_pct(snapshot: AccountSnapshot) -> float:
    """Gun basi ozkaynagina gore gun ici kayip yuzdesi (negatif olmaz)."""
    if not _finite_positive(snapshot.day_start_equity):
        return 0.0
    return max(0.0, (snapshot.day_start_equity - snapshot.equity)
               / snapshot.day_start_equity * 100.0)


def risk_scale(snapshot: AccountSnapshot, config: BrainConfig) -> float:
    """D2g — gun ici zarara gore yeni giris riski carpani (1.0 veya 0.5)."""
    if daily_loss_pct(snapshot) >= config.risk_halving_daily_loss_pct:
        return float(config.risk_halving_factor)
    return 1.0


def _account_guard(snapshot: AccountSnapshot, config: BrainConfig,
                   tier: int) -> PreTradeDecision | None:
    daily_loss = daily_loss_pct(snapshot)
    peak = max(snapshot.high_water_equity, snapshot.start_balance)
    drawdown = max(0.0, (peak - snapshot.equity) / peak * 100.0)
    profit = (snapshot.equity - snapshot.start_balance) / snapshot.start_balance * 100.0
    metrics = {"daily_loss_pct": daily_loss, "total_drawdown_pct": drawdown,
               "profit_pct": profit}
    if daily_loss >= config.daily_loss_flatten_pct_account:
        return PreTradeDecision(False, DecisionAction.FLATTEN_ALL,
                                ("daily_loss_flatten_buffer",), tier=tier,
                                projected=metrics)
    if drawdown >= config.total_drawdown_flatten_pct_account:
        return PreTradeDecision(False, DecisionAction.FLATTEN_ALL,
                                ("total_drawdown_flatten_buffer",), tier=tier,
                                projected=metrics)
    if profit >= config.profit_target_pct_account:
        return PreTradeDecision(False, DecisionAction.STOP_PROFIT_TARGET,
                                ("profit_target_reached",), tier=tier,
                                projected=metrics)
    if daily_loss >= config.daily_entry_brake_pct:
        return PreTradeDecision(False, DecisionAction.REJECT,
                                ("daily_entry_brake_block_new",), tier=tier,
                                projected=metrics)
    if daily_loss >= config.daily_loss_warning_pct_account:
        return PreTradeDecision(False, DecisionAction.REJECT,
                                ("daily_loss_warning_block_new",), tier=tier,
                                projected=metrics)
    if drawdown >= config.total_drawdown_warning_pct_account:
        return PreTradeDecision(False, DecisionAction.REJECT,
                                ("total_drawdown_warning_block_new",), tier=tier,
                                projected=metrics)
    return None


def _snapshot_error(snapshot: AccountSnapshot | None) -> str | None:
    if snapshot is None:
        return "missing_account_snapshot"
    if not all((snapshot.mt5_ok, snapshot.account_ok, snapshot.positions_ok,
                snapshot.deals_ok, snapshot.trading_allowed)):
        return "mt5_account_positions_or_deals_unhealthy"
    values = (snapshot.balance, snapshot.equity, snapshot.start_balance,
              snapshot.day_start_equity, snapshot.high_water_equity, snapshot.as_of)
    if not all(_finite_positive(x) for x in values):
        return "invalid_account_snapshot"
    return None


def _request_error(request: TradeRequest, spec: SymbolSpec) -> str | None:
    if not request.candidate_id or not request.bot_id or not request.symbol:
        return "missing_candidate_bot_or_symbol"
    nums = (request.entry, request.stop, request.target, request.signal_strength,
            request.now_ts, spec.tick_size, spec.tick_value, spec.volume_min,
            spec.volume_step, spec.volume_max)
    if not all(math.isfinite(float(x)) for x in nums):
        return "non_finite_trade_input"
    if min(request.entry, request.stop, request.target, spec.tick_size,
           spec.tick_value, spec.volume_min, spec.volume_step, spec.volume_max) <= 0:
        return "non_positive_price_or_symbol_spec"
    if spec.volume_min > spec.volume_max or not 0 <= request.signal_strength <= 1:
        return "invalid_volume_or_signal_strength"
    if request.confirmations < 0:
        return "invalid_confirmation_count"
    if request.direction == Direction.BUY and not (request.stop < request.entry < request.target):
        return "buy_stop_target_geometry_invalid"
    if request.direction == Direction.SELL and not (request.target < request.entry < request.stop):
        return "sell_stop_target_geometry_invalid"
    return None


def _reject(reason: str, tier: int | None = None) -> PreTradeDecision:
    return PreTradeDecision(False, DecisionAction.REJECT, (reason,), tier=tier)


def _finite_positive(value: Any) -> bool:
    try:
        return math.isfinite(float(value)) and float(value) > 0
    except (TypeError, ValueError):
        return False


def _finite_nonnegative(value: Any) -> bool:
    try:
        return math.isfinite(float(value)) and float(value) >= 0
    except (TypeError, ValueError):
        return False


class StateStoreError(RuntimeError):
    pass


class JsonStateStore:
    """Atomic JSON state guarded by a real cross-process byte-range lock."""

    def __init__(self, path: str | os.PathLike[str], lock_timeout: float = 5.0):
        self.path = Path(path)
        self.lock_path = Path(str(self.path) + ".lock")
        self.lock_timeout = float(lock_timeout)

    def read(self) -> dict[str, Any]:
        with self._lock():
            return copy.deepcopy(self._read_unlocked())

    def transact(self, updater: Callable[[dict[str, Any]], tuple[dict[str, Any], Any]]) -> Any:
        with self._lock():
            old = self._read_unlocked()
            proposed, result = updater(copy.deepcopy(old))
            if not isinstance(proposed, dict):
                raise StateStoreError("state updater must return a dict")
            proposed["version"] = int(old.get("version", 0)) + 1
            self._write_unlocked(proposed)
            return result

    def _read_unlocked(self) -> dict[str, Any]:
        if not self.path.exists():
            return {"version": 0, "reservations": [], "last_reversal_at": {},
                    "reversal_observations": {}}
        try:
            with self.path.open("r", encoding="utf-8-sig") as fh:
                value = json.load(fh)
            if not isinstance(value, dict):
                raise StateStoreError("state root is not an object")
            return value
        except (OSError, ValueError, TypeError, json.JSONDecodeError) as exc:
            raise StateStoreError("state read failed") from exc

    def _write_unlocked(self, value: Mapping[str, Any]) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        tmp = self.path.with_name(".%s.%s.%s.tmp" %
                                  (self.path.name, os.getpid(), uuid.uuid4().hex))
        try:
            with tmp.open("w", encoding="utf-8") as fh:
                json.dump(value, fh, ensure_ascii=False, sort_keys=True, indent=2)
                fh.flush()
                os.fsync(fh.fileno())
            os.replace(tmp, self.path)
        except OSError as exc:
            try:
                tmp.unlink()
            except OSError:
                pass
            raise StateStoreError("state write failed") from exc

    @contextmanager
    def _lock(self):
        self.lock_path.parent.mkdir(parents=True, exist_ok=True)
        fh = open(self.lock_path, "a+b")
        try:
            fh.seek(0, os.SEEK_END)
            if fh.tell() == 0:
                fh.write(b"0")
                fh.flush()
            deadline = time.monotonic() + self.lock_timeout
            while True:
                try:
                    _lock_file(fh)
                    break
                except (OSError, BlockingIOError):
                    if time.monotonic() >= deadline:
                        raise StateStoreError("state lock timeout")
                    time.sleep(0.025)
            yield
        finally:
            try:
                _unlock_file(fh)
            except OSError:
                pass
            fh.close()


def _lock_file(fh: Any) -> None:
    fh.seek(0)
    if os.name == "nt":
        import msvcrt
        msvcrt.locking(fh.fileno(), msvcrt.LK_NBLCK, 1)
    else:
        import fcntl
        fcntl.flock(fh.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)


def _unlock_file(fh: Any) -> None:
    fh.seek(0)
    if os.name == "nt":
        import msvcrt
        msvcrt.locking(fh.fileno(), msvcrt.LK_UNLCK, 1)
    else:
        import fcntl
        fcntl.flock(fh.fileno(), fcntl.LOCK_UN)


class AccountBrain:
    """Process-safe facade; reservations prevent simultaneous bridges oversizing."""

    def __init__(self, config: BrainConfig, state_path: str | os.PathLike[str],
                 heartbeat_path: str | os.PathLike[str],
                 require_fresh_heartbeat: bool = True):
        self.config = config
        self.store = JsonStateStore(state_path)
        self.heartbeat_path = Path(heartbeat_path)
        self.require_fresh_heartbeat = bool(require_fresh_heartbeat)

    def evaluate_and_reserve(self, snapshot: AccountSnapshot | None,
                             positions: Sequence[OpenRisk], request: TradeRequest,
                             spec: SymbolSpec,
                             advisory_scale: float = 1.0) -> PreTradeDecision:
        if self.require_fresh_heartbeat and not heartbeat_ok(
                self.heartbeat_path, self.config.heartbeat_max_age_seconds,
                request.now_ts):
            return _reject("fail_closed:central_brain_heartbeat_stale")

        def update(state: dict[str, Any]):
            raw_reservations = state.get("reservations", [])
            if not isinstance(raw_reservations, list):
                raise StateStoreError("reservations is not a list")
            live = [r for r in raw_reservations
                    if float(r.get("expires_at", 0)) > request.now_ts]
            reserved = [_reservation_position(r) for r in live]
            # A reservation is an order currently between risk approval and
            # broker confirmation.  It is not a broker position and therefore
            # can never be "closed" by an opposite reversal plan.  Serialise
            # every same-underlying execution until the first bridge commits or
            # releases its lease; this removes the open-A / reverse-B / open-A
            # race across independent bridge processes.
            if (not self.config.race_mode
                    and any(p.asset == request.asset for p in reserved)):
                state["reservations"] = live
                return state, _reject("same_underlying_execution_in_flight")
            reversals = state.get("last_reversal_at", {})
            if not isinstance(reversals, dict):
                raise StateStoreError("last_reversal_at is not an object")
            all_positions = tuple(positions) + tuple(reserved)
            observations = state.get("reversal_observations", {})
            if not isinstance(observations, dict):
                raise StateStoreError("reversal_observations is not an object")
            # Two separate polls/processes must confirm an ordinary reversal. A
            # consensus signal may arrive with confirmations>=2 and pass at once.
            effective_request = request
            opposite_exists = (not self.config.race_mode) and any(
                p.asset == request.asset and p.direction != request.direction
                for p in all_positions
            )
            obs_key = "%s|%s" % (request.asset, request.direction.value)
            if opposite_exists:
                previous = observations.get(obs_key, {})
                recent = (isinstance(previous, dict)
                          and request.now_ts - float(previous.get("last_ts", 0) or 0)
                          <= self.config.reversal_observation_window_seconds)
                previous_count = int(previous.get("count", 0) or 0) if recent else 0
                count = max(int(request.confirmations), previous_count + 1)
                observations[obs_key] = {"count": count, "last_ts": request.now_ts}
                effective_request = replace(request, confirmations=count)
            # Bound stale observations and remove them after a completed plan.
            observations = {
                k: v for k, v in observations.items()
                if isinstance(v, dict) and request.now_ts - float(v.get("last_ts", 0) or 0)
                <= self.config.reversal_observation_window_seconds
            }
            decision = evaluate_pretrade(snapshot, all_positions,
                                         effective_request, spec, self.config,
                                         RuntimeState(reversals),
                                         advisory_scale=advisory_scale)
            if decision.allowed:
                reservation = {
                    "candidate_id": request.candidate_id,
                    "ticket": "reservation:" + request.candidate_id,
                    "bot_id": request.bot_id,
                    "symbol": request.symbol,
                    "direction": request.direction.value,
                    "timeframe": request.timeframe,
                    "underlying": request.underlying,
                    "risk_usd": decision.risk_usd,
                    "signal_strength": request.signal_strength,
                    "expires_at": request.now_ts + self.config.reservation_ttl_seconds,
                    "status": "reserved",
                }
                live.append(reservation)
                if decision.action == DecisionAction.CLOSE_AND_REVERSE:
                    reversals[request.asset] = request.now_ts
                    observations.pop(obs_key, None)
                decision = PreTradeDecision(**{
                    **decision.__dict__, "reservation_id": request.candidate_id})
            state["reservations"] = live
            state["last_reversal_at"] = reversals
            state["reversal_observations"] = observations
            return state, decision

        try:
            return self.store.transact(update)
        except (StateStoreError, OSError, ValueError, TypeError) as exc:
            return _reject("fail_closed:state_lock_or_data_error:%s" % type(exc).__name__)

    def commit_reservation(self, candidate_id: str, ticket: str | int | None = None,
                           hold_seconds: float = 30.0,
                           now_ts: float | None = None) -> bool:
        """Mark order successful and retain a short anti-race hold until MT5 sees it."""
        now = time.time() if now_ts is None else float(now_ts)

        def update(state: dict[str, Any]):
            found = False
            for item in state.get("reservations", []):
                if item.get("candidate_id") == candidate_id:
                    item["status"] = "committed"
                    item["broker_ticket"] = None if ticket is None else str(ticket)
                    item["expires_at"] = now + max(1.0, float(hold_seconds))
                    found = True
            return state, found
        try:
            return bool(self.store.transact(update))
        except (StateStoreError, OSError, ValueError, TypeError):
            return False

    def reservation_active(self, candidate_id: str,
                           now_ts: float | None = None) -> bool:
        """Atomically verify the execution lease immediately before order_send."""
        now = time.time() if now_ts is None else float(now_ts)

        def update(state: dict[str, Any]):
            raw = state.get("reservations", [])
            if not isinstance(raw, list):
                raise StateStoreError("reservations is not a list")
            live = [r for r in raw if float(r.get("expires_at", 0) or 0) > now]
            active = any(
                r.get("candidate_id") == candidate_id
                and r.get("status", "reserved") == "reserved"
                for r in live
            )
            state["reservations"] = live
            return state, active

        try:
            return bool(self.store.transact(update))
        except (StateStoreError, OSError, ValueError, TypeError):
            return False

    def release_reservation(self, candidate_id: str) -> bool:
        """Remove a failed/cancelled candidate reservation immediately."""
        def update(state: dict[str, Any]):
            old = state.get("reservations", [])
            kept = [item for item in old if item.get("candidate_id") != candidate_id]
            state["reservations"] = kept
            return state, len(kept) != len(old)
        try:
            return bool(self.store.transact(update))
        except (StateStoreError, OSError, ValueError, TypeError):
            return False


def _reservation_position(value: Mapping[str, Any]) -> OpenRisk:
    return OpenRisk(ticket=str(value["ticket"]), bot_id=str(value["bot_id"]),
                    symbol=str(value["symbol"]), direction=str(value["direction"]),
                    timeframe=str(value.get("timeframe", "reservation")),
                    risk_usd=float(value["risk_usd"]),
                    signal_strength=float(value.get("signal_strength", 0.5)),
                    underlying=value.get("underlying"))
