# Borsa Krali — Backtest Sidecar (`backtesting.py`)

A small **FastAPI** service that wraps [`kernc/backtesting.py`](https://github.com/kernc/backtesting.py)
(`0.6.5`). The Node backend generates the trading **signals** (all strategy logic
stays in Node); this sidecar replays them over the OHLCV and returns:

- **`perBand`** — per-signal forward-eval (TP1-vs-SL within a horizon) bucketed by
  confidence band, with **winRate + avgReturn + EXPECTANCY + PROFIT FACTOR** and raw
  counts. This drives **confidence calibration** (expectancy/PF, not winRate alone, so
  a profitable-but-sub-50%-winrate setup is *not* penalized).
- **`tearsheet`** — a real `backtesting.py` portfolio run (single position, bracket
  SL/TP, commission) → Sharpe/Sortino/Calmar/SQN/Kelly/Volatility/Exposure/Drawdown
  durations, etc. — the ratios the Node `metrics.js` lacks.
- **`/optimize`** — SL/TP ATR-multiplier grid sweep (analysis only; not applied to live).

It is **stateless**. Node owns signal generation, persistence and the calibration blend.

## How it plugs into signals

```
cron (daily)  ──>  forexBacktest.runAll / bistBacktest.runAll
                       │  builds historical signals with the SAME Node strategies
                       ▼
                 sidecarClient ──HTTP──> THIS SERVICE (backtesting.py)
                       │  perBand stats written to data/*-backtest.json
                       ▼
live engine reads cached stats ──> forexAggregator.calibrateConfidence
                       │  raw confidence ± bounded delta (PF/expectancy aware)
                       ▼
             forex (forexEngineMTF) & BIST (bistScoreEngine) confidence
```

The **live signal path never calls this service** — only the daily cron does. If the
sidecar is down, `runAll` falls back to an identical JS computation, so signals never stop.

## Local dev

```bash
cd backtest-service
py -3.12 -m venv .venv                 # Python 3.12 (NOT 3.14 — numpy/pandas/bokeh wheels)
./.venv/Scripts/python.exe -m pip install -r requirements-dev.txt
./.venv/Scripts/python.exe -m pytest -q          # tests
PORT=8000 ./.venv/Scripts/python.exe -m uvicorn app.main:app --reload
```

Then point the Node backend at it:

```
# backend/.env
BACKTEST_SERVICE_URL=http://127.0.0.1:8000
```

## Endpoints

| Method | Path        | Body                                  | Returns                          |
|--------|-------------|---------------------------------------|----------------------------------|
| GET    | `/health`   | —                                     | `{ok, version, engine}`          |
| POST   | `/backtest` | `{symbol, timeframe, ohlcv, signals, config}` | `{perBand, tearsheet, ...}` |
| POST   | `/batch`    | `{items: [BacktestRequest...]}`       | `{results: [...]}`               |
| POST   | `/optimize` | `{ohlcv, signals, slGrid, tpGrid, objective}` | `{best, current, grid}`  |

`config`: `{cash, commission, tradeOnClose, exclusiveOrders, horizon}`.
`signal`: `{index, direction:'long'|'short', entry, stop, target, band, atr?}`.

## Deploy (Render)

The existing Node service is dashboard-managed (no root `render.yaml`). Add the sidecar
as a **new** Render service:

1. **New → Web Service** → same repo.
2. **Root Directory:** `backtest-service`
3. **Runtime:** Python (auto-detected via `.python-version` → 3.12.8). *Or* choose Docker
   (the `Dockerfile` here).
4. **Build command:** `pip install -r requirements.txt`
5. **Start command:** `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
6. **Health check path:** `/health`
7. Pick the **same region** as the Node service so they share the private network.

Then, on the **Node** service, set:

```
BACKTEST_SERVICE_URL = https://<your-backtest-service>.onrender.com
# (or the internal http://<name>:<port> if using the private network)
```

`backtest-service/render.yaml` is a reference Blueprint only.

## Node-side env vars (set on the Node/Render service)

| Var | Default | Meaning |
|-----|---------|---------|
| `BACKTEST_SERVICE_URL` | *(unset)* | Sidecar base URL. **Unset → calibration uses the JS fallback** (works, fewer metrics). |
| `BACKTEST_SERVICE_TOKEN` | *(unset)* | Optional shared token (`x-backtest-token` header). |
| `FOREX_CALIBRATION_ACTIVE` | `1` | `0` → forex uses raw confidence (kill-switch). |
| `BIST_CALIBRATION_ACTIVE` | `1` | `0` → BIST uses raw confidence (kill-switch). |
| `CALIBRATION_MAX_DROP` | `15` | Max points calibration can *subtract* from raw confidence. |
| `CALIBRATION_MAX_RISE` | `15` | Max points calibration can *add*. |
| `BIST_BACKTEST_LIMIT` | `60` | Universe sample size for the global BIST calibration job. |

**If forex/BIST flow ever drops:** set `CALIBRATION_MAX_DROP=0` (calibration becomes
boost-only, can never gate a signal out) or `*_CALIBRATION_ACTIVE=0` (full revert).
