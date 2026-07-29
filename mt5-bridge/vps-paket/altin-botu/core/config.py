"""Configuration management.

Loads config.json (creating it from defaults on first run), deep-merges
missing keys from the defaults and provides thread-safe read/update access.
"""

import copy
import json
import os
import threading

from core.logger import get_logger

MAGIC_NUMBER = 20260707

DEFAULT_CONFIG: dict = {
    "central_brain_enabled": True,
    "brain_required": True,
    "risk_fail_closed": True,
    "risk_profile": "balanced",
    "aggressive_opt_in": False,
    "account": {"size_override": 0.0},
    "execution": {
        "mode": "mt5",
        "require_demo_account": True,
        "paper": {
            "balance": 10000.0,
            "currency": "USD",
            "auto_close_sl_tp": True,
        },
    },
    "risk": {
        "lot_mode": "auto",
        "manual_lot": 0.01,
        "risk_percent": 0.25,
        "max_open_positions": 1,
        "max_positions_per_symbol": 1,
        "daily_limit": {
            "enabled": True,
            "max_loss": 100.0,
            "max_profit": 0.0,
            "action": "close_all_stop",
        },
    },
    "trade": {
        "default_sl_points": 3000,
        "default_tp_points": 6000,
        "min_rr": 2.0,
        "deviation": 30,
    },
    "account_limits": {
        "daily_loss_warning_percent": 4.0,
        "daily_loss_flatten_percent": 4.25,
        "daily_loss_hard_percent": 4.5,
        "total_drawdown_warning_percent": 9.0,
        "total_drawdown_flatten_percent": 9.25,
        "total_drawdown_hard_percent": 9.5,
        "profit_target_percent": 10.0,
        "open_risk_target_percent": 1.5,
        "open_risk_hard_percent": 2.0,
        "symbol_side_risk_hard_percent": 0.5,
        "bot_risk_hard_percent": 0.5,
        "min_expected_profit_usd": 15.0,
        "min_initial_risk_usd": 15.0,
    },
    "symbols": {
        "auto_detect": True,
        "gold": "XAUUSD",
        "btc": "BTCUSD",
        "enabled": {"gold": True, "btc": False},
    },
    "strategy": {
        "active": "gold_trend",
        "assignments": {"gold": ["gold_trend"]},
        "allow_unverified": False,
        "verified_assignments": {
            "gold": ["gold_trend"],
        },
        "candidate_assignments": {
            "gold": ["gold_scalp", "donchian_atr_breakout", "rsi_bollinger_reversion"],
            "btc": ["trend_momentum", "donchian_atr_breakout", "rsi_bollinger_reversion"],
        },
        "params": {},
    },
    "engine": {"enabled": False, "poll_seconds": 5},
    # login > 0 pins the bot to that MT5 account: trading is blocked while the
    # terminal is logged into any other account (the user has several demos).
    "mt5": {"login": 0, "server": "", "path": ""},
    "safety": {
        "demo_only": True,
        "max_risk_percent": 0.50,
        "max_manual_lot": 0.10,
        "account_tier_max_lot": 1.0,
        "max_open_positions": 2,
        "max_positions_per_symbol": 1,
        "max_tick_age_seconds": 30,
        "max_spread_bps": 20.0,
        "min_margin_level_percent": 200.0,
    },
    "research": {
        "enabled": True,
        # Ağır walk-forward araştırması işlem motoruyla aynı anda VPS CPU'sunu
        # tüketmesin. Panelden elle başlatılır; sonuç yine onay kapısından geçer.
        "run_on_start": False,
        "universe": ["gold", "btc"],
        "interval_hours": 24,
        "years": 3.0,
        "final_holdout_fraction": 0.20,
        "folds": 3,
        "gap_bars": 24,
        "minimum_oos_trades": 12,
        "min_profitable_fold_fraction": 0.67,
        "min_holdout_profit_factor": 1.05,
        "max_holdout_drawdown_pct": 10.0,
        "double_spread_must_profit": True,
    },
    "web": {"host": "127.0.0.1", "port": 8350, "password": ""},
}

log = get_logger(__name__)


def _deep_merge(base: dict, override: dict) -> dict:
    """Return a new dict: deep copy of base with override merged on top.

    Nested dicts are merged recursively; any other value in override
    replaces the base value.
    """
    result = copy.deepcopy(base)
    for key, value in override.items():
        if (
            key in result
            and isinstance(result[key], dict)
            and isinstance(value, dict)
        ):
            result[key] = _deep_merge(result[key], value)
        else:
            result[key] = copy.deepcopy(value)
    return result


def _bounded_float(value, default: float, low: float, high: float) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError):
        number = default
    return max(low, min(high, number))


