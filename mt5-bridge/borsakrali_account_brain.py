#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""BORSA KRALI central account brain.

This is the only account-wide, continuously running control loop.  Entry
bridges still own signal translation, but every one of them is expected to use
``account_brain`` for the same pre-trade decision.  This daemon owns the other
half of the contract:

* a fresh health heartbeat (entry bridges fail closed when it is stale),
* account/day drawdown and +10% profit-stop enforcement,
* deterministic profit give-back / fast adverse-move exits,
* broker-confirmed open/close lifecycle reporting to the backend.

No LLM is allowed in the live order path.  The rules are deterministic,
bounded and replayable; an external model outage or a creative response can
therefore never create/resize an order.
"""

import json
import logging
import math
import os
import random
import sys
import threading
import time
import uuid
from datetime import datetime, timedelta, timezone

try:
    import MetaTrader5 as mt5
except ImportError:
    print("MetaTrader5 paketi yok. Kur: pip install MetaTrader5", file=sys.stderr)
    sys.exit(1)

try:
    import requests
except ImportError:
    print("requests paketi yok. Kur: pip install requests", file=sys.stderr)
    sys.exit(1)

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import trade_guard
import account_brain
import mt5_brain_adapter

CONFIG_PATH = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, "config_brain.json")
STATE_PATH = os.path.join(HERE, "account_brain_runtime.json")
HEARTBEAT_PATH = os.path.join(HERE, "account_brain_heartbeat.json")
STOP_MASTER = os.path.join(HERE, "STOP_MASTER")

VERSION = "2026-07-29-central-brain-v3"

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s",
                    handlers=[logging.StreamHandler()])
log = logging.getLogger("bk-account-brain")

DEFAULTS = {
    "backend_url": "https://borsakrali.com",
    "exec_token": "",
    "terminal_path": "",
    "allowed_account": 0,
    "account_server": "",
    "enabled": True,
    "dry_run": True,
    "poll_seconds": 1,
    "deviation_points": 30,
    "risk_fail_closed": True,
    "manage_magic_zero": False,
    # YARIŞ MODU: sembol/bot/havuz tavan flatten'ları devre dışı; günlük/toplam
    # zarar frenleri, +%10 kâr hedefi ve SL'siz pozisyon freni AYNEN kalır.
    "race_mode": False,
    "daily_entry_brake_pct": 1.50,
    "max_open_risk_pct": 1.50,
    "hard_max_open_risk_pct": 2.00,
    "max_symbol_side_risk_pct": 0.50,
    "max_bot_risk_pct": 0.50,
    # Buffer thresholds intentionally precede the user's absolute ceilings.
    # A market gap/slippage can jump a threshold, so no software can promise a
    # mathematically exact cap; the buffers make best execution effort early.
    "daily_flatten_warning_pct": 4.00,
    "daily_flatten_pct": 4.25,
    "daily_hard_limit_pct": 4.50,
    "total_flatten_warning_pct": 9.00,
    "total_flatten_pct": 9.25,
    "total_hard_limit_pct": 9.50,
    "profit_stop_pct": 10.0,
    "min_expected_pnl_usd": 15.0,
    "min_initial_risk_usd": 15.0,
    "profit_lock_arm_usd": 20.0,
    "profit_lock_floor_usd": 15.0,
    "profit_giveback_pct": 20.0,
    "hype_window_seconds": 20,
    "hype_giveback_pct": 12.0,
    "adverse_exit_r": 0.55,
    "adverse_acceleration_r": 0.20,
    "adverse_window_seconds": 12,
    "trail_start_r": 3.0,
    "trail_distance_r": 1.0,
    # Kar kilidi dolarla degil R ile silahlanir: tepe en az bu kadar R olmadan
    # erken kar-alma kapanisi yapilmaz (kurus-islem/churn onlemi).
    "profit_giveback_activation_r": 2.5,
    # SURU / TERS-DONUS DEDEKTORU (kullanici 2026-07-30): ayni yonde >=N pozisyon
    # varken cogunlugu zarardaysa VE yonun toplam R'si pencere tepesinden hizla
    # dusuyorsa, o yonun ZARARDAKI pozisyonlari topluca kesilir; ayni yone
    # yeniden giris reentry-cooldown'a alinir, TERS yon acik kalir (botlar yeni
    # trendi gorunce ters islemleri kendileri acar). Kazananlara dokunulmaz.
    "herd_min_positions": 5,
    "herd_losing_fraction": 0.70,
    "herd_window_seconds": 90.0,
    # Pozisyon BASINA ortalama geri verme (toplam degil): 0.8R = gercek donus.
    "herd_drawdown_r": 0.8,
    "herd_cut_loss_r": 0.10,
    "herd_cooldown_seconds": 300.0,
    # KAR TASIYICI (runner): tepe bu R'yi gorunce broker TP'si cok uzaga tasinir;
    # kazanan R:R hedefine takilmadan kosar. Koruma: 1R kar-kilidi + 3R trail +
    # tepe geri-verme + suru dedektoru. 0 = kapali.
    "runner_arm_r": 2.5,
    "runner_target_r": 10.0,
    # Beyin kendi kapattigi enstrumanda AYNI YONDE bu kadar dakika yeni giris
    # engellenir (kapan-ac dongusu kirilir); ters yon serbesttir.
    "reentry_cooldown_minutes": 45.0,
    "min_discretionary_exit_usd": 15.0,
    "min_giveback_peak_usd": 100.0,
    "est_commission_per_lot": 4.0,
    "report_interval_seconds": 2,
    "lifecycle_report_max_age_seconds": 30,
    "closed_history_hours": 48,
    "llm_live_order_authority": False,
}


def load_config():
    merged = dict(DEFAULTS)
    if os.path.exists(CONFIG_PATH):
        with open(CONFIG_PATH, "r", encoding="utf-8-sig") as fh:
            value = json.load(fh)
        if not isinstance(value, dict):
            raise ValueError("config_brain.json JSON object olmali")
        merged.update(value)
    # This switch is deliberately non-configurable in practice.  Refuse to
    # start instead of silently granting a language model live order authority.
    if merged.get("llm_live_order_authority"):
        raise ValueError("llm_live_order_authority desteklenmez; canli emir yolu deterministik kalmalidir")
    if not isinstance(merged.get("dry_run"), bool):
        raise ValueError("config_brain dry_run JSON boolean (true/false) olmali")
    if not isinstance(merged.get("enabled"), bool):
        raise ValueError("config_brain enabled JSON boolean (true/false) olmali")
    for key in ("risk_fail_closed", "manage_magic_zero", "race_mode"):
        if not isinstance(merged.get(key), bool):
            raise ValueError("config_brain %s JSON boolean olmali" % key)
    if "aggressive_opt_in" in merged and not isinstance(
            merged.get("aggressive_opt_in"), bool):
        raise ValueError("config_brain aggressive_opt_in JSON boolean olmali")
    if str(merged.get("risk_profile", "balanced")).lower() not in (
            "balanced", "aggressive"):
        raise ValueError("config_brain risk_profile balanced/aggressive olmali")
    for key in ("backend_url", "exec_token", "terminal_path"):
        if not isinstance(merged.get(key), str):
            raise ValueError("config_brain %s string olmali" % key)
    if "account_server" in merged and not isinstance(merged.get("account_server"), str):
        raise ValueError("config_brain account_server string olmali")
    merged["allowed_account"] = _validated_allowed_account(
        merged.get("allowed_account"))
    if merged.get("dry_run") is not True and (
            merged["allowed_account"] <= 0
            or not merged.get("account_server", "").strip()):
        raise ValueError(
            "canli config_brain allowed_account + account_server kilidi gerektirir")
    _validate_numeric_config(merged)
    return merged


def _validated_allowed_account(value):
    """Return a literal non-negative MT5 login; reject coercible lookalikes."""
    if type(value) is not int or value < 0:
        raise ValueError("config_brain allowed_account negatif olmayan JSON integer olmali")
    return value


def _finite_config_number(cfg, key, low, high, *, integer=False):
    value = cfg.get(key)
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError("config_brain %s sonlu JSON number olmali" % key)
    number = float(value)
    if not math.isfinite(number) or number < low or number > high:
        raise ValueError(
            "config_brain %s %.4g..%.4g araliginda olmali" % (key, low, high))
    if integer and type(value) is not int:
        raise ValueError("config_brain %s JSON integer olmali" % key)
    return value


def _validate_numeric_config(cfg):
    # Modul seviyesinde: testler bu araliklarin account_brain.BrainConfig
    # dogrulamasiyla AYRISMADIGINI kontrol edebilsin (2026-08-05 olayi).
    ranges = CONFIG_ARALIKLARI
    return _aralik_dogrula(cfg, ranges)


def _aralik_dogrula(cfg, ranges):
    for key, (low, high) in ranges.items():
        _finite_config_number(cfg, key, low, high)
    aliases = {
        "daily_loss_warning_pct_account": (0.01, 4.0),
        "daily_loss_flatten_pct_account": (0.01, 4.25),
        "total_drawdown_warning_pct_account": (0.01, 9.0),
        "total_drawdown_flatten_pct_account": (0.01, 9.25),
    }
    for key, (low, high) in aliases.items():
        if key in cfg:
            _finite_config_number(cfg, key, low, high)
    _finite_config_number(cfg, "deviation_points", 0, 10000, integer=True)
    _finite_config_number(cfg, "herd_min_positions", 2, 100, integer=True)
    if float(cfg["daily_flatten_warning_pct"]) > float(cfg["daily_flatten_pct"]):
        raise ValueError("daily warning flatten'dan buyuk olamaz")
    if float(cfg["daily_flatten_pct"]) > float(cfg["daily_hard_limit_pct"]):
        raise ValueError("daily flatten hard limitten buyuk olamaz")
    if float(cfg["total_flatten_warning_pct"]) > float(cfg["total_flatten_pct"]):
        raise ValueError("total warning flatten'dan buyuk olamaz")
    if float(cfg["total_flatten_pct"]) > float(cfg["total_hard_limit_pct"]):
        raise ValueError("total flatten hard limitten buyuk olamaz")
    if float(cfg["profit_lock_floor_usd"]) > float(cfg["profit_lock_arm_usd"]):
        raise ValueError("profit lock floor arm seviyesinden buyuk olamaz")
    if float(cfg["trail_distance_r"]) >= float(cfg["trail_start_r"]):
        raise ValueError("trail_distance_r trail_start_r degerinden kucuk olmali")


CONFIG_ARALIKLARI = {
    "poll_seconds": (0.2, 60.0),
    # 2026-08-05 yaris modu: giris freni yukseltilebilir. Ust sinir
    # hesap-yikici frenin (daily_hard_limit 4.5) ALTINDA tutulur ki
    # "giris dur" ile "hepsini kapat" ayni noktada tetiklenmesin.
    # ⚠️ Bu aralik account_brain.BrainConfig dogrulamasindan AYRIDIR.
    # Ikisi ayrisirsa config REDDEDILIR, beyin "son gecerli config ile
    # close-only" moda duser ve HESAP FRENI tum pozisyonlari kapatmaya
    # baslar. 2026-08-05'te CANLI olarak yasandi: account_brain tarafi
    # gevsetildi ama burasi 1.5'te kaldigi icin beyin cikti.
    # Ust sinir = daily_flatten (4.25) ALTINDA. BrainConfig de aynisini
    # sart kosuyor; bu iki deger AYRISIRSA config reddedilir ve beyin
    # close-only'ye duser. test_iki_dogrulama_katmani_ayrisamaz bunu kilitler.
    "daily_entry_brake_pct": (0.01, 4.24),
    "max_open_risk_pct": (0.01, 1.5),
    "hard_max_open_risk_pct": (0.01, 2.0),
    "max_symbol_side_risk_pct": (0.01, 0.5),
    "max_bot_risk_pct": (0.01, 0.5),
    "daily_flatten_warning_pct": (0.01, 4.0),
    "daily_flatten_pct": (0.01, 4.25),
    "daily_hard_limit_pct": (0.01, 4.5),
    "total_flatten_warning_pct": (0.01, 9.0),
    "total_flatten_pct": (0.01, 9.25),
    "total_hard_limit_pct": (0.01, 9.5),
    "profit_stop_pct": (10.0, 10.0),
    "min_expected_pnl_usd": (15.0, 1e9),
    "min_initial_risk_usd": (15.0, 1e9),
    "profit_lock_arm_usd": (15.0, 1e9),
    "profit_lock_floor_usd": (15.0, 1e9),
    "profit_giveback_pct": (0.1, 100.0),
    "hype_window_seconds": (1.0, 3600.0),
    "hype_giveback_pct": (0.1, 100.0),
    "adverse_exit_r": (0.01, 1.0),
    "adverse_acceleration_r": (0.0, 1.0),
    "adverse_window_seconds": (1.0, 3600.0),
    "trail_start_r": (0.5, 10.0),
    "trail_distance_r": (0.25, 5.0),
    "profit_giveback_activation_r": (0.1, 5.0),
    "reentry_cooldown_minutes": (0.0, 480.0),
    "herd_losing_fraction": (0.5, 1.0),
    "herd_window_seconds": (10.0, 3600.0),
    "herd_drawdown_r": (0.2, 20.0),
    "herd_cut_loss_r": (0.0, 5.0),
    "herd_cooldown_seconds": (30.0, 3600.0),
    "runner_arm_r": (0.0, 10.0),
    "runner_target_r": (3.0, 50.0),
    "min_discretionary_exit_usd": (15.0, 1e9),
    "min_giveback_peak_usd": (0.0, 1e9),
    "est_commission_per_lot": (0.0, 1000.0),
    "report_interval_seconds": (0.2, 5.0),
    "lifecycle_report_max_age_seconds": (15.0, 300.0),
    "closed_history_hours": (24.0, 720.0),
}


def _startup_recovery_config():
    """Build a narrow config used only to supervise after config corruption.

    Live account authority is never inferred here.  ``main`` subsequently
    requires the connected login to match the durable state login before it
    permits close-only recovery.
    """
    raw = {}
    try:
        with open(CONFIG_PATH, "r", encoding="utf-8-sig") as fh:
            candidate = json.load(fh)
        if isinstance(candidate, dict):
            raw = candidate
    except (OSError, ValueError, TypeError, json.JSONDecodeError):
        pass
    cfg = dict(DEFAULTS)
    for key in ("terminal_path", "backend_url", "exec_token", "account_server"):
        if isinstance(raw.get(key), str):
            cfg[key] = raw[key]
    # A literal true is the only value allowed to prove this was paper mode.
    # Missing/malformed values are treated as potentially live and fail closed.
    cfg["dry_run"] = raw.get("dry_run") is True
    cfg["enabled"] = False
    cfg["allowed_account"] = 0
    return cfg


def _atomic_json(path, value):
    # A PID-only temp name can collide when two writes overlap.  More
    # importantly, Windows readers may briefly hold the destination without
    # FILE_SHARE_DELETE and make an otherwise atomic replace fail with
    # WinError 5/32.  Keep the atomic contract, but retry that narrow sharing
    # race with bounded exponential backoff and always remove an orphan temp.
    tmp = "%s.%s.%s.tmp" % (path, os.getpid(), uuid.uuid4().hex)
    try:
        with open(tmp, "w", encoding="utf-8") as fh:
            json.dump(value, fh, ensure_ascii=False, indent=2, sort_keys=True)
            fh.flush()
            os.fsync(fh.fileno())
        attempts = 8
        for attempt in range(attempts):
            try:
                os.replace(tmp, path)
                return
            except OSError as exc:
                retryable = (
                    isinstance(exc, PermissionError)
                    or getattr(exc, "winerror", None) in (5, 32)
                )
                if not retryable or attempt + 1 >= attempts:
                    raise
                base = min(0.20, 0.01 * (2 ** attempt))
                time.sleep(base + random.uniform(0.0, base * 0.25))
    finally:
        try:
            os.remove(tmp)
        except FileNotFoundError:
            pass
        except OSError:
            # The original write/replace error is more useful than a cleanup
            # race; a UUID temp cannot be mistaken for a later active write.
            pass


def _load_state():
    try:
        with open(STATE_PATH, "r", encoding="utf-8-sig") as fh:
            value = json.load(fh)
        if not isinstance(value, dict):
            raise RuntimeError("account brain state JSON object olmali")
        return value
    except FileNotFoundError:
        return None
    except (json.JSONDecodeError, OSError) as exc:
        raise RuntimeError("account brain state okunamadi/bozuk") from exc


def _save_state(state):
    _atomic_json(STATE_PATH, state)


def _stop_mode(path=None):
    """Return (mode, reason) without treating a manual STOP as close authority."""
    path = path or STOP_MASTER
    if not os.path.exists(path):
        return "none", None
    try:
        with open(path, "r", encoding="utf-8-sig") as fh:
            value = json.load(fh)
        if isinstance(value, dict):
            close_only = value.get("closeOnly") is True
            flatten = value.get("emergencyFlatten") is True
            if close_only and flatten:
                return "close-only", str(value.get("reason") or "risk-stop-master")[:240]
            if close_only or flatten:
                return "risk-incomplete", str(
                    value.get("reason") or "incomplete-risk-stop-master")[:240]
    except (OSError, ValueError, TypeError, json.JSONDecodeError):
        pass
    return "manual", "manual-stop-master"


def _live_state_error(state, cfg, ai):
    """Validate live baselines before they can influence a risk decision."""
    if not isinstance(state, dict) or not state:
        return "live-state-missing"
    raw_version = state.get("version")
    if type(raw_version) is not int:
        return "live-state-version-invalid"
    version = raw_version
    if version != 3:
        return "live-state-version-invalid"
    try:
        login = int(getattr(ai, "login", 0) or 0)
        raw_login = state.get("login")
        if type(raw_login) is not int:
            return "live-state-account-mismatch"
        state_login = raw_login
    except (TypeError, ValueError, OverflowError):
        return "live-state-account-mismatch"
    if login <= 0 or state_login <= 0 or state_login != login:
        return "live-state-account-mismatch"
    connected_server = str(getattr(ai, "server", "") or "").strip().lower()
    state_server = state.get("server")
    if (not isinstance(state_server, str) or not state_server.strip()
            or not connected_server
            or state_server.strip().lower() != connected_server):
        return "live-state-server-mismatch"
    try:
        wanted = int(cfg.get("allowed_account") or 0)
    except (TypeError, ValueError, OverflowError):
        return "allowed-account-invalid"
    if wanted and login != wanted:
        return "allowed-account-mismatch"
    for key in ("initialEquity", "dayStartEquity", "peakEquity"):
        if isinstance(state.get(key), bool):
            return "live-state-%s-invalid" % key
        try:
            value = float(state.get(key))
        except (TypeError, ValueError):
            return "live-state-%s-invalid" % key
        if not math.isfinite(value) or value <= 0:
            return "live-state-%s-invalid" % key
    day_value = state.get("day")
    if not isinstance(day_value, str) or not day_value.strip():
        return "live-state-day-invalid"
    try:
        datetime.strptime(day_value, "%Y-%m-%d")
    except (TypeError, ValueError):
        return "live-state-day-invalid"
    if day_value > _trading_day():
        return "live-state-day-in-future"
    if not isinstance(state.get("tickets"), dict):
        return "live-state-tickets-invalid"
    if not isinstance(state.get("close_reasons"), dict):
        return "live-state-close-reasons-invalid"
    return None


def _mt5_init(cfg):
    path = str(cfg.get("terminal_path") or "").strip()
    return mt5.initialize(path=path) if path else mt5.initialize()


def _account_allowed(cfg, ai):
    try:
        wanted = _validated_allowed_account(cfg.get("allowed_account"))
        login = int(getattr(ai, "login", 0) or 0)
    except (TypeError, ValueError, OverflowError):
        return False
    if not (bool(ai) and login > 0 and (not wanted or login == wanted)):
        return False
    wanted_server = str(cfg.get("account_server") or "").strip().lower()
    connected_server = str(getattr(ai, "server", "") or "").strip().lower()
    return not wanted_server or (
        bool(connected_server) and connected_server == wanted_server)


def _trading_day(now=None):
    now = now or datetime.now(timezone.utc)
    return (now + timedelta(hours=3)).strftime("%Y-%m-%d")


def _tr_midnight_epoch(now=None):
    now = now or datetime.now(timezone.utc)
    tr = now + timedelta(hours=3)
    midnight_tr = tr.replace(hour=0, minute=0, second=0, microsecond=0)
    return int((midnight_tr - timedelta(hours=3)).timestamp())


def _managed_positions(cfg, raw):
    include_manual = bool(cfg.get("manage_magic_zero", False))
    return [p for p in raw if include_manual or int(getattr(p, "magic", 0) or 0) > 0]


def _net_position_pnl(pos):
    return float(getattr(pos, "profit", 0) or 0) + float(getattr(pos, "swap", 0) or 0)


def _is_close_deal(deal):
    entry = getattr(deal, "entry", None)
    close_values = {
        getattr(mt5, "DEAL_ENTRY_OUT", 1),
        getattr(mt5, "DEAL_ENTRY_OUT_BY", 3),
        getattr(mt5, "DEAL_ENTRY_INOUT", 2),
    }
    return entry in close_values


def _day_deals():
    """
    Bugunun (TR) TUM kapanis deal'leri — BILDIRIM IMLECINDEN BAGIMSIZ.

    ⚠️ F4 (2026-08-01 dusman incelemesi): `realizedToday` eskiden `_history()`
    ciktisindan hesaplaniyordu. O pencere bildirim imlecine baglidir ve kararli
    durumda yalnizca SON ~5 SANIYEDIR (imlec her basarili POST'ta "simdi"ye
    cekilir, POST araligi 2 sn). Sonuc: gunun neti -3.234 $ iken snapshot
    0.00 gonderiyordu. Backend mutabakati bu degeri "broker gercegi" saydigi
    icin emniyet agi TERS calisiyordu:
      · defter DOGRU calistigi her gun sahte "MUTABAKATSIZLIK" (alarm korlugu),
      · defter TAMAMEN BOS oldugunda |0-0| <= tolerans -> "Mutabakat OK".
    Yani yakalamak icin yazildigi olayi ONAYLIYORDU. Bagimsiz dogrulama ancak
    BAGIMSIZ pencereyle mumkundur.
    """
    start = datetime.fromtimestamp(_tr_midnight_epoch(), timezone.utc)
    try:
        rows = mt5.history_deals_get(start, datetime.now(timezone.utc) + timedelta(hours=6))
    except Exception:
        return None
    return None if rows is None else list(rows)


def _realized_today(deals):
    start = _tr_midnight_epoch()
    total = 0.0
    for deal in deals:
        if int(getattr(deal, "time", 0) or 0) < start or not _is_close_deal(deal):
            continue
        # Deposits/credits have no trading close entry and are already excluded.
        total += (float(getattr(deal, "profit", 0) or 0)
                  + float(getattr(deal, "commission", 0) or 0)
                  + float(getattr(deal, "swap", 0) or 0)
                  + float(getattr(deal, "fee", 0) or 0))
    return total


def _initial_risk_usd(pos):
    sl = float(getattr(pos, "sl", 0) or 0)
    opened = float(getattr(pos, "price_open", 0) or 0)
    volume = float(getattr(pos, "volume", 0) or 0)
    if sl <= 0 or opened <= 0 or volume <= 0:
        return None
    is_buy = int(getattr(pos, "type", 0) or 0) == getattr(
        mt5, "POSITION_TYPE_BUY", 0)
    adverse = sl < opened if is_buy else sl > opened
    if not adverse:
        return 0.0
    calc = getattr(mt5, "order_calc_profit", None)
    if callable(calc):
        try:
            order_type = (getattr(mt5, "ORDER_TYPE_BUY", 0) if is_buy
                          else getattr(mt5, "ORDER_TYPE_SELL", 1))
            at_stop = calc(order_type, getattr(pos, "symbol", ""),
                           volume, opened, sl)
            if (at_stop is not None and math.isfinite(float(at_stop))
                    and float(at_stop) < 0):
                return -float(at_stop)
        except Exception:
            pass
    info = mt5.symbol_info(getattr(pos, "symbol", ""))
    if info is None:
        return None
    risk = trade_guard.per_lot_risk_usd(info, abs(opened - sl)) * volume
    return risk if math.isfinite(risk) and risk > 0 else None


def _send_with_filling(req):
    last = None
    for fill in (mt5.ORDER_FILLING_IOC, mt5.ORDER_FILLING_FOK, mt5.ORDER_FILLING_RETURN):
        req["type_filling"] = fill
        last = mt5.order_send(req)
        if last is None:
            return None
        if last.retcode in (getattr(mt5, "TRADE_RETCODE_DONE", 10009),
                            getattr(mt5, "TRADE_RETCODE_DONE_PARTIAL", 10010)):
            return last
        if last.retcode != 10030:
            return last
    return last


def _close_position(cfg, pos, reason, state):
    ai = mt5.account_info()
    if not _account_allowed(cfg, ai):
        log.error("KAPATMA RED: hesap kilidi/eslesmesi yok (%s)", reason)
        return False
    is_buy = int(getattr(pos, "type", 0)) == getattr(mt5, "POSITION_TYPE_BUY", 0)
    tick = mt5.symbol_info_tick(pos.symbol)
    price = 0.0
    if tick is not None:
        price = float(tick.bid if is_buy else tick.ask)
    if price <= 0:
        price = float(getattr(pos, "price_current", 0) or 0)
    if price <= 0:
        log.error("KAPATMA RED: %s ticket=%s fiyat yok", pos.symbol, pos.ticket)
        return False
    if cfg.get("dry_run", True):
        log.info("[DRY] BEYIN KAPAT %s ticket=%s pnl=%.2f neden=%s",
                 pos.symbol, pos.ticket, _net_position_pnl(pos), reason)
        return False
    req = {
        "action": mt5.TRADE_ACTION_DEAL,
        "symbol": pos.symbol,
        "volume": float(pos.volume),
        "type": mt5.ORDER_TYPE_SELL if is_buy else mt5.ORDER_TYPE_BUY,
        "position": int(pos.ticket),
        "price": price,
        "deviation": int(cfg.get("deviation_points", 30)),
        "magic": int(getattr(pos, "magic", 0) or 0),
        "comment": ("brain:" + str(reason))[:29],
        "type_time": mt5.ORDER_TIME_GTC,
    }
    result = _send_with_filling(req)
    ok = bool(result and result.retcode in (
        getattr(mt5, "TRADE_RETCODE_DONE", 10009),
        getattr(mt5, "TRADE_RETCODE_DONE_PARTIAL", 10010),
    ))
    if ok:
        ticket = str(getattr(pos, "ticket", ""))
        identifier = str(getattr(pos, "identifier", "") or ticket)
        close_meta = {
            "reason": reason, "requestedSec": int(time.time()), "requestedPrice": price,
        }
        reasons = state.setdefault("close_reasons", {})
        reasons[ticket] = close_meta
        reasons[identifier] = close_meta
        partial = int(getattr(result, "retcode", 0) or 0) == getattr(
            mt5, "TRADE_RETCODE_DONE_PARTIAL", 10010)
        if partial:
            log.warning(
                "BEYIN KISMI KAPATMA DOLUMU %s ticket=%s dolan=%s/%s; kalan sonraki turda tekrar denenecek neden=%s",
                pos.symbol, ticket, getattr(result, "volume", "?"),
                getattr(pos, "volume", "?"), reason)
        else:
            log.warning("BEYIN KAPATMA DOLUMU %s ticket=%s pnl=%.2f neden=%s",
                        pos.symbol, ticket, _net_position_pnl(pos), reason)
    else:
        log.error("BEYIN KAPATAMADI %s ticket=%s neden=%s sonuc=%s hata=%s",
                  pos.symbol, pos.ticket, reason,
                  getattr(result, "retcode", None), mt5.last_error())
    return ok


def _write_stop(reason, snapshot):
    mode, _ = _stop_mode()
    if mode == "manual":
        # A human-created plaintext STOP is never overwritten or reinterpreted.
        return False
    if mode == "close-only":
        return True
    value = {
        "createdSec": int(time.time()),
        "reason": reason,
        "source": "central-account-brain",
        "closeOnly": True,
        "emergencyFlatten": True,
        "snapshot": snapshot,
        "resume": "Pozisyonlar sifirlandiktan ve insan incelemesinden sonra DEVAM kullanin.",
    }
    if mode == "risk-incomplete":
        # Migrate only an unmistakable risk JSON.  Plaintext/manual STOPs stay
        # untouched, while a legacy half-latch cannot strand the daemon after
        # a reboot.
        try:
            with open(STOP_MASTER, "r", encoding="utf-8-sig") as fh:
                existing = json.load(fh)
            if isinstance(existing, dict):
                value = dict(existing, **value)
        except (OSError, ValueError, TypeError, json.JSONDecodeError):
            return False
    _atomic_json(STOP_MASTER, value)
    return True


def _snapshot(cfg, ai, positions, deals, state, telemetry_ok=True,
              managed_count=None):
    balance = float(getattr(ai, "balance", 0) or 0)
    equity = float(getattr(ai, "equity", 0) or 0)
    login = int(getattr(ai, "login", 0) or 0)
    # F4: gunun neti imlecten BAGIMSIZ pencereden okunur. Okunamazsa None
    # gonderilir -> backend "mutabakat yapilamadi" der; sahte 0.00 ASLA yollanmaz.
    day_deals = _day_deals()
    realized = None if day_deals is None else _realized_today(day_deals)
    floating = sum(_net_position_pnl(p) for p in positions)
    day = _trading_day()

    server = str(getattr(ai, "server", "") or "")
    state_server = str(state.get("server") or "")
    if int(state.get("login", 0) or 0) != login or (
            state_server and state_server.lower() != server.lower()):
        if int(state.get("login", 0) or 0) and not cfg.get("dry_run", True):
            raise RuntimeError("live state hesap degisimi: explicit bootstrap gerekli")
        state.clear()
        state.update({
            "version": 3,
            "login": login,
            "server": server,
            "initialBalance": balance,
            "initialEquity": equity,
            "peakEquity": max(balance, equity),
            "day": day,
            "dayStartEquity": max(0.01, equity),
            "tickets": {},
            "close_reasons": {},
        })
    if state.get("day") != day:
        state["day"] = day
        state["dayStartEquity"] = max(0.01, equity)
    state["peakEquity"] = max(float(state.get("peakEquity", equity) or equity), equity)
    state["version"] = 3
    state["server"] = server

    if "initialEquity" not in state:
        state["initialEquity"] = max(
            0.01, float(state.get("initialBalance", equity) or equity))
    if "dayStartEquity" not in state:
        # One-time conservative migration from the old balance baseline.  It
        # never lets carried floating profit offset future losses.
        old_day = float(state.get("dayStartBalance", equity) or equity)
        state["dayStartEquity"] = max(0.01, equity, old_day)

    day_start = max(0.01, float(state.get("dayStartEquity", equity) or equity))
    initial = max(0.01, float(state.get("initialEquity", equity) or equity))
    peak = max(0.01, float(state.get("peakEquity", equity) or equity))
    daily_loss_pct = max(0.0, (day_start - equity) / day_start * 100.0)
    total_dd_pct = max(0.0, (peak - equity) / peak * 100.0)
    profit_pct = (equity - initial) / initial * 100.0

    open_risk = 0.0
    unbounded = []
    by_bot = {}
    by_symbol_side = {}
    for pos in positions:
        risk = _initial_risk_usd(pos)
        if risk is None or not math.isfinite(float(risk)) or risk < 0:
            unbounded.append(str(pos.ticket))
        else:
            open_risk += risk
            magic = int(getattr(pos, "magic", 0) or 0)
            bot_key = str(magic) if magic > 0 else "manual-or-unknown"
            side = "buy" if int(getattr(pos, "type", 0) or 0) == getattr(
                mt5, "POSITION_TYPE_BUY", 0) else "sell"
            symbol_key = "%s|%s" % (
                account_brain.canonical_underlying(getattr(pos, "symbol", "")), side)
            by_bot[bot_key] = by_bot.get(bot_key, 0.0) + risk
            by_symbol_side[symbol_key] = by_symbol_side.get(symbol_key, 0.0) + risk
    open_risk_pct = open_risk / equity * 100.0 if equity > 0 else 999.0
    max_bot_pct = (max(by_bot.values(), default=0.0) / equity * 100.0
                   if equity > 0 else 999.0)
    max_symbol_side_pct = (max(by_symbol_side.values(), default=0.0) / equity * 100.0
                           if equity > 0 else 999.0)
    # Suresi dolan yeniden-giris sogumalarini temizle; kalanlari heartbeat'e
    # koy ki TUM kopruler (adapter) ayni kapiyi gorsun.
    cooldowns = state.get("reentryCooldowns")
    active_cooldowns = {}
    if isinstance(cooldowns, dict):
        now_sec = time.time()
        for key in list(cooldowns):
            row = cooldowns.get(key)
            try:
                until = float((row or {}).get("untilSec", 0) or 0)
            except (TypeError, ValueError):
                until = 0.0
            if not isinstance(row, dict) or until <= now_sec:
                cooldowns.pop(key, None)
            else:
                active_cooldowns[key] = {
                    "untilSec": int(until),
                    "direction": str(row.get("direction") or ""),
                }
    return {
        "reentryCooldowns": active_cooldowns,
        "version": VERSION,
        "timeSec": int(time.time()),
        "ok": bool(telemetry_ok),
        "dryRun": bool(cfg.get("dry_run", True)),
        "raceMode": cfg.get("race_mode") is True,
        "login": login,
        "server": server,
        "balance": round(balance, 2),
        "equity": round(equity, 2),
        "initialBalance": round(initial, 2),
        "initialEquity": round(initial, 2),
        "peakEquity": round(peak, 2),
        "dayStartBalance": round(day_start, 2),
        "dayStartEquity": round(day_start, 2),
        "realizedToday": None if realized is None else round(realized, 2),
        "floatingPnl": round(floating, 2),
        "dailyLossPct": round(daily_loss_pct, 4),
        "totalDrawdownPct": round(total_dd_pct, 4),
        "profitPct": round(profit_pct, 4),
        "openRiskUsd": round(open_risk, 2),
        "openRiskPct": round(open_risk_pct, 4),
        "maxBotRiskPct": round(max_bot_pct, 4),
        "maxSymbolSideRiskPct": round(max_symbol_side_pct, 4),
        "unboundedTickets": unbounded,
        "openPositions": len(positions),
        "managedOpenPositions": len(positions) if managed_count is None else int(managed_count),
        "lastReportSuccessSec": int(state.get("lastReportSuccessSec", 0) or 0),
        "telemetryOk": bool(telemetry_ok),
        "stopMaster": os.path.exists(STOP_MASTER),
    }


def _cfg_float(cfg, names, default):
    for name in names:
        value = cfg.get(name)
        if value is not None:
            try:
                return float(value)
            except (TypeError, ValueError):
                continue
    return float(default)


def _global_exit_reason(cfg, snap):
    # User hard ceilings cannot be widened by local config. Lower values remain
    # allowed as an intentionally safer policy.
    profit_stop = 10.0
    daily_flatten = min(4.25, max(0.01, _cfg_float(
        cfg, ("daily_loss_flatten_pct_account", "daily_flatten_pct"), 4.25)))
    total_flatten = min(9.25, max(0.01, _cfg_float(
        cfg, ("total_drawdown_flatten_pct_account", "total_flatten_pct"), 9.25)))
    open_hard = min(2.0, max(0.01, _cfg_float(
        cfg, ("hard_max_open_risk_pct",), 2.0)))
    symbol_hard = min(0.5, max(0.01, _cfg_float(
        cfg, ("max_symbol_side_risk_pct",), 0.5)))
    bot_hard = min(0.5, max(0.01, _cfg_float(
        cfg, ("max_bot_risk_pct",), 0.5)))
    if snap.get("unboundedTickets"):
        return "unbounded-open-risk"
    if cfg.get("race_mode") is not True:
        if snap.get("openRiskPct", 0) > open_hard + 1e-9:
            return "open-risk-hard-%s" % open_hard
        if snap.get("maxSymbolSideRiskPct", 0) > symbol_hard + 1e-9:
            return "symbol-side-risk-hard-%s" % symbol_hard
        if snap.get("maxBotRiskPct", 0) > bot_hard + 1e-9:
            return "bot-risk-hard-%s" % bot_hard
    if snap["profitPct"] >= profit_stop:
        return "profit-target-%s" % profit_stop
    if snap["dailyLossPct"] >= daily_flatten:
        return "daily-loss-buffer-%s" % daily_flatten
    if snap["totalDrawdownPct"] >= total_flatten:
        return "total-drawdown-buffer-%s" % total_flatten
    return None


def _dynamic_exit_reason(cfg, pos, meta, now):
    pnl = _net_position_pnl(pos)
    peak_raw = meta.get("peakPnl", pnl)
    peak = max(float(pnl if peak_raw is None else peak_raw), pnl)
    if pnl >= peak:
        meta["peakPnl"] = pnl
        meta["peakSec"] = now
        peak = pnl
    else:
        meta["peakPnl"] = peak
    risk = float(meta.get("initialRiskUsd", 0) or 0)
    if risk <= 0:
        raw_risk = _initial_risk_usd(pos)
        meta["initialRiskUsd"] = raw_risk
        risk = (float(raw_risk)
                if isinstance(raw_risk, (int, float))
                and not isinstance(raw_risk, bool)
                and math.isfinite(float(raw_risk)) else 0.0)

    arm = max(float(cfg.get("profit_lock_arm_usd", 20.0)),
              float(cfg.get("min_discretionary_exit_usd", 15.0)))
    # Kurus-islem/churn onlemi: kar kilidi tepe en az +1R (config) olmadan
    # silahlanmaz; $20'lik dolar esigi 40-50$ riskli islemde 0.5R'de erken
    # kar aldirip ayni sinyalin yeniden acilmasina yol aciyordu.
    if risk > 0:
        arm = max(arm, risk * float(cfg.get("profit_giveback_activation_r", 2.5)))
    # Komisyon giris+cikista alinir; _net_position_pnl sadece profit+swap (BRUT).
    # Kullanici: net kar min 100 $ + komisyonla orantili OLMADAN pozisyon kapanmaz.
    # peak bu esigi gecmeden kar kilidi silahlanmaz; floor bunun altina inmez.
    komisyon = abs(float(getattr(pos, "commission", 0) or 0))
    komisyon_toplam = (komisyon * 2.0) if komisyon > 0 else (
        float(getattr(pos, "volume", 0) or 0)
        * float(cfg.get("est_commission_per_lot", 4.0)))
    net_esik = float(cfg.get("min_giveback_peak_usd", 100.0)) + komisyon_toplam
    arm = max(arm, net_esik)
    floor = max(float(cfg.get("profit_lock_floor_usd", 15.0)), net_esik)
    giveback = float(cfg.get("profit_giveback_pct", 20.0)) / 100.0
    if peak >= arm:
        locked = max(floor, peak * (1.0 - giveback))
        if pnl <= locked:
            return "profit-giveback-peak-%.2f-now-%.2f" % (peak, pnl)
        peak_age = now - float(meta.get("peakSec", now) or now)
        hype_drop = peak - pnl
        hype_pct = float(cfg.get("hype_giveback_pct", 12.0)) / 100.0
        if (peak_age <= float(cfg.get("hype_window_seconds", 20))
                and hype_drop >= peak * hype_pct and pnl >= floor):
            return "fast-hype-reversal-peak-%.2f-now-%.2f" % (peak, pnl)

    prev_raw = meta.get("lastPnl", pnl)
    prev_sec_raw = meta.get("lastSec", now)
    prev_pnl = float(pnl if prev_raw is None else prev_raw)
    prev_sec = float(now if prev_sec_raw is None else prev_sec_raw)
    meta["lastPnl"] = pnl
    meta["lastSec"] = now
    min_exit = float(cfg.get("min_discretionary_exit_usd", 15.0))
    if risk > 0 and pnl <= -max(min_exit, risk * float(cfg.get("adverse_exit_r", 0.55))):
        deterioration = prev_pnl - pnl
        if (now - prev_sec <= float(cfg.get("adverse_window_seconds", 12))
                and deterioration >= risk * float(cfg.get("adverse_acceleration_r", 0.20))):
            return "fast-adverse-move-%.2fR" % (abs(pnl) / risk)
    return None


def _position_r(pos, meta):
    """Pozisyonun anlik R'si (kar/ilk risk). Risk bilinmiyorsa None."""
    risk = meta.get("initialRiskUsd") if isinstance(meta, dict) else None
    try:
        risk = float(risk)
    except (TypeError, ValueError):
        risk = 0.0
    if not math.isfinite(risk) or risk <= 0:
        risk = _initial_risk_usd(pos) or 0.0
        if isinstance(meta, dict) and risk > 0:
            meta["initialRiskUsd"] = risk
    if not risk or risk <= 0:
        return None
    return _net_position_pnl(pos) / risk


