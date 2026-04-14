/**
 * TradingView Chart Service
 * Handles redirects to TradingView charts for BIST stocks
 */

class TradingViewService {
  constructor() {
    this.baseUrl = 'https://tr.tradingview.com';
    this.exchange = 'BIST'; // Borsa Istanbul
  }

  /**
   * Generate TradingView chart URL for any BIST stock
   * @param {string} symbol - Stock symbol (e.g., 'THYAO')
   * @param {string} interval - Time interval (1, 3, 5, 15, 30, 60, 240, D, W, M)
   * @returns {string} TradingView URL
   */
  getChartUrl(symbol, interval = 'D') {
    // TradingView format: https://tr.tradingview.com/chart/?symbol=BIST:THYAO&interval=D
    return `${this.baseUrl}/chart/?symbol=${this.exchange}:${symbol}&interval=${interval}`;
  }

  /**
   * Get widget embed URL
   * @param {string} symbol - Stock symbol
   * @param {string} interval - Time interval
   * @param {Object} options - Additional widget options
   */
  getWidgetUrl(symbol, interval = 'D', options = {}) {
    const defaultOptions = {
      symbol: `${this.exchange}:${symbol}`,
      interval,
      timezone: 'Europe/Istanbul',
      theme: 'dark',
      style: '1', // Candlestick
      locale: 'tr',
      toolbar_bg: '#0a0e27',
      enable_publishing: false,
      allow_symbol_change: true,
      save_image: false,
      container_id: 'tradingview_chart',
      ...options
    };

    const params = new URLSearchParams(defaultOptions).toString();
    return `${this.baseUrl}/widgetembed/?${params}`;
  }

  /**
   * Get all available time intervals
   */
  getTimeIntervals() {
    return [
      { value: '1', label: '1 Dakika', type: 'intraday' },
      { value: '3', label: '3 Dakika', type: 'intraday' },
      { value: '5', label: '5 Dakika', type: 'intraday' },
      { value: '15', label: '15 Dakika', type: 'intraday' },
      { value: '30', label: '30 Dakika', type: 'intraday' },
      { value: '60', label: '1 Saat', type: 'intraday' },
      { value: '120', label: '2 Saat', type: 'intraday' },
      { value: '240', label: '4 Saat', type: 'intraday' },
      { value: 'D', label: 'Günlük', type: 'daily' },
      { value: 'W', label: 'Haftalık', type: 'weekly' },
      { value: 'M', label: 'Aylık', type: 'monthly' }
    ];
  }

  /**
   * Generate TradingView widget HTML embed code
   */
  getWidgetEmbedCode(symbol, interval = 'D', height = 600) {
    return `
<!-- TradingView Widget BEGIN -->
<div class="tradingview-widget-container" style="height:${height}px">
  <div id="tradingview_chart" style="height:calc(100% - 32px)"></div>
  <div class="tradingview-widget-copyright">
    <a href="${this.getChartUrl(symbol, interval)}" rel="noopener" target="_blank">
      <span class="blue-text">${symbol}</span>
    </a> grafiği TradingView tarafından
  </div>
  <script type="text/javascript" src="https://s3.tradingview.com/tv.js"></script>
  <script type="text/javascript">
  new TradingView.widget({
    "autosize": true,
    "symbol": "${this.exchange}:${symbol}",
    "interval": "${interval}",
    "timezone": "Europe/Istanbul",
    "theme": "dark",
    "style": "1",
    "locale": "tr",
    "toolbar_bg": "#0a0e27",
    "enable_publishing": false,
    "allow_symbol_change": true,
    "container_id": "tradingview_chart"
  });
  </script>
</div>
<!-- TradingView Widget END -->
    `.trim();
  }

  /**
   * Validate interval
   */
  isValidInterval(interval) {
    const validIntervals = ['1', '3', '5', '15', '30', '60', '120', '240', 'D', 'W', 'M'];
    return validIntervals.includes(interval);
  }

  /**
   * Get screener URL for sector/market
   */
  getScreenerUrl(filter = 'all') {
    const filters = {
      all: 'filter=turkey',
      gainers: 'filter=turkey,sh_price_change_pct_1d|gt|0',
      losers: 'filter=turkey,sh_price_change_pct_1d|lt|0',
      volume: 'filter=turkey&sort=volume|desc'
    };

    return `${this.baseUrl}/screener/?${filters[filter] || filters.all}`;
  }

  /**
   * Get mobile-friendly chart URL
   */
  getMobileChartUrl(symbol, interval = 'D') {
    return `${this.baseUrl}/chart/mobile/?symbol=${this.exchange}:${symbol}&interval=${interval}`;
  }
}

module.exports = new TradingViewService();