def _bounded_int(value, default: int, low: int, high: int) -> int:
    try:
        number = int(value)
    except (TypeError, ValueError):
        number = default
    return max(low, min(high, number))


def _enforce_safety(
    config: dict,
    locked_login: int = 0,
    locked_server: str = "",
) -> dict:
    """Apply non-bypassable invariants for this MT5 DEMO-only build."""
    cfg = copy.deepcopy(config)
    cfg["central_brain_enabled"] = True
    cfg["brain_required"] = True
    cfg["risk_fail_closed"] = True
    execution = cfg.setdefault("execution", {})
    execution["mode"] = "mt5"
    execution["require_demo_account"] = True

    safety = cfg.setdefault("safety", {})
    safety["demo_only"] = True
    # Hard ceilings: config and panel updates may lower these values but can
    # never raise them beyond this demo build's safety policy.
    max_risk = _bounded_float(safety.get("max_risk_percent"), 0.50, 0.05, 0.50)
    max_manual = _bounded_float(safety.get("max_manual_lot"), 0.10, 0.01, 0.10)
    max_open_cap = _bounded_int(safety.get("max_open_positions"), 2, 1, 2)
    max_symbol_cap = _bounded_int(safety.get("max_positions_per_symbol"), 1, 1, 1)
    safety.update({
        "max_risk_percent": max_risk,
        "max_manual_lot": max_manual,
        "max_open_positions": max_open_cap,
        "max_positions_per_symbol": max_symbol_cap,
        "max_tick_age_seconds": _bounded_int(safety.get("max_tick_age_seconds"), 30, 5, 30),
        "max_spread_bps": _bounded_float(safety.get("max_spread_bps"), 20.0, 0.1, 20.0),
        "min_margin_level_percent": _bounded_float(
            safety.get("min_margin_level_percent"), 200.0, 200.0, 1000.0
        ),
    })

    risk = cfg.setdefault("risk", {})
    risk["risk_percent"] = _bounded_float(risk.get("risk_percent"), 0.25, 0.01, max_risk)
    risk["manual_lot"] = _bounded_float(risk.get("manual_lot"), 0.01, 0.01, max_manual)
    risk["max_open_positions"] = _bounded_int(
        risk.get("max_open_positions"), 1, 1, max_open_cap
    )
    risk["max_positions_per_symbol"] = _bounded_int(
        risk.get("max_positions_per_symbol"), 1, 1, max_symbol_cap
    )
    daily = risk.setdefault("daily_limit", {})
    daily["enabled"] = True
    daily["action"] = "close_all_stop"
    daily["max_loss"] = _bounded_float(daily.get("max_loss"), 100.0, 1.0, 500.0)

    strategy = cfg.setdefault("strategy", {})
    strategy["allow_unverified"] = False
    web = cfg.setdefault("web", {})
    web["host"] = "127.0.0.1"
    mt5_cfg = cfg.setdefault("mt5", {})
    if locked_login > 0:
        mt5_cfg["login"] = int(locked_login)
    if locked_server:
        mt5_cfg["server"] = str(locked_server)
    return cfg