def herd_reversal_cuts(cfg, positions, tickets, now):
    """Ani ters donuste SURU halinde zarara giden yonu kes.

    Ayni yonde >= herd_min_positions pozisyon varken, bunlarin en az
    herd_losing_fraction kadari zararda VE pozisyon basina ORTALAMA geri verme
    (her pozisyonun son herd_window_seconds icindeki kendi tepesinden) en az
    herd_drawdown_r ise:
    o yonun ZARARDAKI pozisyonlari kapatilir (kazananlar korunur, kar
    tasima/trail onlara devam eder).  Fonksiyon SAF: hangi ticketlarin
    kapatilacagini ve hangi yonlerin sogumaya alinacagini dondurur.

    Donen: (cut_list, reason_text) — cut_list: (pos, meta, side) uclusu.
    Sogutma yazimi CAGIRANA aittir ve yalniz kapatma BASARILI olursa yapilir.
    """
    min_count = int(cfg.get("herd_min_positions", 5) or 0)
    if min_count <= 0 or len(positions) < min_count:
        return [], None
    frac = float(cfg.get("herd_losing_fraction", 0.70))
    window = float(cfg.get("herd_window_seconds", 90.0))
    drop_r = float(cfg.get("herd_drawdown_r", 1.5))
    cut_loss_r = float(cfg.get("herd_cut_loss_r", 0.10))
    buy_type = getattr(mt5, "POSITION_TYPE_BUY", 0)

    sides = {"long": [], "short": []}
    for pos in positions:
        key = str(getattr(pos, "identifier", "") or getattr(pos, "ticket", ""))
        meta = tickets.get(key) if isinstance(tickets, dict) else None
        side = "long" if int(getattr(pos, "type", 0) or 0) == buy_type else "short"
        sides[side].append((pos, meta if isinstance(meta, dict) else {}))

    cuts, reasons = [], []
    for side, rows in sides.items():
        if len(rows) < min_count:
            continue
        # POZISYON-BASINA tepe: her pozisyon kendi tepesinden ne kadar geri
        # verdi? Toplam-R kullanmak KUME KOMPOZISYONUNA duyarliydi — bir
        # kazanan TP'de kapaninca toplam ziplayarak duser ve fiyat hic
        # oynamasa bile "geri verme" sanilirdi (kardes pozisyonlari infaz
        # eden deterministik tetik). Pozisyon-basina olcum bundan bagimsizdir.
        known = []
        for p, m in rows:
            r = _position_r(p, m)
            if r is None or not math.isfinite(r):
                continue
            prev = m.get("herdPeakR")
            prev_sec = m.get("herdPeakSec")
            try:
                prev = float(prev)
                prev_sec = float(prev_sec)
            except (TypeError, ValueError):
                prev, prev_sec = None, 0.0
            if (prev is None or not math.isfinite(prev)
                    or now - prev_sec > window or r >= prev):
                prev = r
                m["herdPeakR"] = r
                m["herdPeakSec"] = now
            known.append((r, prev, p, m))
        if len(known) < min_count:
            continue
        losing = [row for row in known if row[0] < 0]
        # Ortalama geri verme: pozisyon sayisi arttikca esik kaymaz.
        give_back = sum(max(0.0, pk - r) for r, pk, _, _ in known) / len(known)
        if len(losing) < math.ceil(frac * len(known)) or give_back < drop_r:
            continue
        # TERS DONUS TEYIDI: zarardaki tarafi kes, kazananlari birak.
        side_cuts = [(p, m, side) for r, _pk, p, m in losing
                     if r <= -abs(cut_loss_r)]
        if not side_cuts:
            continue
        cuts.extend(side_cuts)
        reasons.append("herd-reversal-%s-%d/%d-zarar-%.2fR-geri" % (
            side, len(losing), len(known), give_back))
    return cuts, (" | ".join(reasons) if reasons else None)


