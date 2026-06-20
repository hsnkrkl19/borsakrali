"""FastAPI entrypoint for the Borsa Krali backtest sidecar.

Endpoints (all called by the Node backend over the private network):
  GET  /            → liveness
  GET  /health      → readiness + engine version
  POST /backtest    → single (OHLCV + signals) → perBand calibration + tearsheet
  POST /batch       → many BacktestRequest at once (used by the BIST universe job)
  POST /optimize    → SL/TP ATR-multiplier grid sweep (analysis only)

The service is STATELESS: Node owns all signal generation, persistence and the
calibration blend. We only crunch numbers and hand them back.
"""

import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

import backtesting

from . import __version__
from .models import (
    BacktestRequest,
    BacktestResponse,
    BatchRequest,
    BatchResponse,
    OptimizeRequest,
    OptimizeResponse,
)
from . import runner

app = FastAPI(title="Borsa Krali Backtest Sidecar", version=__version__)

# Internal-only service; CORS is permissive but the deploy keeps it on Render's
# private network. An optional shared token guards public exposure.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

ENGINE = f"backtesting.py {backtesting.__version__}"


@app.get("/")
def root():
    return {"service": "borsakrali-backtest", "version": __version__, "engine": ENGINE}


@app.get("/health")
def health():
    return {"ok": True, "version": __version__, "engine": ENGINE}


@app.post("/backtest", response_model=BacktestResponse)
def backtest(req: BacktestRequest) -> BacktestResponse:
    try:
        return runner.run_backtest(req)
    except Exception as e:  # never 500 the calibration job — return ok=False
        return BacktestResponse(ok=False, symbol=req.symbol, timeframe=req.timeframe, error=str(e))


@app.post("/batch", response_model=BatchResponse)
def batch(req: BatchRequest) -> BatchResponse:
    results = []
    for item in req.items:
        try:
            results.append(runner.run_backtest(item))
        except Exception as e:
            results.append(BacktestResponse(ok=False, symbol=item.symbol,
                                            timeframe=item.timeframe, error=str(e)))
    return BatchResponse(ok=True, count=len(results), results=results)


@app.post("/optimize", response_model=OptimizeResponse)
def optimize(req: OptimizeRequest) -> OptimizeResponse:
    try:
        return runner.optimize(req)
    except Exception as e:
        return OptimizeResponse(ok=False, symbol=req.symbol, timeframe=req.timeframe,
                                objective=req.objective, error=str(e))


if __name__ == "__main__":
    import uvicorn

    port = int(os.environ.get("PORT", "8000"))
    uvicorn.run("app.main:app", host="0.0.0.0", port=port)
