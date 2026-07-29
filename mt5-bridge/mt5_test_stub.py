"""Minimal in-process MetaTrader5 substitute for offline bridge tests only.

The production modules still import the real ``MetaTrader5`` package. Tests
install this module into ``sys.modules`` only when that package is unavailable.
"""

from types import ModuleType
import sys


def _install_non_mt5_dependencies():
    try:
        __import__("requests")
    except ModuleNotFoundError:
        requests = ModuleType("requests")
        requests.get = lambda *args, **kwargs: None
        requests.post = lambda *args, **kwargs: None
        sys.modules["requests"] = requests

    try:
        __import__("pandas")
    except ModuleNotFoundError:
        pandas = ModuleType("pandas")
        pandas.DataFrame = type("DataFrame", (), {})
        pandas.to_datetime = lambda value, **kwargs: value
        sys.modules["pandas"] = pandas


def install():
    _install_non_mt5_dependencies()
    existing = sys.modules.get("MetaTrader5")
    if existing is not None:
        return existing

    module = ModuleType("MetaTrader5")
    constants = {
        "TRADE_RETCODE_DONE": 10009,
        "TRADE_RETCODE_DONE_PARTIAL": 10010,
        "TRADE_RETCODE_MARKET_CLOSED": 10018,
        "TRADE_RETCODE_NO_MONEY": 10019,
        "ORDER_FILLING_FOK": 0,
        "ORDER_FILLING_IOC": 1,
        "ORDER_FILLING_RETURN": 2,
        "POSITION_TYPE_BUY": 0,
        "POSITION_TYPE_SELL": 1,
        "ORDER_TYPE_BUY": 0,
        "ORDER_TYPE_SELL": 1,
        "TRADE_ACTION_DEAL": 1,
        "TRADE_ACTION_SLTP": 6,
        "ORDER_TIME_GTC": 0,
        "SYMBOL_TRADE_MODE_DISABLED": 0,
        "SYMBOL_TRADE_MODE_LONGONLY": 1,
        "SYMBOL_TRADE_MODE_SHORTONLY": 2,
        "SYMBOL_TRADE_MODE_CLOSEONLY": 3,
        "SYMBOL_TRADE_MODE_FULL": 4,
    }
    for name, value in constants.items():
        setattr(module, name, value)

    generated = {}

    def dynamic(name):
        if name.isupper():
            generated.setdefault(name, 1000 + len(generated))
            return generated[name]
        return lambda *args, **kwargs: None

    module.__getattr__ = dynamic
    module.last_error = lambda: (0, "offline-test")
    sys.modules["MetaTrader5"] = module
    return module