def _maybe_extend_runner(cfg, pos, meta):
    """Kazanani kosturan TP: tepe runner_arm_r'yi gorunce TP cok uzaga tasinir.

    R:R hedefi kazanan islemi erken kapatmasin; kar korumasi trail + kar-kilidi
    + tepe geri-vermede.  TP yalniz LEHTE (uzaga) tasinir, SL'e dokunulmaz.
    """
    arm_r = float(cfg.get("runner_arm_r", 0) or 0)
    if arm_r <= 0:
        return
    now_sec = time.time()
    retry_after = meta.get("runnerRetryAfterSec") if isinstance(meta, dict) else None
    if isinstance(retry_after, (int, float)) and not isinstance(retry_after, bool) \
            and math.isfinite(float(retry_after)) and now_sec < float(retry_after):
        return
    entry = float(getattr(pos, "price_open", 0) or 0)
    baseline = meta.get("initialSlPrice") if isinstance(meta, dict) else None
    try:
        baseline = float(baseline)
    except (TypeError, ValueError):
        baseline = 0.0
    if entry <= 0 or baseline <= 0:
        return
    is_buy = int(getattr(pos, "type", 0) or 0) == getattr(mt5, "POSITION_TYPE_BUY", 0)
    adverse = baseline < entry if is_buy else baseline > entry
    risk_dist = abs(entry - baseline)
    if not adverse or risk_dist <= 0:
        return
    # Anlik R'yi de hesaba kat: peakR yalniz trail icinde guncellenir ve runner
    # trail'den ONCE calisir; yalniz peakR'ye bakmak tetiklemeyi bir tur geciktirir.
    peak_r = meta.get("peakR") if isinstance(meta, dict) else None
    try:
        peak_r = float(peak_r)
    except (TypeError, ValueError):
        peak_r = 0.0
    if not math.isfinite(peak_r):
        peak_r = 0.0
    live_r = _position_r(pos, meta if isinstance(meta, dict) else {})
    if live_r is not None and math.isfinite(live_r):
        peak_r = max(peak_r, live_r)
    if peak_r < arm_r:
        return
    target_r = max(float(cfg.get("runner_target_r", 10.0)), arm_r + 1.0)
    desired = entry + target_r * risk_dist if is_buy else entry - target_r * risk_dist
    info = mt5.symbol_info(getattr(pos, "symbol", ""))
    if info is None:
        return
    digits = int(getattr(info, "digits", 5) or 5)
    point = float(getattr(info, "point", 0) or 0)
    desired = round(desired, digits)
    if not math.isfinite(desired) or desired <= 0:
        return
    current_tp = float(getattr(pos, "tp", 0) or 0)
    eps = point / 2 if point > 0 else 1e-9
    # Yalniz UZAGA tasi; TP zaten uzaktaysa (veya yoksa) dokunma.
    if current_tp <= 0:
        return
    if is_buy and desired <= current_tp + eps:
        return
    if (not is_buy) and desired >= current_tp - eps:
        return
    if cfg.get("dry_run", True):
        log.info("[DRY] RUNNER TP %.2fR %s ticket=%s TP %s -> %s",
                 peak_r, getattr(pos, "symbol", "?"),
                 getattr(pos, "ticket", "?"), current_tp, desired)
        if isinstance(meta, dict):
            meta["runnerArmed"] = True
        return
    # SL'i TAZE oku: kopru/trail SL'i az once sikilastirmis olabilir; bayat
    # pos.sl gonderilirse SLTP yazimi stopu GEVSETIR (kar korumasini bozar).
    current_sl = float(getattr(pos, "sl", 0) or 0)
    try:
        fresh = mt5.positions_get(ticket=int(getattr(pos, "ticket", 0) or 0))
        if fresh:
            current_sl = float(getattr(fresh[0], "sl", current_sl) or current_sl)
    except Exception:
        pass
    req = {
        "action": mt5.TRADE_ACTION_SLTP,
        "position": int(getattr(pos, "ticket", 0) or 0),
        "symbol": getattr(pos, "symbol", ""),
        "sl": current_sl,
        "tp": desired,
    }
    result = mt5.order_send(req)
    if result is not None and int(getattr(result, "retcode", 0) or 0) == getattr(
            mt5, "TRADE_RETCODE_DONE", 10009):
        if isinstance(meta, dict):
            meta["runnerArmed"] = True
            meta.pop("runnerRetryAfterSec", None)
            meta.pop("runnerFailCount", None)
        log.info("RUNNER TP %.2fR %s ticket=%s TP -> %s (kazanan kosuyor)",
                 peak_r, getattr(pos, "symbol", "?"),
                 getattr(pos, "ticket", "?"), desired)
    else:
        # Ustel geri cekilme: reddedilen istek saniyede bir tekrarlanmasin.
        if isinstance(meta, dict):
            fails = int(meta.get("runnerFailCount", 0) or 0) + 1
            meta["runnerFailCount"] = fails
            meta["runnerRetryAfterSec"] = now_sec + min(900.0, 15.0 * (2 ** min(fails, 6)))
        log.warning("RUNNER TP tasinamadi %s ticket=%s retcode=%s",
                    getattr(pos, "symbol", "?"), getattr(pos, "ticket", "?"),
                    getattr(result, "retcode", None))


