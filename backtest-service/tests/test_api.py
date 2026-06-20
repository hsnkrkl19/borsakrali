"""Smoke tests for the FastAPI surface using the in-process TestClient."""

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def _candles(n=120, start=100.0, step=0.5):
    return [{"time": 1_700_000_000 + i * 86400, "open": start + step * i,
             "high": start + step * i + 1, "low": start + step * i - 1,
             "close": start + step * i, "volume": 1000} for i in range(n)]


def test_health():
    r = client.get("/health")
    assert r.status_code == 200
    body = r.json()
    assert body["ok"] is True
    assert "backtesting.py" in body["engine"]


def test_backtest_endpoint():
    candles = _candles()
    signals = [{"index": i, "direction": "long", "entry": candles[i]["close"],
                "stop": candles[i]["close"] - 4, "target": candles[i]["close"] + 6,
                "band": "high", "atr": 2.0} for i in range(30, 90, 10)]
    r = client.post("/backtest", json={"symbol": "TEST", "timeframe": "1d",
                                       "ohlcv": candles, "signals": signals,
                                       "config": {"horizon": 12}})
    assert r.status_code == 200
    body = r.json()
    assert body["ok"] is True
    assert body["perBand"]["all"]["sampleSize"] >= 1
    assert body["tearsheet"]["trades"] >= 1


def test_batch_endpoint():
    candles = _candles()
    item = {"symbol": "A", "timeframe": "1d", "ohlcv": candles, "signals": [],
            "config": {"horizon": 12}}
    r = client.post("/batch", json={"items": [item, item]})
    assert r.status_code == 200
    body = r.json()
    assert body["count"] == 2
