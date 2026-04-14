import { useEffect, useRef } from 'react';
import { getStoredTheme, getTradingViewTheme } from '../utils/theme';

/**
 * TradingViewWidget
 * Container tamamen sıfırlanır: eski iframe + script temizlenir,
 * __widget div yeniden yaratılır. Bu sayede TradingView her symbol
 * değişiminde temiz başlatılır.
 */
export default function TradingViewWidget({ symbol, interval = 'D', height = 600 }) {
  const containerRef = useRef(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Sıfırla ve __widget div'i yeniden yarat
    container.innerHTML = '<div class="tradingview-widget-container__widget" style="height:100%;width:100%"></div>';

    const script = document.createElement('script');
    script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js';
    script.async = true;
    script.textContent = JSON.stringify({
      autosize: true,
      symbol: `BIST:${symbol.replace('BIST:', '')}`,
      interval,
      timezone: 'Europe/Istanbul',
      theme: getTradingViewTheme(),
      style: '1',
      locale: 'tr',
      toolbar_bg: getStoredTheme() === 'dark' ? '#0a0e27' : '#f8fafc',
      enable_publishing: false,
      allow_symbol_change: true,
      hide_top_toolbar: false,
      hide_legend: false,
      save_image: true,
      studies: [
        'MASimple@tv-basicstudies',
        'RSI@tv-basicstudies',
        'MACD@tv-basicstudies'
      ],
      show_popup_button: true,
      popup_width: '1000',
      popup_height: '650'
    });

    container.appendChild(script);

    return () => {
      try { container.innerHTML = ''; } catch {}
    };
  }, [symbol, interval]);

  return (
    <div className="card overflow-hidden">
      {/* Hook innerHTML ile __widget div'i kendisi yaratır */}
      <div
        ref={containerRef}
        className="tradingview-widget-container"
        style={{ height: `${height - 40}px`, width: '100%' }}
      />
      <div className="p-2 text-center text-xs text-gray-500 border-t border-dark-800">
        <a
          href={`https://tr.tradingview.com/chart/?symbol=BIST:${symbol.replace('BIST:', '')}&interval=${interval}`}
          rel="noopener noreferrer"
          target="_blank"
          className="text-primary-500 hover:text-primary-400"
        >
          {symbol.replace('BIST:', '')} — TradingView'de Aç ↗
        </a>
      </div>
    </div>
  );
}