def _maybe_trail_stop(cfg, pos, meta):
    """+3R sonrasi broker SL'ini tepe R'nin trail_distance_r gerisinde tut.

    Fiyat-R hesabi ilk gorulen SL mesafesine baglanir (restart sonrasi
    trail'lenmis SL baz alinir -> daha muhafazakar).  SL yalniz LEHTE tasinir;
    broker minimum stop mesafesine uyulur, TP'ye dokunulmaz.
    """
    entry = float(getattr(pos, "price_open", 0) or 0)
    sl = float(getattr(pos, "sl", 0) or 0)
    if entry <= 0 or sl <= 0:
        return  # SL'siz pozisyon zaten unbounded-risk frenine takilir
    is_buy = int(getattr(pos, "type", 0) or 0) == getattr(
        mt5, "POSITION_TYPE_BUY", 0)
    now = time.time()
    retry_after = meta.get("trailRetryAfterSec")
    if isinstance(retry_after, (int, float)) and not isinstance(retry_after, bool) \
            and math.isfinite(float(retry_after)) and now < float(retry_after):
        return
    baseline = meta.get("initialSlPrice")
    if (isinstance(baseline, bool) or not isinstance(baseline, (int, float))
            or not math.isfinite(float(baseline)) or float(baseline) <= 0):
        meta["initialSlPrice"] = sl
        baseline = sl
    baseline = float(baseline)
    adverse = baseline < entry if is_buy else baseline > entry
    if not adverse:
        # Baseline zaten kar bolgesinde (onceki trail'den devralindi); mesafe
        # olarak giris-SL yerine mevcut SL-fiyat R'si kullanilamaz, cik.
        return
    risk_dist = abs(entry - baseline)
    if risk_dist <= 0:
        return
    price = float(getattr(pos, "price_current", 0) or 0)
    tick = mt5.symbol_info_tick(getattr(pos, "symbol", ""))
    if tick is not None:
        side_price = float(getattr(tick, "bid" if is_buy else "ask", 0) or 0)
        if side_price > 0:
            price = side_price
    if price <= 0:
        return
    favorable = (price - entry) if is_buy else (entry - price)
    r_now = favorable / risk_dist
    if not math.isfinite(r_now):
        return
    peak_raw = meta.get("peakR")
    peak_r = r_now if (isinstance(peak_raw, bool)
                       or not isinstance(peak_raw, (int, float))
                       or not math.isfinite(float(peak_raw))) else \
        max(float(peak_raw), r_now)
    meta["peakR"] = peak_r
    if peak_r < float(cfg.get("trail_start_r", 3.0)):
        return
    lock_r = peak_r - float(cfg.get("trail_distance_r", 1.0))
    desired = entry + lock_r * risk_dist if is_buy else entry - lock_r * risk_dist
    info = mt5.symbol_info(getattr(pos, "symbol", ""))
    if info is None:
        return
    point = float(getattr(info, "point", 0) or 0)
    digits = int(getattr(info, "digits", 5) or 5)
    stops_level = int(getattr(info, "trade_stops_level", 0) or 0)
    freeze_level = int(getattr(info, "trade_freeze_level", 0) or 0)
    spread = int(getattr(info, "spread", 0) or 0)
    min_dist = max(stops_level, freeze_level, spread + 1, 10) * point
    desired = round(desired, digits)
    if not math.isfinite(desired) or desired <= 0:
        return
    eps = point / 2 if point > 0 else 1e-9
    if is_buy:
        if desired <= sl + eps or desired >= price - min_dist:
            return
    else:
        if desired >= sl - eps or desired <= price + min_dist:
            return
    if cfg.get("dry_run", True):
        log.info("[DRY] TRAIL %.2fR %s ticket=%s SL %s -> %s",
                 peak_r, getattr(pos, "symbol", "?"),
                 getattr(pos, "ticket", "?"), sl, desired)
        return
    # TP'yi TAZE oku: runner ayni turda TP'yi uzatmis olabilir; bayat pos.tp
    # gonderilirse SLTP yazimi runner'in isini GERI ALIR.
    current_tp = float(getattr(pos, "tp", 0) or 0)
    try:
        fresh = mt5.positions_get(ticket=int(getattr(pos, "ticket", 0) or 0))
        if fresh:
            current_tp = float(getattr(fresh[0], "tp", current_tp) or current_tp)
    except Exception:
        pass
    req = {
        "action": mt5.TRADE_ACTION_SLTP,
        "position": int(getattr(pos, "ticket", 0) or 0),
        "symbol": getattr(pos, "symbol", ""),
        "sl": desired,
        "tp": current_tp,
    }
    result = mt5.order_send(req)
    if result is not None and int(getattr(result, "retcode", 0) or 0) == getattr(
            mt5, "TRADE_RETCODE_DONE", 10009):
        meta.pop("trailRetryAfterSec", None)
        meta.pop("trailFailCount", None)
        log.info("TRAIL %.2fR %s ticket=%s SL -> %s",
                 peak_r, getattr(pos, "symbol", "?"),
                 getattr(pos, "ticket", "?"), desired)
    else:
        # Ustel geri cekilme: kapali piyasa/baglanti kesintisinde saniyelik
        # modify yagmuru olmasin (15sn -> ... -> 15dk tavani).
        fails = int(meta.get("trailFailCount", 0) or 0) + 1
        meta["trailFailCount"] = fails
        meta["trailRetryAfterSec"] = now + min(900.0, 15.0 * (2 ** min(fails, 6)))
        log.error("TRAIL basarisiz %s ticket=%s retcode=%s hata=%s (tekrar %ss sonra)",
                  getattr(pos, "symbol", "?"), getattr(pos, "ticket", "?"),
                  getattr(result, "retcode", None), mt5.last_error(),
                  int(meta["trailRetryAfterSec"] - now))


