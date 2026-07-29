#!/usr/bin/env python3
"""Gold Trader execution P1 tests; MT5 terminal is not required."""

import os
import sys
import time
from types import SimpleNamespace

try:
    import MetaTrader5 as mt5
except ModuleNotFoundError:
    bridge_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
    if bridge_dir not in sys.path:
        sys.path.insert(0, bridge_dir)
    from mt5_test_stub import install
    mt5 = install()

from core import trader as trader_mod
from core.trader import Trader


class FakeLogger:
    def __init__(self):
        self.critical_calls = []

    def critical(self, *args, **kwargs):
        self.critical_calls.append(args)

    def info(self, *args, **kwargs):
        pass

    def error(self, *args, **kwargs):
        pass

    def warning(self, *args, **kwargs):
        pass


class FakeJournal:
    def record_event(self, *args, **kwargs):
        pass


def bare_trader():
    obj = Trader.__new__(Trader)
    obj.logger = FakeLogger()
    obj.journal = FakeJournal()
    return obj


def t_open_filling_chain_excludes_return():
    obj = bare_trader()
    obj._order_check = lambda req: SimpleNamespace(retcode=0, comment="ok")
    modes = []
    original = mt5.order_send
    try:
        def unsupported(req):
            modes.append(req["type_filling"])
            return SimpleNamespace(retcode=10030, comment="unsupported")

        mt5.order_send = unsupported
        obj._send_with_filling({}, allow_return=False)
    finally:
        mt5.order_send = original
    assert modes == [trader_mod._FILLING_CHAIN[0], trader_mod._FILLING_CHAIN[1]]
    assert trader_mod._FILLING_CHAIN[2] not in modes
    print("OK gold opening FOK/IOC ile sınırlı; RETURN yok")


def t_close_requires_ticket_absence():
    obj = bare_trader()
    obj.config = SimpleNamespace(get=lambda: {
        "execution": {"mode": "mt5"}, "trade": {"deviation": 30}
    })
    pos = {"ticket": 44, "symbol": "XAUUSD", "volume": 0.05, "direction": "buy"}
    obj.mt5c = SimpleNamespace(
        ensure_connected=lambda: True,
        positions=lambda magic=None: [pos],
        symbol_info=lambda symbol: {"digits": 2, "bid": 4000.0, "ask": 4000.2},
    )
    obj._send_with_filling = lambda req: SimpleNamespace(
        retcode=getattr(mt5, "TRADE_RETCODE_DONE_PARTIAL", 10010),
        volume=0.02, comment="partial",
    )
    original = mt5.positions_get
    try:
        mt5.positions_get = lambda: [SimpleNamespace(ticket=44)]
        result = obj._close_position(44)
        assert result["ok"] is False, "partial fill + canlı ticket tam kapanış değildir"
        mt5.positions_get = lambda: []
        result = obj._close_position(44)
        assert result["ok"] is True, "ticket yokluğu tam kapanışı doğrular"
    finally:
        mt5.positions_get = original
    print("OK gold close canlı ticket yokluğu ile doğrulanıyor")


def t_finalize_failure_is_critical():
    obj = bare_trader()
    cfg = {
        "execution": {"mode": "mt5"},
        "central_brain_enabled": True,
        "trade": {"deviation": 30},
        "safety": {"max_tick_age_seconds": 30, "max_spread_bps": 20},
    }
    obj.config = SimpleNamespace(get=lambda: cfg)
    obj.mt5c = SimpleNamespace(
        ensure_connected=lambda: True,
        symbol_info=lambda symbol: {
            "point": 0.01, "digits": 2, "bid": 4000.0, "ask": 4000.2,
            "time": time.time(), "trade_mode": getattr(mt5, "SYMBOL_TRADE_MODE_FULL", 4),
            "trade_stops_level": 0, "volume_min": 0.01,
            "volume_max": 100.0, "volume_step": 0.01,
        },
    )
    plan = SimpleNamespace(
        allowed=True, lot=0.05,
        decision=SimpleNamespace(requires_atomic_execution=False, reasons=[]),
    )
    originals = (
        trader_mod.mt5_brain_adapter.evaluate,
        trader_mod.mt5_brain_adapter.pre_send_check,
        trader_mod.mt5_brain_adapter.finalize,
    )
    try:
        trader_mod.mt5_brain_adapter.evaluate = lambda *a, **k: plan
        trader_mod.mt5_brain_adapter.pre_send_check = lambda *a, **k: True
        trader_mod.mt5_brain_adapter.finalize = lambda *a, **k: False
        obj._send_with_filling = lambda req, allow_return=False: SimpleNamespace(
            retcode=getattr(mt5, "TRADE_RETCODE_DONE", 10009),
            order=55, deal=56, price=4000.2, volume=0.03, comment="ok",
        )
        result = obj._open_trade("XAUUSD", "buy", None, 3980.0, 4040.0, "test")
    finally:
        (trader_mod.mt5_brain_adapter.evaluate,
         trader_mod.mt5_brain_adapter.pre_send_check,
         trader_mod.mt5_brain_adapter.finalize) = originals
    assert result["ok"] is True, "broker fill yeniden gönderilmemeli"
    assert "0.03 lot" in result["message"], "mesaj gerçek kısmi dolum hacmini kullanmalı"
    assert obj.logger.critical_calls and "FINALIZE" in obj.logger.critical_calls[-1][0]
    print("OK gold broker fill + finalize False kritik alarm; gerçek dolum hacmi raporu")


if __name__ == "__main__":
    t_open_filling_chain_excludes_return()
    t_close_requires_ticket_absence()
    t_finalize_failure_is_critical()
    print("\nGOLD EXECUTION P1 TESTLERI GECTI - OK")
