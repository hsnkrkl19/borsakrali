function toUnixTimeSeconds(quote) {
  const numericTimestamp = Number(quote?.timestamp);
  if (Number.isFinite(numericTimestamp)) {
    return Math.floor(numericTimestamp / 1000);
  }

  if (quote?.date) {
    const parsed = Date.parse(quote.date);
    if (Number.isFinite(parsed)) {
      return Math.floor(parsed / 1000);
    }
  }

  return null;
}

export function normalizeHistoricalQuotes(quotes = []) {
  const seen = new Set();

  return quotes
    .map((quote) => {
      const time = toUnixTimeSeconds(quote);
      const open = Number(quote?.open);
      const high = Number(quote?.high);
      const low = Number(quote?.low);
      const close = Number(quote?.close);
      const volume = Number(quote?.volume);

      if (
        !Number.isFinite(time) ||
        !Number.isFinite(open) ||
        !Number.isFinite(high) ||
        !Number.isFinite(low) ||
        !Number.isFinite(close)
      ) {
        return null;
      }

      return {
        time,
        open,
        high,
        low,
        close,
        volume: Number.isFinite(volume) ? volume : 0,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.time - b.time)
    .filter((quote) => {
      if (seen.has(quote.time)) return false;
      seen.add(quote.time);
      return true;
    });
}

export function getPivotLookback(interval, candleCount) {
  if (interval === '1wk') return candleCount >= 70 ? 3 : 2;
  if (interval === '1d') return candleCount >= 90 ? 3 : 2;
  if (interval === '60m') return candleCount >= 60 ? 2 : 1;
  return candleCount >= 50 ? 2 : 1;
}

export function findPivots(candles, lookback = 2) {
  const highs = [];
  const lows = [];

  if (!Array.isArray(candles) || candles.length < lookback * 2 + 1) {
    return { highs, lows };
  }

  for (let i = lookback; i < candles.length - lookback; i += 1) {
    const current = candles[i];
    let isHigh = true;
    let isLow = true;

    for (let step = 1; step <= lookback; step += 1) {
      if (candles[i - step].high >= current.high || candles[i + step].high >= current.high) {
        isHigh = false;
      }
      if (candles[i - step].low <= current.low || candles[i + step].low <= current.low) {
        isLow = false;
      }
    }

    if (isHigh) highs.push({ idx: i, time: current.time, value: current.high });
    if (isLow) lows.push({ idx: i, time: current.time, value: current.low });
  }

  return { highs, lows };
}

function calcTolerance(candles) {
  const sampleSize = Math.min(candles.length, 60);
  if (sampleSize === 0) return 0.001;

  let rangeRatioSum = 0;
  for (let i = candles.length - sampleSize; i < candles.length; i += 1) {
    const candle = candles[i];
    rangeRatioSum += (candle.high - candle.low) / Math.max(Math.abs(candle.close), 1);
  }

  const avgRangeRatio = rangeRatioSum / sampleSize;
  return Math.min(Math.max(avgRangeRatio * 0.35, 0.0006), 0.0075);
}

function getLineValue(line, idx) {
  return line.intercept + line.slope * idx;
}

function getAbsoluteTolerance(value, ratio) {
  return Math.max(Math.abs(value) * ratio, 0.05);
}

function fitLine(points) {
  const count = points.length;
  const sumX = points.reduce((total, point) => total + point.idx, 0);
  const sumY = points.reduce((total, point) => total + point.value, 0);
  const sumXY = points.reduce((total, point) => total + point.idx * point.value, 0);
  const sumXX = points.reduce((total, point) => total + point.idx * point.idx, 0);
  const denominator = count * sumXX - sumX * sumX;

  if (denominator === 0) {
    return { slope: 0, intercept: sumY / Math.max(count, 1) };
  }

  const slope = (count * sumXY - sumX * sumY) / denominator;
  const intercept = (sumY - slope * sumX) / count;
  return { slope, intercept };
}

function getRelativeError(point, line) {
  const expected = getLineValue(line, point.idx);
  return Math.abs(point.value - expected) / Math.max(Math.abs(expected), 1);
}

function matchesDirection(previous, current, slopeDirection) {
  if (!previous) return true;

  const tolerance = Math.max(Math.abs(previous.value) * 0.0005, 0.05);
  if (slopeDirection === 'positive') {
    return current.value + tolerance >= previous.value;
  }
  return current.value - tolerance <= previous.value;
}

function getBreakIndex(candles, line, pivotType, startIdx, toleranceRatio) {
  for (let idx = startIdx; idx < candles.length; idx += 1) {
    const lineValue = getLineValue(line, idx);
    const tolerance = getAbsoluteTolerance(lineValue, toleranceRatio);
    const crossedLine = pivotType === 'high'
      ? candles[idx].high > lineValue + tolerance
      : candles[idx].low < lineValue - tolerance;

    if (crossedLine) {
      return idx - 1;
    }
  }

  return candles.length - 1;
}

function collectTouches(pivots, line, toleranceRatio, slopeDirection, startIdx, endIdx, pivotType) {
  const touches = [];
  let previousTouch = null;

  for (const pivot of pivots) {
    if (pivot.idx < startIdx || pivot.idx > endIdx) continue;
    if (!matchesDirection(previousTouch, pivot, slopeDirection)) continue;

    const expected = getLineValue(line, pivot.idx);
    const tolerance = getAbsoluteTolerance(expected, toleranceRatio);
    const diff = pivot.value - expected;

    if (pivotType === 'high' && diff > tolerance) return null;
    if (pivotType === 'low' && diff < -tolerance) return null;
    if (Math.abs(diff) > tolerance) continue;

    touches.push(pivot);
    previousTouch = pivot;
  }

  return touches;
}

function isBetterCandidate(candidate, best) {
  if (!best) return true;
  if (candidate.lastTouchIdx !== best.lastTouchIdx) return candidate.lastTouchIdx > best.lastTouchIdx;
  if (candidate.touchCount !== best.touchCount) return candidate.touchCount > best.touchCount;
  if (candidate.span !== best.span) return candidate.span > best.span;
  return candidate.avgError < best.avgError;
}

export function findTrendLine(pivots, candles, { minTouches = 3, slopeDirection, pivotType }) {
  if (!Array.isArray(pivots) || pivots.length < minTouches || !Array.isArray(candles) || candles.length === 0) {
    return null;
  }

  const touchTolerance = calcTolerance(candles);
  const breakTolerance = touchTolerance * 1.6;
  let best = null;

  for (let start = 0; start < pivots.length - (minTouches - 1); start += 1) {
    for (let end = start + (minTouches - 1); end < pivots.length; end += 1) {
      const first = pivots[start];
      const last = pivots[end];
      const anchorSlope = (last.value - first.value) / Math.max(last.idx - first.idx, 1);

      if (slopeDirection === 'positive' && anchorSlope <= 0) continue;
      if (slopeDirection === 'negative' && anchorSlope >= 0) continue;

      const anchorLine = {
        slope: anchorSlope,
        intercept: first.value - anchorSlope * first.idx,
      };

      const breakIdx = getBreakIndex(candles, anchorLine, pivotType, first.idx, breakTolerance);
      if (breakIdx < last.idx) continue;

      const touches = collectTouches(
        pivots,
        anchorLine,
        touchTolerance,
        slopeDirection,
        first.idx,
        breakIdx,
        pivotType,
      );
      if (!touches || touches.length < minTouches || !touches.some((touch) => touch.idx === last.idx)) continue;

      const avgError = touches.reduce((total, point) => total + getRelativeError(point, anchorLine), 0) / touches.length;
      const firstTouch = touches[0];
      const lastTouch = touches[touches.length - 1];
      const endIdx = Math.max(lastTouch.idx, breakIdx);

      const candidate = {
        touchCount: touches.length,
        avgError,
        span: lastTouch.idx - firstTouch.idx,
        lastTouchIdx: lastTouch.idx,
        slope: anchorLine.slope,
        intercept: anchorLine.intercept,
        firstIdx: firstTouch.idx,
        firstTime: firstTouch.time,
        firstValue: getLineValue(anchorLine, firstTouch.idx),
        endTime: candles[endIdx].time,
        endValue: getLineValue(anchorLine, endIdx),
        touches,
      };

      if (isBetterCandidate(candidate, best)) {
        best = candidate;
      }
    }
  }

  return best;
}

function getRecentDirection(candles) {
  if (!Array.isArray(candles) || candles.length < 6) {
    return 'neutral';
  }

  const sampleSize = Math.min(18, candles.length);
  const recentCandles = candles.slice(-sampleSize);
  const firstClose = recentCandles[0]?.close;
  const lastClose = recentCandles[recentCandles.length - 1]?.close;

  if (!Number.isFinite(firstClose) || !Number.isFinite(lastClose) || firstClose === 0) {
    return 'neutral';
  }

  const changeRatio = (lastClose - firstClose) / Math.abs(firstClose);
  if (changeRatio >= 0.0125) return 'positive';
  if (changeRatio <= -0.0125) return 'negative';

  const regression = fitLine(recentCandles.map((candle, idx) => ({ idx, value: candle.close })));
  const slopeRatio = regression.slope / Math.max(Math.abs(lastClose), 1);

  if (slopeRatio >= 0.0012) return 'positive';
  if (slopeRatio <= -0.0012) return 'negative';
  return 'neutral';
}

function pickBetterLine(candidate, current) {
  if (!candidate) return current;
  if (!current) return candidate;
  return isBetterCandidate(candidate, current) ? candidate : current;
}

export function resolveTrendLines(candles, interval, minTouches = 3) {
  const pivotLookback = getPivotLookback(interval, candles.length);
  const { highs, lows } = findPivots(candles, pivotLookback);

  const upResistance = findTrendLine(highs, candles, {
    minTouches,
    slopeDirection: 'positive',
    pivotType: 'high',
  });
  const upSupport = findTrendLine(lows, candles, {
    minTouches,
    slopeDirection: 'positive',
    pivotType: 'low',
  });
  const downResistance = findTrendLine(highs, candles, {
    minTouches,
    slopeDirection: 'negative',
    pivotType: 'high',
  });
  const downSupport = findTrendLine(lows, candles, {
    minTouches,
    slopeDirection: 'negative',
    pivotType: 'low',
  });

  const recentDirection = getRecentDirection(candles);
  const primaryPositive = upResistance;
  const primaryNegative = downSupport;
  const bestPositive = pickBetterLine(primaryPositive, upSupport);
  const bestNegative = pickBetterLine(primaryNegative, downResistance);

  let direction = 'neutral';
  if (primaryPositive && primaryNegative) {
    direction = isBetterCandidate(primaryPositive, primaryNegative) ? 'positive' : 'negative';
  } else if (primaryPositive) {
    direction = 'positive';
  } else if (primaryNegative) {
    direction = 'negative';
  } else if (recentDirection === 'positive' && bestPositive) {
    direction = 'positive';
  } else if (recentDirection === 'negative' && bestNegative) {
    direction = 'negative';
  } else if (bestPositive && bestNegative) {
    direction = isBetterCandidate(bestPositive, bestNegative) ? 'positive' : 'negative';
  } else if (bestPositive) {
    direction = 'positive';
  } else if (bestNegative) {
    direction = 'negative';
  }

  if (direction === 'positive') {
    return {
      direction,
      resistanceLine: upResistance,
      supportLine: upResistance ? null : upSupport,
      pivotLookback,
      highs,
      lows,
    };
  }

  if (direction === 'negative') {
    return {
      direction,
      resistanceLine: downSupport ? null : downResistance,
      supportLine: downSupport,
      pivotLookback,
      highs,
      lows,
    };
  }

  return {
    direction: 'neutral',
    resistanceLine: null,
    supportLine: null,
    pivotLookback,
    highs,
    lows,
  };
}