def _parse_code(comment):
    value = str(comment or "").strip()
    for prefix in ("A#", "BK#", "BKG#"):
        if value.startswith(prefix):
            return value[len(prefix):]
    return value or None


def _open_rows(positions, account=None, server=None):
    rows = []
    buy = getattr(mt5, "POSITION_TYPE_BUY", 0)
    for pos in positions:
        ticket = str(getattr(pos, "ticket", ""))
        identifier = str(getattr(pos, "identifier", "") or ticket)
        rows.append({
            "ticket": ticket,
            "positionTicket": ticket,
            "positionIdentifier": identifier,
            "account": int(account or 0),
            "server": str(server or ""),
            "magic": int(getattr(pos, "magic", 0) or 0),
            "code": _parse_code(getattr(pos, "comment", "")),
            "comment": str(getattr(pos, "comment", "") or ""),
            "symbol": str(getattr(pos, "symbol", "") or ""),
            "direction": "long" if getattr(pos, "type", 0) == buy else "short",
            "lot": float(getattr(pos, "volume", 0) or 0),
            "price": float(getattr(pos, "price_open", 0) or 0),
            "entryPrice": float(getattr(pos, "price_open", 0) or 0),
            "sl": float(getattr(pos, "sl", 0) or 0),
            "tp": float(getattr(pos, "tp", 0) or 0),
            "openedSec": int(getattr(pos, "time", 0) or 0),
        })
    return rows


def _deal_sort_key(deal):
    return (int(getattr(deal, "time_msc", 0) or 0),
            int(getattr(deal, "time", 0) or 0),
            int(getattr(deal, "ticket", 0) or 0))


def _position_history(position_ticket):
    """Fetch the complete broker lifecycle so entry commission is included."""
    try:
        rows = mt5.history_deals_get(position=int(position_ticket))
    except Exception as exc:
        log.error("position deal gecmisi alinamadi ticket=%s: %s",
                  position_ticket, exc)
        return None
    if rows is None:
        log.error("position deal gecmisi None ticket=%s: %s",
                  position_ticket, mt5.last_error())
        return None
    return list(rows)


