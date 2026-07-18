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

`analyzeRawCandles` is the Yahoo-style convenience adapter. It assumes each of
the four inputs contains a forming tail candle and removes every tail before
analysis. The 4h trend and latest 1h SMC structure must agree with the 15m FVG
direction; all inputs are time-clipped to the closed 5m confirmation.

Signal contract:

- `signalId` / `setupKey`: stable per FVG origin;
- `entry` / `fillPrice`: confirmed 5-minute candle close;
- `stop`: beyond the far edge of the gap plus an ATR buffer;
- `target1`: exactly 2R (or a configured minimum no lower than 2R);
- `target2`: 3R by default;
- `fillTimeSec`, `fillClosedAtSec`, `fillBar`: deterministic closed-bar time;
- `execution: paper_only`: the module has no broker/order dependency.
