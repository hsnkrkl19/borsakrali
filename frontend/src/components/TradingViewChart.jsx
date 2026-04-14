import { useEffect, useRef, memo } from 'react'
import { getTradingViewTheme, getStoredTheme } from '../utils/theme'

/**
 * useTradingViewEmbed Hook
 *
 * Doğru yaklaşım: her symbol/config değişiminde container tamamen
 * sıfırlanır (__widget div dahil) böylece TradingView eski iframe'i
 * görmez ve temiz bir şekilde başlatabilir.
 */
export function useTradingViewEmbed(containerRef, scriptSrc, config, deps) {
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    // Container'ı tamamen sıfırla — eski iframe + script temizle
    // Sonra __widget div yeniden yarat (TradingView bunu şart koşar)
    container.innerHTML = '<div class="tradingview-widget-container__widget" style="height:100%;width:100%"></div>'

    const script = document.createElement('script')
    script.src = scriptSrc
    script.async = true
    script.textContent = JSON.stringify(config)
    container.appendChild(script)

    return () => {
      try { container.innerHTML = '' } catch {}
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
}

// ── TradingView Gelişmiş Grafik Widget ────────────────────────────────────────
function TradingViewChart({
  symbol = 'BIST:THYAO',
  interval = 'D',
  theme = getTradingViewTheme(),
  height = 500,
  width = '100%',
  showToolbar = true,
  showDetails = true,
  allowSymbolChange = true,
  indicators = [],
  className = ''
}) {
  const containerRef = useRef(null)

  const config = {
    autosize: true,
    symbol: symbol.includes(':') ? symbol : `BIST:${symbol}`,
    interval,
    timezone: 'Europe/Istanbul',
    theme,
    style: '1',
    locale: 'tr',
    toolbar_bg: getStoredTheme() === 'dark' ? '#1a1a2e' : '#f8fafc',
    enable_publishing: false,
    allow_symbol_change: allowSymbolChange,
    hide_top_toolbar: !showToolbar,
    hide_legend: false,
    save_image: true,
    studies: indicators.length > 0 ? indicators : [
      'MASimple@tv-basicstudies',
      'RSI@tv-basicstudies'
    ],
    show_popup_button: true,
    popup_width: '1000',
    popup_height: '650'
  }

  useTradingViewEmbed(
    containerRef,
    'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js',
    config,
    [symbol, interval, theme, JSON.stringify(indicators)]
  )

  return (
    <div style={{ height, width }}>
      {/* Hook innerHTML ile __widget div'i kendisi yaratır */}
      <div
        ref={containerRef}
        className={`tradingview-widget-container ${className}`}
        style={{ height: '100%', width: '100%' }}
      />
      {showDetails && (
        <div className="text-center mt-2">
          <a
            href={`https://tr.tradingview.com/symbols/${symbol.includes(':') ? symbol : `BIST:${symbol}`}/`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-gray-500 hover:text-gold-400"
          >
            TradingView'de Detaylı Analiz →
          </a>
        </div>
      )}
    </div>
  )
}

// ── Mini Chart ────────────────────────────────────────────────────────────────
export function TradingViewMiniChart({
  symbol = 'BIST:THYAO',
  height = 220,
  colorTheme = getTradingViewTheme()
}) {
  const containerRef = useRef(null)

  const config = {
    symbol: symbol.includes(':') ? symbol : `BIST:${symbol}`,
    width: '100%',
    height,
    locale: 'tr',
    dateRange: '12M',
    colorTheme,
    trendLineColor: 'rgba(212, 175, 55, 1)',
    underLineColor: 'rgba(212, 175, 55, 0.1)',
    underLineBottomColor: 'rgba(21, 21, 35, 0)',
    isTransparent: true,
    autosize: true,
    largeChartUrl: `https://tr.tradingview.com/symbols/${symbol.includes(':') ? symbol : `BIST:${symbol}`}/`
  }

  useTradingViewEmbed(
    containerRef,
    'https://s3.tradingview.com/external-embedding/embed-widget-mini-symbol-overview.js',
    config,
    [symbol, height, colorTheme]
  )

  return (
    <div style={{ height, width: '100%' }}>
      <div
        ref={containerRef}
        className="tradingview-widget-container"
        style={{ height: '100%', width: '100%' }}
      />
    </div>
  )
}

// ── Ticker Tape ───────────────────────────────────────────────────────────────
export function TradingViewTicker({
  symbols = [{ proName: 'BIST:XU100', title: 'BIST 100' }]
}) {
  const containerRef = useRef(null)

  const formattedSymbols = symbols.map(s => {
    if (typeof s === 'string') return { proName: s, title: s.split(':')[1] || s }
    return s
  })

  const config = {
    symbols: formattedSymbols,
    showSymbolLogo: true,
    colorTheme: getTradingViewTheme(),
    isTransparent: true,
    displayMode: 'adaptive',
    locale: 'tr'
  }

  useTradingViewEmbed(
    containerRef,
    'https://s3.tradingview.com/external-embedding/embed-widget-ticker-tape.js',
    config,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(symbols)]
  )

  return (
    <div
      ref={containerRef}
      className="tradingview-widget-container"
      style={{ minHeight: '46px' }}
    />
  )
}

// ── TradingView'de Aç Butonu ──────────────────────────────────────────────────
export function OpenInTradingView({ symbol, className = '' }) {
  const handleClick = () => {
    const tvSymbol = symbol.includes(':') ? symbol : `BIST:${symbol}`
    window.open(`https://tr.tradingview.com/symbols/${tvSymbol}/`, '_blank')
  }

  return (
    <button
      onClick={handleClick}
      className={`flex items-center gap-2 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 text-white px-4 py-2 rounded-xl font-medium transition-all ${className}`}
    >
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.568 8.16c-.18-.264-.504-.408-.864-.408H14.4V5.904c0-.36-.144-.648-.408-.864-.264-.18-.6-.288-.936-.216-.336.072-.612.288-.792.576L7.8 13.584c-.144.216-.216.468-.216.72 0 .36.144.648.408.864.18.144.396.216.612.216h2.304v1.848c0 .36.144.648.408.864.264.18.6.288.936.216.336-.072.612-.288.792-.576l4.464-8.184c.144-.216.216-.468.216-.72 0-.252-.072-.504-.216-.672h-.036z"/>
      </svg>
      Detaylı Grafik
    </button>
  )
}

export default memo(TradingViewChart)