def _closed_rows(deals, state, min_closed_sec=0, live_position_tickets=(),
                 account=None, server=None, return_status=False):
    """Emit one exact net row only when a broker position is fully closed.

    Partial exit deals remain silent while their position ticket is live.  On
    final closure every deal in that position lifecycle is aggregated, so the
    result includes entry and exit commission, swap and fee exactly once.
    """
    rows = []
    blocked_position_ids = []
    blocked_floor_sec = []          # bloke edilen en eski kapanis zamanlari
    deferred_position_ids = []      # kismi kapanis: bloke DEGIL, yalniz ertelendi
    reasons = state.get("close_reasons", {})
    live = {str(ticket) for ticket in live_position_tickets}
    candidates = {}
    boundary = int(min_closed_sec or 0)
    for deal in deals:
        if not _is_close_deal(deal) or int(getattr(deal, "magic", 0) or 0) <= 0:
            continue
        if int(getattr(deal, "time", 0) or 0) < boundary:
            continue
        position_ticket = str(getattr(deal, "position_id", "") or "")
        if not position_ticket:
            continue
        candidates.setdefault(position_ticket, []).append(deal)

    for position_ticket, recent_closes in candidates.items():
        if position_ticket in live:
            # F3 (2026-08-01 dusman incelemesi): burada eskiden cursor BLOKE
            # ediliyordu (A2b). Bu YANLISTI ve kalici kilitlenme uretiyordu:
            #   - Kismi kapanis (3R iz suren stop / kar tasiyici runner tasarimi
            #     bunu ZATEN yapar) pozisyonu acik birakir ama OUT deal'i tarihe
            #     yazar -> cursor GUNLERCE cakili kalir.
            #   - Cakili cursor = her 2 saniyede 48 saatlik tum kapanis gecmisi
            #     yeniden cekilir ve POST edilir. Olculen: cursor 7 gun takili
            #     iken her raporda 420 MT5 IPC cagrisi, saniyede ~210. Bu, 1
            #     saniyelik trail/erken-cikis dongusuyle AYNI thread'de kosar ->
            #     iz suren stop ve acil cikis saniyelerce gecikir. Defter hatasi
            #     trading guvenligi hatasina donusur.
            #
            # Blokaj GEREKSIZDIR: pozisyon tamamen kapandiginda FINAL deal
            # cursor'un ILERISINDE olur ve _position_history() kismi cikis dahil
            # TUM yasam dongusunu toplar. Yani satir kaybi olmaz.
            deferred_position_ids.append(position_ticket)
            continue
        lifecycle = _position_history(position_ticket)
        if lifecycle is None:
            # Net tutar eksikken cursor ILERLEMEZ (gecici MT5 hatasi; bir
            # sonraki tur ayni kapanisi yeniden dener). Bu dal GERCEKTEN blokaj
            # gerektirir cunku deal artik gecmiste kalir. Blokaj yalniz bu
            # kapanisin zamanina kadar geri ceker, tum gecmisi degil.
            blocked_position_ids.append(position_ticket)
            blocked_floor_sec.append(
                min(int(getattr(d, "time", 0) or 0) for d in recent_closes))
            continue
        close_deals = [deal for deal in lifecycle if _is_close_deal(deal)]
        if not close_deals:
            continue
        latest = max(close_deals, key=_deal_sort_key)
        if int(getattr(latest, "time", 0) or 0) < boundary:
            continue

        profit = sum(float(getattr(d, "profit", 0) or 0) for d in lifecycle)
        commission = sum(float(getattr(d, "commission", 0) or 0) for d in lifecycle)
        swap = sum(float(getattr(d, "swap", 0) or 0) for d in lifecycle)
        fee = sum(float(getattr(d, "fee", 0) or 0) for d in lifecycle)
        volume = sum(float(getattr(d, "volume", 0) or 0) for d in close_deals)
        magic = int(getattr(latest, "magic", 0) or 0)
        if magic <= 0:
            magic = next((int(getattr(d, "magic", 0) or 0)
                          for d in lifecycle
                          if int(getattr(d, "magic", 0) or 0) > 0), 0)
        if magic <= 0:
            continue

        comment = str(getattr(latest, "comment", "") or "")
        code = None
        for item in sorted(lifecycle, key=_deal_sort_key):
            item_comment = str(getattr(item, "comment", "") or "")
            if item_comment.startswith(("A#", "BK#", "BKG#")):
                code = _parse_code(item_comment)
                comment = item_comment
                break
        local_reason = reasons.get(position_ticket, {})
        rows.append({
            "id": str(getattr(latest, "ticket", "")),
            "dealTicket": str(getattr(latest, "ticket", "")),
            "positionTicket": position_ticket,
            "positionIdentifier": position_ticket,
            "account": int(account or 0),
            "server": str(server or ""),
            "magic": magic,
            "code": code or _parse_code(comment),
            "comment": comment,
            "symbol": str(getattr(latest, "symbol", "") or next(
                (getattr(d, "symbol", "") for d in lifecycle
                 if getattr(d, "symbol", "")), "")),
            "lot": round(volume, 8),
            "price": float(getattr(latest, "price", 0) or 0),
            "exitPrice": float(getattr(latest, "price", 0) or 0),
            "profit": round(profit, 2),
            "commission": round(commission, 2),
            "swap": round(swap, 2),
            "fee": round(fee, 2),
            "pnl": round(profit + commission + swap + fee, 2),
            "componentsExact": True,
            "closedSec": int(getattr(latest, "time", 0) or 0),
            "reason": local_reason.get("reason") or str(
                getattr(latest, "reason", "broker")),
            "reasonCode": int(getattr(latest, "reason", 0) or 0),
        })
    rows = sorted(rows, key=lambda row: (row["closedSec"], row["dealTicket"]))
    if return_status:
        # floor: cursor bu degerin ONUNE gecmemeli (0 = sinir yok).
        floor = min(blocked_floor_sec) if blocked_floor_sec else 0
        return rows, floor, tuple(blocked_position_ids), tuple(deferred_position_ids)
    return rows


def _backend_base(cfg):
    base = str(cfg.get("backend_url") or "").rstrip("/")
    if "://borsakrali.com" in base:
        base = base.replace("://borsakrali.com", "://www.borsakrali.com", 1)
    return base


def _report_state(cfg, positions, deals, state, snap, live_positions=None,
                  history_cutoff_sec=None):
    token = str(cfg.get("exec_token") or "")
    if not token:
        log.warning("exec_token bos: broker yasam dongusu backend'e raporlanamiyor")
        return False
    # Broker fills queued synchronously by the entry bridges must reach the
    # backend before any later close. Keep close cursor unchanged on failure.
    mt5_brain_adapter.flush_broker_event_outbox(cfg, logger=log)
    pending_opens = mt5_brain_adapter.broker_event_outbox_count(cfg)
    # A2 (2026-07-31): Eskiden burada `return False` vardi -> acilis kuyrugu
    # doluyken KAPANIS satirlari hic POST edilmiyordu. Telegram hiz limitine
    # takilan tek bir acilis, tum hesap defterini durduruyordu (gercek
    # -3.234,88 $ iken rapor -74,51 $). Mesaj SIRASI artik backend tarafinda
    # korunuyor (kapanis, acilisi gonderilmemis pozisyon icin "waiting-open"
    # olarak bekletilir), bu yuzden kapanis satirlarini gondermek guvenlidir.
    # Kayit gecikirse defter delinir; sira zaten karsi tarafta garanti altinda.
    if pending_opens:
        log.warning("%s broker acilis olayi kuyrukta; kapanis defteri yine de "
                    "gonderiliyor (sira backend tarafinda korunur)", pending_opens)
    stored_cursor = int(state.get("notificationCursorSec", 0) or 0)
    established_cursor = stored_cursor > 0
    cursor = stored_cursor
    if not established_cursor:
        cursor = int(time.time()) - max(24, int(cfg.get("closed_history_hours", 48))) * 3600
    live_source = positions if live_positions is None else live_positions
    live_tickets = set()
    for pos in live_source:
        ticket = str(getattr(pos, "ticket", ""))
        identifier = str(getattr(pos, "identifier", "") or ticket)
        live_tickets.update((ticket, identifier))
    account = int(snap.get("login", 0) or 0)
    server = str(snap.get("server") or "")
    closed_rows, cursor_floor_sec, blocked_ids, deferred_ids = _closed_rows(
        deals, state, cursor, live_tickets, account=account, server=server,
        return_status=True)
    if established_cursor:
        for row in closed_rows:
            # Once the durable cursor exists, even an outage older than the
            # backend freshness window is a required lifecycle notification.
            row["notificationRequired"] = True
    payload = {
        "source": "account-brain",
        "account": account,
        "server": server,
        "open": _open_rows(positions, account=account, server=server),
        "closed": closed_rows,
        "snapshot": snap,
    }
    try:
        response = requests.post(
            _backend_base(cfg) + "/api/bridge/state",
            json=payload,
            headers={"Authorization": "Bearer " + token},
            # 1sn'lik risk/trail dongusu ayni thread'de: uzun POST beklemesi
            # trail/erken-cikis degerlendirmesini geciktirir, kisa tut. 12sn:
            # backend toplu Telegram teslimatinda ~10sn cevap verebiliyor
            # (2026-07-30 VPS'te 8sn sahte 'Read timed out' uretti).
            timeout=12,
            allow_redirects=False,
        )
        if response.status_code != 200:
            log.error("broker durum POST %s: %s", response.status_code, response.text[:160])
            return False
        # Keep the boundary inclusive on the next POST. Deals sharing the same
        # second are therefore never skipped; backend ticket idempotency removes
        # the harmless replay at that one-second boundary.
        observed = int(history_cutoff_sec or time.time())
        latest_close = max(
            (int(r.get("closedSec", 0) or 0) for r in closed_rows), default=0)
        target = max(stored_cursor, observed, latest_close)
        if cursor_floor_sec:
            # F3: eskiden TEK bir eksik lifecycle TUM cursor'u dondururdu.
            # Artik yalniz o kapanisin zamanina kadar geri cekilir; daha yeni
            # satirlar normal ilerler ve pencere sinirsiz buyumez.
            target = max(stored_cursor, min(target, int(cursor_floor_sec) - 1))
            log.warning(
                "Kapanis lifecycle eksik (%s); cursor %s saniyesinde tutuldu, "
                "yeni satirlar normal ilerliyor",
                ",".join(blocked_ids), target)
        state["notificationCursorSec"] = target
        # Kismi kapanisi olan (hala acik) pozisyonlar cursor'u DONDURMAZ; final
        # kapanislari geldiginde _position_history tum yasam dongusunu toplar.
        if deferred_ids:
            log.debug("kismi kapanis ertelendi: %s", ",".join(deferred_ids))
        for row in closed_rows:
            reasons = state.get("close_reasons", {})
            reasons.pop(row.get("positionTicket"), None)
            reasons.pop(row.get("positionIdentifier"), None)
        return True
    except Exception as exc:
        log.error("broker durum POST hatasi: %s", exc)
        return False


def _report_state_with_heartbeat(cfg, positions, deals, state, snap,
                                 live_positions=None,
                                 history_cutoff_sec=None):
    """Keep process-liveness heartbeat fresh while lifecycle I/O is pending.

    The lifecycle request remains on the control-loop thread (including its
    MT5 history reads) and is bounded by ``_report_state``'s network timeout.
    Only a snapshot writer runs in the worker, so a slow backend cannot make
    the otherwise healthy daemon heartbeat older than the bridge's 10-second
    liveness gate.
    """
    try:
        heartbeat_age = float(cfg.get("heartbeat_max_age_seconds", 10) or 10)
    except (TypeError, ValueError):
        heartbeat_age = 10.0
    refresh_interval = max(0.2, min(1.0, heartbeat_age / 3.0))
    stopped = threading.Event()

    def heartbeat_worker():
        while not stopped.wait(refresh_interval):
            live_snap = dict(snap)
            live_snap["timeSec"] = int(time.time())
            # ⚠️ 2026-08-04: heartbeat'in IKI anlami vardi ve bu thread onlari
            # birlestirip kapiyi YALANLANAMAZ kiliyordu. run_once TEK
            # thread'dir: trail, kar-kilidi, erken cikis, suru kesmesi ve hesap
            # frenleri lifecycle POST'undan ONCE ayni thread'de kosar. POST
            # bloke oldugu surece beyin HICBIR pozisyonu yonetemez — ama bu
            # thread "taze + ok" heartbeat yazdigi icin kopruler "beyin canli
            # ve saglikli" deyip YENI POZISYON aciyordu.
            # Artik bu kopya yalnizca "surec olmedi" der; giris yetkisi VERMEZ.
            live_snap["ok"] = False
            live_snap["telemetryOk"] = False
            live_snap["reason"] = "broker-lifecycle-post-in-flight"
            try:
                _atomic_json(HEARTBEAT_PATH, live_snap)
            except Exception as exc:
                # A missing/stale heartbeat is already fail-closed at every
                # bridge. Keep the bounded lifecycle attempt running so
                # account supervision can continue on the next turn.
                log.critical(
                    "lifecycle POST sirasinda heartbeat yenilenemedi: %s", exc)

    worker = threading.Thread(
        target=heartbeat_worker, name="bk-heartbeat-refresh", daemon=True)
    worker.start()
    try:
        return bool(_report_state(
            cfg, positions, deals, state, snap,
            live_positions=live_positions,
            history_cutoff_sec=history_cutoff_sec))
    except Exception as exc:  # Defensive: _report_state normally catches.
        log.error("broker durum beklenmeyen hata: %s", exc)
        return False
    finally:
        stopped.set()
        worker.join(timeout=max(0.5, refresh_interval * 2.0))


