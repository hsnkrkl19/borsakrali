"""Pydantic request/response contracts for the backtest sidecar.

The Node backend (Borsa Krali) generates the historical *signals* using the
real shared strategy code, then hands us OHLCV + the per-bar signal series.
We replay them through backtesting.py and return calibration-ready stats.
This keeps strategy logic in ONE place (Node) — we never re-implement it.

Two flavours of output per request:
  • perBand  — per-signal independent forward-eval (TP1-vs-SL within horizon)
               bucketed by confidence band. Maximises sample size and yields
               winRate + avgReturn + EXPECTANCY + PROFIT FACTOR. This is what
               drives confidence calibration (expectancy/PF, not winRate alone,
               so a profitable-but-sub-50%-winrate setup is NOT penalised).
  • tearsheet — a real backtesting.py portfolio run over all signals (single
               position, bracket SL/TP, commission) → ~30 ratios the Node
               metrics.js lacks (Sortino/Calmar/SQN/Kelly/Alpha/Beta/...).
"""

from typing import Dict, List, Optional
from pydantic import BaseModel, Field


# ─────────────────────────── requests ───────────────────────────

class Candle(BaseModel):
    time: int = Field(..., description="Unix seconds (bar open time)")
    open: float
    high: float
    low: float
    close: float
    volume: float = 0.0


class Signal(BaseModel):
    index: int = Field(..., description="Bar index in the ohlcv array where the signal fires")
    direction: str = Field(..., description="'long' or 'short'")
    entry: float
    stop: float
    target: float
    band: str = Field("all", description="Confidence band: high|mid|low")
    atr: Optional[float] = Field(None, description="ATR at signal bar (only needed by /optimize)")


class BacktestConfig(BaseModel):
    cash: float = 100_000.0
    commission: float = 0.0002          # 2 bps per side — realistic for the modeled assets
    tradeOnClose: bool = True
    exclusiveOrders: bool = True        # one position at a time (backtesting.py is single-position)
    horizon: Optional[int] = Field(None, description="Time-stop: close a trade after N bars if no SL/TP")
    equityCurvePoints: int = Field(80, description="Downsample target for the returned equity curve")


class BacktestRequest(BaseModel):
    symbol: str = "?"
    timeframe: str = "?"
    ohlcv: List[Candle]
    signals: List[Signal] = Field(default_factory=list)
    config: BacktestConfig = Field(default_factory=BacktestConfig)


class BatchRequest(BaseModel):
    items: List[BacktestRequest] = Field(default_factory=list)


class OptimizeRequest(BaseModel):
    """Sweep SL/TP ATR multipliers (vs. buildLevels current values) to find the
    pair maximizing an objective. Each signal must carry `atr` and `entry`.
    """
    symbol: str = "?"
    timeframe: str = "?"
    ohlcv: List[Candle]
    signals: List[Signal] = Field(default_factory=list)
    slGrid: List[float] = Field(default_factory=lambda: [1.0, 1.5, 2.0, 2.5, 3.0])
    tpGrid: List[float] = Field(default_factory=lambda: [1.5, 2.0, 2.5, 3.0, 4.0, 5.0])
    objective: str = Field("expectancy", description="expectancy|sqn|sharpe|winRate|returnPct|profitFactor")
    config: BacktestConfig = Field(default_factory=BacktestConfig)


# ─────────────────────────── responses ───────────────────────────

class PerBandStat(BaseModel):
    band: str
    sampleSize: int = 0                       # closed signals (win + loss)
    win: int = 0
    loss: int = 0
    open: int = 0
    grossWin: float = 0.0                      # Σ winning returns (%) — for cross-symbol merge
    grossLoss: float = 0.0                     # Σ |losing returns| (%) — for cross-symbol merge
    winRate: Optional[float] = None           # %
    avgReturn: Optional[float] = None         # % per signal incl. open (matches legacy field)
    expectancy: Optional[float] = None        # % per CLOSED signal (mean R-return)
    profitFactor: Optional[float] = None      # gross win / gross loss (closed)


class Tearsheet(BaseModel):
    """A subset of backtesting.py's stats Series (portfolio, single-position)."""
    trades: int = 0
    returnPct: Optional[float] = None
    buyHoldReturnPct: Optional[float] = None
    cagrPct: Optional[float] = None
    volatilityAnnPct: Optional[float] = None
    sharpe: Optional[float] = None
    sortino: Optional[float] = None
    calmar: Optional[float] = None
    maxDrawdownPct: Optional[float] = None
    avgDrawdownPct: Optional[float] = None
    winRate: Optional[float] = None
    profitFactor: Optional[float] = None
    expectancyPct: Optional[float] = None
    sqn: Optional[float] = None
    kelly: Optional[float] = None
    exposureTimePct: Optional[float] = None
    bestTradePct: Optional[float] = None
    worstTradePct: Optional[float] = None
    avgTradePct: Optional[float] = None


class BacktestResponse(BaseModel):
    ok: bool = True
    symbol: str = "?"
    timeframe: str = "?"
    engine: str = "backtesting.py"
    bars: int = 0
    signals: int = 0
    perBand: Dict[str, PerBandStat] = Field(default_factory=dict)
    tearsheet: Optional[Tearsheet] = None
    error: Optional[str] = None


class BatchResponse(BaseModel):
    ok: bool = True
    count: int = 0
    results: List[BacktestResponse] = Field(default_factory=list)


class OptimizeResult(BaseModel):
    sl: float
    tp: float
    objective: str
    value: Optional[float] = None
    winRate: Optional[float] = None
    expectancy: Optional[float] = None
    profitFactor: Optional[float] = None
    sampleSize: int = 0


class OptimizeResponse(BaseModel):
    ok: bool = True
    symbol: str = "?"
    timeframe: str = "?"
    objective: str = "expectancy"
    best: Optional[OptimizeResult] = None
    current: Optional[OptimizeResult] = None
    grid: List[OptimizeResult] = Field(default_factory=list)
    error: Optional[str] = None
