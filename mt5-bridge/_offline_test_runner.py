import runpy
import sys
import types
import os


mt5 = types.ModuleType("MetaTrader5")
for name, value in {
    "POSITION_TYPE_BUY": 0, "POSITION_TYPE_SELL": 1,
    "TRADE_ACTION_DEAL": 1, "TRADE_ACTION_PENDING": 5,
    "TRADE_ACTION_SLTP": 6,
    "ORDER_TYPE_BUY": 0, "ORDER_TYPE_SELL": 1,
    "ORDER_TIME_GTC": 0, "ORDER_FILLING_IOC": 1,
    "ORDER_FILLING_FOK": 2, "ORDER_FILLING_RETURN": 3,
    "TRADE_RETCODE_DONE": 10009, "TRADE_RETCODE_DONE_PARTIAL": 10010,
    "DEAL_ENTRY_IN": 0, "DEAL_ENTRY_OUT": 1, "DEAL_ENTRY_INOUT": 2,
    "DEAL_ENTRY_OUT_BY": 3,
    "TIMEFRAME_M1": 1, "TIMEFRAME_M5": 5, "TIMEFRAME_M15": 15,
    "TIMEFRAME_M30": 30, "TIMEFRAME_H1": 60, "TIMEFRAME_H4": 240,
    "TIMEFRAME_D1": 1440, "TIMEFRAME_W1": 10080, "TIMEFRAME_MN1": 43200,
}.items():
    setattr(mt5, name, value)
mt5.last_error = lambda: (0, "offline")
mt5.account_info = lambda: None
mt5.positions_get = lambda: None
mt5.history_deals_get = lambda *args, **kwargs: []
mt5.symbol_info = lambda *args, **kwargs: None
mt5.symbol_info_tick = lambda *args, **kwargs: None
mt5.order_send = lambda *args, **kwargs: None
sys.modules["MetaTrader5"] = mt5

requests = types.ModuleType("requests")
class Response:
    status_code = 503
    text = "offline"
    def json(self):
        return {}
requests.get = lambda *args, **kwargs: Response()
requests.post = lambda *args, **kwargs: Response()
sys.modules["requests"] = requests

sys.path.insert(0, __file__.rsplit("\\", 1)[0])
target = sys.argv[1]
sys.path.insert(0, os.path.dirname(os.path.abspath(target)))
sys.argv = [target]
runpy.run_path(target, run_name="__main__")