def _history(cfg, state):
    hours = max(24, int(cfg.get("closed_history_hours", 48)))
    now = datetime.now(timezone.utc)
    cursor = int(state.get("notificationCursorSec", 0) or 0)
    if cursor > 0:
        start = datetime.fromtimestamp(max(0, cursor - 5), timezone.utc)
    else:
        start = now - timedelta(hours=hours)
    return mt5.history_deals_get(start, now + timedelta(hours=6))


def _lifecycle_report_gate(cfg, state, last_report, now=None):
    """Return the live-entry lifecycle gate for this daemon boot.

    A timestamp persisted by an older process is useful for audit only; it
    cannot unlock a newly started process.  After one current-boot success,
    transient POST failures are tolerated only until the separate lifecycle
    freshness TTL expires.  Heartbeat process liveness remains a distinct,
    shorter check in the bridges.
    """
    now = float(time.time() if now is None else now)
    try:
        boot_success = float(last_report)
    except (TypeError, ValueError):
        boot_success = 0.0
    current_boot_reported = (
        not isinstance(last_report, bool)
        and math.isfinite(boot_success)
        and boot_success > 0
    )
    if not current_boot_reported:
        return False, "broker-lifecycle-report-pending"

    value = state.get("lastReportSuccessSec") if isinstance(state, dict) else None
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        value = 0.0
    try:
        ttl = float(cfg.get("lifecycle_report_max_age_seconds", 30))
    except (TypeError, ValueError):
        ttl = 30.0
    if not math.isfinite(ttl):
        ttl = 30.0
    ttl = max(15.0, min(300.0, ttl))
    # ⚠️ 2026-08-04: bu iki kontrolun SIRASI onemli. TTL once bakilirsa, son
    # POST BASARISIZ olsa bile lastReportSuccessSec 30 sn icinde oldugu icin
    # kapi acik kalirdi -> report_interval 2 sn ile ~15 ARDISIK basarisiz
    # POST boyunca kopruler yeni pozisyon acmaya devam ederdi (defter ve
    # Telegram kor). Basarisizlik ANINDA fail-closed olmali; TTL yalnizca
    # "POST vadesi henuz gelmedi ama sonuncusu BASARILIYDI" halini tolere eder.
    if state.get("lastReportOk") is False:
        return False, "broker-lifecycle-last-report-failed"
    age = now - float(value)
    if math.isfinite(age) and 0.0 <= age <= ttl:
        return True, None
    return False, "broker-lifecycle-report-stale"


def run_once(cfg, state, last_report=0.0, forced_stop_reason=None,
             block_entries_reason=None, persist_state=True):
    ai = mt5.account_info()
    if not _account_allowed(cfg, ai):
        raise RuntimeError("hesap bilgisi yok veya allowed_account eslesmiyor")
    raw = mt5.positions_get()
    if raw is None:
        raise RuntimeError("positions_get None: %s" % (mt5.last_error(),))
    risk_positions = list(raw)
    positions = _managed_positions(cfg, risk_positions)
    telemetry_ok = True
    entry_blocks = []
    now_sec = time.time()
    report_every = max(1.0, float(cfg.get("report_interval_seconds", 2)))
    report_due = now_sec - last_report >= report_every
    lifecycle_fresh, lifecycle_block = _lifecycle_report_gate(
        cfg, state, last_report, now=now_sec)
    if block_entries_reason:
        entry_blocks.append(str(block_entries_reason))
    if not lifecycle_fresh:
        telemetry_ok = False
        entry_blocks.append(lifecycle_block)

    # A durable opening fact has strict priority over snapshots and closes.
    # Pending delivery blocks new entries; a corrupt/unreadable outbox is a
    # lifecycle-integrity emergency and therefore latches close-only mode.
    outbox_fatal = False
    pending_opens = mt5_brain_adapter.broker_event_outbox_count(cfg)
    if pending_opens:
        mt5_brain_adapter.flush_broker_event_outbox(cfg, logger=log)
        pending_opens = mt5_brain_adapter.broker_event_outbox_count(cfg)
    if pending_opens:
        telemetry_ok = False
        if pending_opens >= 10 ** 9:
            entry_blocks.append("broker-event-outbox-unreadable")
            outbox_fatal = not cfg.get("dry_run", True)
        else:
            entry_blocks.append("broker-event-outbox-pending-%s" % pending_opens)
    if not cfg.get("dry_run", True) and (
            not str(cfg.get("exec_token") or "").strip()
            or not _backend_base(cfg)):
        telemetry_ok = False
        entry_blocks.append("broker-lifecycle-backend-not-configured")

    history_cutoff_sec = int(time.time())
    try:
        history = _history(cfg, state)
        if history is None:
            raise RuntimeError("history_deals_get None: %s" % (mt5.last_error(),))
        deals = list(history)
    except Exception as exc:
        # History/reporting loss blocks every new entry through ok=false, but it
        # must never prevent equity/open-risk brakes from closing positions.
        telemetry_ok = False
        entry_blocks.append("deal-history-unavailable")
        deals = []
        log.error("deal history kullanilamiyor; girisler fail-closed, risk frenleri aktif: %s", exc)
    snap = _snapshot(cfg, ai, risk_positions, deals, state,
                     telemetry_ok=telemetry_ok, managed_count=len(positions))
    latch = state.get("emergencyFlatten")
    latched_reason = None
    if isinstance(latch, dict) and latch.get("active") is True:
        latched_reason = str(latch.get("reason") or "emergency-flatten-latched")
    elif latch is True:
        latched_reason = "emergency-flatten-latched"
    global_reason = (str(forced_stop_reason) if forced_stop_reason else None)
    global_reason = global_reason or latched_reason or _global_exit_reason(cfg, snap)
    if not global_reason and outbox_fatal:
        global_reason = "broker-event-outbox-unreadable"
    if global_reason:
        # Publish the brake in the same heartbeat used by every pre-send gate.
        # This is written before the first close request to minimize races.
        snap["ok"] = False
        snap["stopMaster"] = True
        snap["reason"] = global_reason
    elif entry_blocks:
        snap["ok"] = False
        snap["reason"] = ",".join(dict.fromkeys(entry_blocks))[:240]
    try:
        _atomic_json(HEARTBEAT_PATH, snap)
    except Exception as exc:
        # A stale/missing heartbeat blocks bridges; continue to account exits.
        log.critical("heartbeat yazilamadi; risk kapatmalari yine denenecek: %s", exc)

    if global_reason:
        # Dry-run'da ayni fren her saniye tekrarlanir; 42 pozisyonluk listeyi
        # her turda basmak log selidir. Ayni neden surerken 60 sn'de bir tek
        # ozet satiri yeter; canli modda kapatmalar gercek oldugundan kisilmaz.
        dry_summary_only = False
        if cfg.get("dry_run", True):
            marker = state.get("dryFlattenLog") or {}
            now_sec = time.time()
            same_reason = marker.get("reason") == global_reason
            recent = now_sec - float(marker.get("timeSec", 0) or 0) < 60
            if same_reason and recent:
                dry_summary_only = True
            else:
                state["dryFlattenLog"] = {"reason": global_reason,
                                          "timeSec": now_sec}
        if dry_summary_only:
            log.warning("[DRY] HESAP FRENI %s suruyor: %d pozisyon kapatilacakti (ozet)",
                        global_reason, len(risk_positions))
        else:
            log.critical("HESAP FRENI %s: hesaptaki tum pozisyonlar kapatiliyor", global_reason)
        prior = latch if isinstance(latch, dict) else {}
        if risk_positions:
            state["emergencyFlatten"] = {
                "active": True,
                "reason": global_reason,
                "createdSec": int(prior.get("createdSec") or time.time()),
                "lastAttemptSec": int(time.time()),
            }
        else:
            state["emergencyFlatten"] = {
                "active": False,
                "reason": global_reason,
                "createdSec": int(prior.get("createdSec") or time.time()),
                "flattenedSec": int(time.time()),
            }
        # Block every entry process first; otherwise a bridge could race a new
        # order while the flatten loop is still sending closes.
        if not cfg.get("dry_run", True):
            try:
                _write_stop(global_reason, snap)
            except Exception as exc:
                log.critical("STOP_MASTER yazilamadi; kapatma yine suruyor: %s", exc)
        if not dry_summary_only:
            for pos in list(risk_positions):
                try:
                    _close_position(cfg, pos, global_reason, state)
                except Exception as exc:
                    log.exception("global kapatma ticket=%s hata=%s",
                                  getattr(pos, "ticket", "?"), exc)
    else:
        tickets = state.setdefault("tickets", {})
        now = time.time()
        live = set()
        # Bu turda tekil cikisla KAPATILANLAR: suru aritmetigine girmemeli;
        # yoksa kapanmis bir kaydin hayaleti saglikli pozisyonlari infaz eder.
        closed_this_turn = set()
        for pos in positions:
            ticket = str(pos.ticket)
            position_key = str(getattr(pos, "identifier", "") or ticket)
            live.add(position_key)
            meta = tickets.setdefault(position_key, {
                "lastTicket": ticket,
                "openedSec": int(getattr(pos, "time", now) or now),
                "initialRiskUsd": _initial_risk_usd(pos),
                "initialSlPrice": float(getattr(pos, "sl", 0) or 0),
                "peakPnl": _net_position_pnl(pos),
                "peakSec": now,
                "lastPnl": _net_position_pnl(pos),
                "lastSec": now,
            })
            meta["lastTicket"] = ticket
            meta.pop("absentTurns", None)
            reason = _dynamic_exit_reason(cfg, pos, meta, now)
            if reason:
                if _close_position(cfg, pos, reason, state):
                    closed_this_turn.add(position_key)
                    # Kapan-ac dongusu kirici: beyin kapattigi enstrumanda
                    # AYNI YONDE yeni girisi bir sure engelle (ters yon
                    # serbest - gercek donusler kacirilmaz).
                    cooldown_min = float(cfg.get("reentry_cooldown_minutes", 45) or 0)
                    if cooldown_min > 0:
                        bucket = state.setdefault("reentryCooldowns", {})
                        asset = account_brain.canonical_underlying(
                            getattr(pos, "symbol", ""))
                        is_buy_pos = int(getattr(pos, "type", 0) or 0) == getattr(
                            mt5, "POSITION_TYPE_BUY", 0)
                        bucket[asset] = {
                            "untilSec": int(now + cooldown_min * 60),
                            "direction": "long" if is_buy_pos else "short",
                            "reason": str(reason)[:60],
                        }
            else:
                try:
                    _maybe_extend_runner(cfg, pos, meta)
                except Exception as exc:
                    log.error("runner TP hatasi ticket=%s: %s",
                              getattr(pos, "ticket", "?"), exc)
                try:
                    _maybe_trail_stop(cfg, pos, meta)
                except Exception as exc:
                    log.error("trail hatasi ticket=%s: %s",
                              getattr(pos, "ticket", "?"), exc)
        # Bound persistent ticket metadata; closed lifecycle itself is durable
        # on backend.  A transient empty positions_get() must not wipe the
        # peakR/initialSlPrice baselines (R math would silently inflate), so a
        # key is dropped only after three consecutive absent polls.
        # SURU / TERS-DONUS: tekil cikislar yetmeyince (haber sonrasi ani donus)
        # zarara giden YONU topluca kes, ayni yonu sogumaya al, ters yonu ac
        # birak — botlar yeni trendi gorunce ters islemleri kendileri acar.
        try:
            live_for_herd = [
                p for p in positions
                if str(getattr(p, "identifier", "") or getattr(p, "ticket", ""))
                not in closed_this_turn
            ]
            cuts, herd_reason = herd_reversal_cuts(
                cfg, live_for_herd, tickets, now)
            if cuts and herd_reason:
                log.critical("SURU TERS-DONUS: %s — %d zarardaki pozisyon kesiliyor",
                             herd_reason, len(cuts))
                cool_sec = float(cfg.get("herd_cooldown_seconds", 300.0) or 0)
                bucket = state.setdefault("reentryCooldowns", {})
                for pos, _meta, side in cuts:
                    try:
                        # Sogutma YALNIZ gercekten kapatabildiysek yazilir;
                        # aksi halde acik pozisyon dururken girisi kilitlerdik.
                        if not _close_position(cfg, pos, herd_reason[:60], state):
                            continue
                    except Exception as exc:
                        log.exception("suru kesme ticket=%s hata=%s",
                                      getattr(pos, "ticket", "?"), exc)
                        continue
                    if cool_sec <= 0:
                        continue
                    asset = account_brain.canonical_underlying(
                        getattr(pos, "symbol", ""))
                    until = now + cool_sec
                    prev_row = bucket.get(asset)
                    if isinstance(prev_row, dict) and str(
                            prev_row.get("direction") or "") == side:
                        # Mevcut daha UZUN sogutmayi kisaltma (tekil cikis 45dk
                        # yazmisken suru 5dk ile ezip erken yeniden acilmasina
                        # yol aciyordu).
                        try:
                            until = max(until, float(prev_row.get("untilSec", 0) or 0))
                        except (TypeError, ValueError):
                            pass
                    bucket[asset] = {
                        "untilSec": int(until),
                        "direction": side,
                        "reason": "herd-reversal",
                    }
        except Exception as exc:
            log.error("suru dedektoru hatasi: %s", exc)
        for position_key in list(tickets):
            if position_key in live:
                continue
            absent_meta = tickets[position_key]
            misses = (int(absent_meta.get("absentTurns", 0) or 0) + 1
                      if isinstance(absent_meta, dict) else 3)
            if misses >= 3:
                tickets.pop(position_key, None)
            else:
                absent_meta["absentTurns"] = misses

    if report_due:
        report_ok = _report_state_with_heartbeat(
            cfg, positions, deals, state, snap, live_positions=risk_positions,
            history_cutoff_sec=history_cutoff_sec)
        state["lastReportOk"] = bool(report_ok)
        state["lastReportAttemptSec"] = int(time.time())
        if report_ok:
            state["lastReportSuccessSec"] = int(time.time())
            last_report = time.time()
            # Publish the acknowledged lifecycle result immediately. Without
            # this second atomic write, poll>=report_interval would leave the
            # gate permanently provisional even though every POST succeeded.
            remaining_blocks = [
                item for item in entry_blocks
                if item != lifecycle_block
            ]
            snap["lastReportSuccessSec"] = state["lastReportSuccessSec"]
            snap["timeSec"] = int(time.time())
            if not global_reason:
                snap["ok"] = not remaining_blocks
                snap["telemetryOk"] = not remaining_blocks
                if remaining_blocks:
                    snap["reason"] = ",".join(
                        dict.fromkeys(remaining_blocks))[:240]
                else:
                    snap.pop("reason", None)
            try:
                _atomic_json(HEARTBEAT_PATH, snap)
            except Exception as exc:
                log.critical(
                    "basarili lifecycle sonrasi heartbeat yazilamadi; "
                    "girisler stale fail-closed kalacak: %s", exc)
    if persist_state:
        _save_state(state)
    return last_report, snap