class ConfigManager:
    """Thread-safe JSON configuration store backed by config.json."""

    def __init__(self, path: str = "config.json"):
        self._path = path
        self._account_lock_path = os.path.join(
            os.path.dirname(os.path.abspath(path)), ".demo-account-lock.json"
        )
        self._locked_login = 0
        self._locked_server = ""
        self._lock = threading.RLock()
        self._config = copy.deepcopy(DEFAULT_CONFIG)
        self._load()

    def _load(self) -> None:
        with self._lock:
            if os.path.exists(self._path):
                try:
                    with open(self._path, "r", encoding="utf-8") as fh:
                        loaded = json.load(fh)
                    if not isinstance(loaded, dict):
                        raise ValueError("kök öğe bir nesne (dict) değil")
                    self._load_or_create_account_lock(loaded)
                    self._config = _enforce_safety(
                        _deep_merge(DEFAULT_CONFIG, loaded),
                        self._locked_login,
                        self._locked_server,
                    )
                    log.info("Yapılandırma yüklendi: %s", self._path)
                except (json.JSONDecodeError, ValueError, OSError) as exc:
                    log.error(
                        "Yapılandırma dosyası okunamadı (%s), "
                        "varsayılan ayarlar kullanılacak: %s",
                        self._path,
                        exc,
                    )
                    # Bozuk dosyayı ".corrupt" olarak sakla — üzerine sessizce
                    # varsayılan yazıp kullanıcının strateji/sembol/parametre
                    # ayarlarını yok etme. Hesap kilidi zaten ayrı lock
                    # dosyasında; _enforce_safety mode=mt5 + engine güvenli
                    # (otomatik işlem kapalı) başlar, kurtarma için kanıt kalır.
                    try:
                        corrupt_path = self._path + ".corrupt"
                        os.replace(self._path, corrupt_path)
                        log.error("Bozuk yapılandırma yedeklendi: %s", corrupt_path)
                    except OSError as move_exc:
                        log.error("Bozuk yapılandırma yedeklenemedi: %s", move_exc)
                    self._load_or_create_account_lock({})
                    self._config = _enforce_safety(
                        DEFAULT_CONFIG, self._locked_login, self._locked_server
                    )
            else:
                log.info(
                    "Yapılandırma dosyası bulunamadı, varsayılanlarla "
                    "oluşturuluyor: %s",
                    self._path,
                )
                self._load_or_create_account_lock({})
                self._config = _enforce_safety(
                    DEFAULT_CONFIG, self._locked_login, self._locked_server
                )
            # Persist so the file always exists and contains any newly
            # introduced default keys.
            self.save()

    def _load_or_create_account_lock(self, loaded: dict) -> None:
        """Pin the packaged demo login/server outside panel-editable config."""
        try:
            if os.path.exists(self._account_lock_path):
                with open(self._account_lock_path, "r", encoding="utf-8") as fh:
                    lock = json.load(fh)
                self._locked_login = int(lock.get("login") or 0)
                self._locked_server = str(lock.get("server") or "").strip()
                return

            mt5_cfg = loaded.get("mt5", {}) if isinstance(loaded, dict) else {}
            login = int(mt5_cfg.get("login") or 0)
            server = str(mt5_cfg.get("server") or "").strip()
            if login <= 0 or not server:
                return

            lock = {"login": login, "server": server, "demo_only": True}
            tmp = self._account_lock_path + ".tmp"
            with open(tmp, "w", encoding="utf-8") as fh:
                json.dump(lock, fh, ensure_ascii=False, indent=2)
            os.replace(tmp, self._account_lock_path)
            self._locked_login = login
            self._locked_server = server
        except (OSError, ValueError, TypeError, json.JSONDecodeError) as exc:
            log.error("Demo hesap kilidi okunamadi/yazilamadi: %s", exc)

    def get(self) -> dict:
        """Return a deep copy of the current configuration."""
        with self._lock:
            return copy.deepcopy(self._config)

    def update(self, partial: dict) -> dict:
        """Deep-merge partial into the config, persist and return a copy."""
        with self._lock:
            self._config = _enforce_safety(
                _deep_merge(self._config, partial or {}),
                self._locked_login,
                self._locked_server,
            )
            self.save()
            return copy.deepcopy(self._config)

    def rebind_demo_account(self, login: int, server: str) -> dict:
        """Atomically pin this build to a newly verified demo account.

        Callers must verify the live MT5 account is demo before invoking this
        method. The lock file remains authoritative over panel config updates.
        """
        try:
            login_value = int(login)
        except (TypeError, ValueError):
            raise ValueError("Geçerli bir demo hesap numarası gerekli.")
        server_value = str(server or "").strip()
        if login_value <= 0 or not server_value:
            raise ValueError("Demo hesap numarası ve sunucusu zorunlu.")

        with self._lock:
            lock = {
                "login": login_value,
                "server": server_value,
                "demo_only": True,
            }
            tmp = self._account_lock_path + ".tmp"
            try:
                with open(tmp, "w", encoding="utf-8") as fh:
                    json.dump(lock, fh, ensure_ascii=False, indent=2)
                os.replace(tmp, self._account_lock_path)
            except OSError as exc:
                try:
                    if os.path.exists(tmp):
                        os.remove(tmp)
                except OSError:
                    pass
                raise RuntimeError(f"Demo hesap kilidi yazılamadı: {exc}") from exc

            self._locked_login = login_value
            self._locked_server = server_value
            self._config = _enforce_safety(
                _deep_merge(
                    self._config,
                    {"mt5": {"login": login_value, "server": server_value}},
                ),
                self._locked_login,
                self._locked_server,
            )
            self.save()
            return copy.deepcopy(self._config)

    def save(self) -> None:
        """Write the configuration to disk (atomic replace)."""
        with self._lock:
            tmp_path = self._path + ".tmp"
            try:
                with open(tmp_path, "w", encoding="utf-8") as fh:
                    json.dump(self._config, fh, ensure_ascii=False, indent=2)
                os.replace(tmp_path, self._path)
            except OSError as exc:
                log.error(
                    "Yapılandırma dosyası kaydedilemedi (%s): %s",
                    self._path,
                    exc,
                )
                try:
                    if os.path.exists(tmp_path):
                        os.remove(tmp_path)
                except OSError:
                    pass
