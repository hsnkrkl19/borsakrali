function buildCommodityHistoryUrl(commKey, period, interval) {
  const params = new URLSearchParams({
    period: period || '3mo',
    interval: interval || '1d',
  })

  return `/api/market/commodity/${commKey}/historical?${params.toString()}`
}

const GRAMS_PER_TROY_OUNCE = 31.1034768

async function fetchCommodityHistoryDirect(commKey, { period = '3mo', interval = '1d' } = {}) {
  const response = await fetch(buildCommodityHistoryUrl(commKey, period, interval))
  let payload = null

  try {
    payload = await response.json()
  } catch (_) {
    payload = null
  }

  if (response.ok && Array.isArray(payload?.data) && payload.data.length > 0) {
    return payload
  }

  const error = new Error(payload?.error || `${commKey} historical request failed`)
  error.status = response.status
  throw error
}

function toGramTl(value, digits = 2) {
  return Number.isFinite(value)
    ? +(value / GRAMS_PER_TROY_OUNCE).toFixed(digits)
    : null
}

function combineGoldTrySeries(goldUsdSeries, usdTrySeries) {
  const usdTryByTime = new Map(
    usdTrySeries.map((item) => [String(item.time), item]),
  )

  return goldUsdSeries
    .map((goldBar) => {
      const fxBar = usdTryByTime.get(String(goldBar.time))
      if (!fxBar) return null

      const values = [
        goldBar.open,
        goldBar.high,
        goldBar.low,
        goldBar.close,
        fxBar.open,
        fxBar.high,
        fxBar.low,
        fxBar.close,
      ]

      if (values.some((value) => !Number.isFinite(value))) {
        return null
      }

      const open = toGramTl(goldBar.open * fxBar.open, 4)
      const high = toGramTl(goldBar.high * fxBar.high, 4)
      const low = toGramTl(goldBar.low * fxBar.low, 4)
      const close = toGramTl(goldBar.close * fxBar.close, 4)

      if ([open, high, low, close].some((value) => value == null)) {
        return null
      }

      return {
        time: goldBar.time,
        open,
        high,
        low,
        close,
      }
    })
    .filter(Boolean)
}

async function fetchGoldTryFallbackSeries(options) {
  const [goldUsd, usdTry] = await Promise.all([
    fetchCommodityHistoryDirect('gold_usd', options),
    fetchCommodityHistoryDirect('usd_try', options),
  ])

  const combinedData = combineGoldTrySeries(goldUsd.data || [], usdTry.data || [])
  if (!combinedData.length) {
    throw new Error('gold_try fallback series could not be combined')
  }

  return {
    symbol: 'GOLD_TL',
    name: 'Gram Altin',
    unit: 'TL/gr',
    data: combinedData,
  }
}

export async function fetchCommodityHistory(commKey, options = {}) {
  if (commKey === 'gold_try') {
    return fetchGoldTryFallbackSeries(options)
  }

  return fetchCommodityHistoryDirect(commKey, options)
}