def main():
    fh = logging.FileHandler(os.path.join(HERE, "account_brain.log"), encoding="utf-8")
    fh.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(message)s"))
    log.addHandler(fh)
    config_recovery_reason = None
    try:
        cfg = load_config()
    except Exception as exc:
        # A corrupt live config must not turn the supervisor into a crash loop.
        # Keep entries stopped, then use only durable state identity to decide
        # whether close-only recovery may safely touch the connected account.
        config_recovery_reason = "invalid-brain-config-startup"
        cfg = _startup_recovery_config()
        log.critical("CONFIG GUVENSIZ: close-only kurtarma deneniyor: %s", exc)
        try:
            _write_stop(config_recovery_reason, {"statePersisted": False})
        except Exception as stop_exc:
            log.critical("Config kurtarma STOP'u yazilamadi: %s", stop_exc)
    initial_stop_mode, initial_stop_reason = _stop_mode()
    if initial_stop_mode == "risk-incomplete":
        try:
            _write_stop(initial_stop_reason or "incomplete-risk-stop-master", {})
        except Exception as exc:
            log.critical("Eksik risk STOP kontrati tamamlanamadi: %s", exc)
        initial_stop_mode, initial_stop_reason = _stop_mode()
    if initial_stop_mode == "manual":
        log.critical("Manuel STOP_MASTER mevcut; merkez beyin baslatilmayacak")
        return 2
    if not _mt5_init(cfg):
        log.error("MT5 initialize basarisiz: %s", mt5.last_error())
        return 1
    state_load_error = None
    try:
        state = _load_state()
    except RuntimeError as exc:
        state = None
        state_load_error = "brain-state-corrupt"
        log.critical("Kalici risk state bozuk; baseline sifirlanmayacak: %s", exc)

    ai = mt5.account_info()
    if config_recovery_reason:
        if cfg.get("dry_run") is True:
            log.critical("Bozuk dry-run config duzeltilmeden merkez beyin baslatilmayacak")
            mt5.shutdown()
            return 2
        state_login = state.get("login") if isinstance(state, dict) else None
        state_server = state.get("server") if isinstance(state, dict) else None
        connected_login = getattr(ai, "login", None) if ai is not None else None
        connected_server = str(getattr(ai, "server", "") or "").strip().lower()
        if (type(state_login) is not int or state_login <= 0
                or type(connected_login) is not int
                or connected_login != state_login
                or not isinstance(state_server, str) or not state_server.strip()
                or not connected_server
                or state_server.strip().lower() != connected_server):
            log.critical(
                "CONFIG GUVENSIZ ve kalici state hesap kimligi dogrulanamadi; "
                "STOP korundu, yanlis hesabi kapatma riski alinmadi")
            mt5.shutdown()
            return 2
        cfg["allowed_account"] = state_login
        cfg["account_server"] = state_server
    if not _account_allowed(cfg, ai):
        log.critical("Hesap bilgisi yok veya allowed_account eslesmiyor")
        mt5.shutdown()
        return 2

    persist_state = True
    recovery_reason = None
    if cfg.get("dry_run", True):
        if state_load_error:
            log.warning("Dry-run bozuk state yerine gecici bootstrap kullanacak")
        state = state if isinstance(state, dict) else {}
    else:
        recovery_reason = (
            config_recovery_reason or state_load_error
            or _live_state_error(state, cfg, ai))
        if recovery_reason:
            # Never overwrite or silently repair a live baseline.  Use an
            # ephemeral state only to keep account supervision/flatten alive.
            log.critical(
                "CANLI STATE GUVENSIZ (%s): close-only kurtarma, state dosyasina yazilmayacak",
                recovery_reason)
            state = {}
            persist_state = False
            try:
                _write_stop(recovery_reason, {
                    "login": int(getattr(ai, "login", 0) or 0),
                    "equity": float(getattr(ai, "equity", 0) or 0),
                    "statePersisted": False,
                })
            except Exception as exc:
                log.critical("State kurtarma STOP'u yazilamadi; kapatma yine denenecek: %s", exc)

    if initial_stop_mode == "close-only":
        log.critical("Risk STOP_MASTER mevcut: yalniz kapatma/uzlastirma modu (%s)",
                     initial_stop_reason)
    last_report = 0.0
    log.info("Merkezi hesap beyni %s basladi; dry_run=%s poll=%ss",
             VERSION, cfg.get("dry_run"), cfg.get("poll_seconds"))
    try:
        while True:
            started = time.time()
            try:
                reload_reason = None
                try:
                    cfg = load_config()
                except Exception as config_exc:
                    # Retain the last validated config and its account lock.
                    # This lets live supervision flatten existing exposure
                    # while every entry process sees a persistent STOP.
                    reload_reason = "invalid-brain-config-runtime"
                    log.critical(
                        "CONFIG YENILEME BASARISIZ; son gecerli config ile "
                        "close-only denetim suruyor: %s", config_exc)
                    try:
                        _write_stop(reload_reason, {
                            "login": int(getattr(mt5.account_info(), "login", 0) or 0),
                            "statePersisted": bool(persist_state),
                        })
                    except Exception as stop_exc:
                        log.critical("Runtime config STOP'u yazilamadi: %s", stop_exc)
                stop_mode, stop_reason = _stop_mode()
                if stop_mode == "risk-incomplete":
                    try:
                        _write_stop(stop_reason or "incomplete-risk-stop-master", {})
                    except Exception as stop_exc:
                        log.critical("Eksik risk STOP tamamlanamadi: %s", stop_exc)
                    stop_mode, stop_reason = _stop_mode()
                if stop_mode == "manual":
                    log.critical("Manuel STOP_MASTER algilandi; merkez beyin cikiyor")
                    break
                live_monitor_only = (
                    not cfg.get("dry_run", True) and not cfg.get("enabled", True))
                if cfg.get("enabled", True) or live_monitor_only or reload_reason:
                    forced_reason = recovery_reason or reload_reason
                    if stop_mode == "close-only":
                        forced_reason = forced_reason or stop_reason or "risk-stop-master"
                    block_reason = (
                        "brain-disabled-live-monitor-only" if live_monitor_only else None)
                    last_report, snap = run_once(
                        cfg, state, last_report,
                        forced_stop_reason=forced_reason,
                        block_entries_reason=block_reason,
                        persist_state=persist_state)
                    daily_warning = _cfg_float(
                        cfg, ("daily_loss_warning_pct_account", "daily_flatten_warning_pct"), 4.0)
                    total_warning = _cfg_float(
                        cfg, ("total_drawdown_warning_pct_account", "total_flatten_warning_pct"), 9.0)
                    open_warning = min(1.5, max(0.01, _cfg_float(
                        cfg, ("max_open_risk_pct",), 1.5)))
                    if (snap["dailyLossPct"] >= daily_warning
                            or snap["totalDrawdownPct"] >= total_warning
                            or (cfg.get("race_mode") is not True
                                and snap["openRiskPct"] >= open_warning)):
                        log.warning(
                            "LIMIT YAKIN: acikRisk=%%%s gunluk=%%%s toplamDD=%%%s",
                            snap["openRiskPct"], snap["dailyLossPct"],
                            snap["totalDrawdownPct"])
                else:
                    _atomic_json(HEARTBEAT_PATH, {
                        "version": VERSION, "timeSec": int(time.time()), "ok": False,
                        "dryRun": True,
                        "reason": "brain disabled in dry-run",
                    })
            except KeyboardInterrupt:
                raise
            except Exception as exc:
                log.exception("beyin turu fail-closed: %s", exc)
                try:
                    _atomic_json(HEARTBEAT_PATH, {
                        "version": VERSION, "timeSec": int(time.time()), "ok": False,
                        "reason": str(exc)[:240],
                    })
                except Exception as heartbeat_exc:
                    log.critical("fail-closed heartbeat de yazilamadi: %s", heartbeat_exc)
            delay = max(0.2, float(cfg.get("poll_seconds", 1)) - (time.time() - started))
            time.sleep(delay)
    except KeyboardInterrupt:
        log.info("Merkezi beyin durduruldu")
    finally:
        mt5.shutdown()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
