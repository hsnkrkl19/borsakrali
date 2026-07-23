# ICT + FVG paper signal engine

This service is an execution-free strategy core. It reuses the project's pure
SMC primitives for 15-minute fair-value gaps, swing structure and liquidity,
then waits for the latest **closed** 5-minute candle to trade into and reclaim
the zone. A pending gap is never presented as a filled trade.

Primary API:

```js
const ictFvg = require('./ictFvg');

const snapshot = ictFvg.analyzeClosedCandles(
  {
    biasCandles: closed4h,
    structureCandles: closed1h,
    zoneCandles: closed15m,
    triggerCandles: closed5m,
  },
  { symbol: 'XAUUSD' },
);
```

`analyzeRawCandles` is the Yahoo-style convenience adapter. It filters each of
the four inputs down to bars the feed itself has already moved past, then calls
the pure core. The 4h trend and latest 1h SMC structure must agree with the 15m
FVG direction; all inputs are time-clipped to the closed 5m confirmation.

## Closed bars are decided by TIME, not by position

`prepareRawCandles(rows, tf)` requires the timeframe the series was fetched with
and keeps a bar only when

```
bar.time + tf <= time of the newest row in the series
```

Dropping one tail candle (`slice(0, -1)`) is **not** enough: the Yahoo chart
response appends a live-quote row *after* the still-forming bar, so the slice
removes only the quote and leaves a repainting bar as the apparent "last closed
bar". Measured live on 2026-07-23, that bar changed its own close within 100s on
GC=F 5m/15m/1h, NQ=F 15m and BTC-USD 15m — here it would seed a phantom FVG or
fake the 5m fill confirmation. A fixed `slice(0, -2)` is wrong in the other
direction (with the session closed there is no forming bar, so a real one would
be discarded), and an alignment test (`time % tf === 0`) is wrong too: Yahoo
daily bars are not epoch aligned. This mirrors `forexKlines.closedBars`, which
carries the full rationale; the engine reimplements it rather than importing it
so the module stays I/O-free.

The timeframe is a required argument — an unresolvable one throws instead of
silently falling back to a positional slice. `analyzeRawCandles` supplies it
from the same `biasTf` / `structureTf` / `zoneTf` / `fillTf` config fields the
analysis uses, and `ictFvgService.TIMEFRAMES` is the single source of truth for
both the fetch and the analyze call. Two guarantees hold:

- the result is always a subset of `slice(0, -1)`, so no caller starts seeing a
  bar it did not see before the change;
- `prepareClosedCandles` is unchanged — it still accepts an explicitly closed
  array and only drops rows flagged `closed: false`.

Signal contract:

- `signalId` / `setupKey`: stable per FVG origin;
- `entry` / `fillPrice`: confirmed 5-minute candle close;
- `stop`: beyond the far edge of the gap plus an ATR buffer;
- `target1`: exactly 2R (or a configured minimum no lower than 2R);
- `target2`: 3R by default;
- `fillTimeSec`, `fillClosedAtSec`, `fillBar`: deterministic closed-bar time;
- `execution: paper_only`: the module has no broker/order dependency.
