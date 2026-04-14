import { useState, useEffect } from 'react';
import { ExternalLink, TrendingUp, Clock } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';
import axios from 'axios';

export default function StockChart({ symbol, defaultInterval = '1d', defaultRange = '1mo' }) {
  const [chartData, setChartData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [interval, setInterval] = useState(defaultInterval);
  const [range, setRange] = useState(defaultRange);
  const [viewType, setViewType] = useState('line'); // line, candle, volume

  const intervals = [
    // Gün içi
    { value: '1m', label: '1dk', group: 'intraday' },
    { value: '5m', label: '5dk', group: 'intraday' },
    { value: '15m', label: '15dk', group: 'intraday' },
    { value: '30m', label: '30dk', group: 'intraday' },
    { value: '60m', label: '1s', group: 'intraday' },
    
    // Günlük ve üzeri
    { value: '1d', label: '1G', group: 'daily' },
    { value: '1wk', label: '1H', group: 'weekly' },
    { value: '1mo', label: '1A', group: 'monthly' }
  ];

  const ranges = [
    { value: '1d', label: '1G' },
    { value: '5d', label: '5G' },
    { value: '1mo', label: '1A' },
    { value: '3mo', label: '3A' },
    { value: '6mo', label: '6A' },
    { value: '1y', label: '1Y' },
    { value: '5y', label: '5Y' },
    { value: 'max', label: 'Tümü' }
  ];

  useEffect(() => {
    loadChartData();
  }, [symbol, interval, range]);

  const loadChartData = async () => {
    try {
      setLoading(true);
      
      const response = await axios.get(`/api/chart/data/${symbol}`, {
        params: { interval, range }
      });
      
      setChartData(response.data.data || []);
      
    } catch (error) {
      console.error('Chart data load error:', error);
    } finally {
      setLoading(false);
    }
  };

  const openTradingView = (tvInterval) => {
    // TradingView interval mapping
    const intervalMap = {
      '1m': '1',
      '5m': '5',
      '15m': '15',
      '30m': '30',
      '60m': '60',
      '1d': 'D',
      '1wk': 'W',
      '1mo': 'M'
    };
    
    const tvInt = intervalMap[interval] || 'D';
    const url = `https://tr.tradingview.com/chart/?symbol=BIST:${symbol}&interval=${tvInt}`;
    window.open(url, '_blank');
  };

  const formatDate = (date) => {
    const d = new Date(date);
    if (interval.includes('m') || interval.includes('h')) {
      return d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
    }
    return d.toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' });
  };

  if (loading) {
    return (
      <div className="card h-96 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-primary-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-400">Grafik yükleniyor...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-lg font-semibold text-white flex items-center space-x-2">
            <TrendingUp className="w-5 h-5 text-primary-500" />
            <span>{symbol} - Fiyat Grafiği</span>
          </h3>
          <p className="text-xs text-gray-500 mt-1">
            {chartData.length} veri noktası
          </p>
        </div>

        {/* TradingView Button */}
        <button
          onClick={openTradingView}
          className="flex items-center space-x-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 rounded-lg transition-colors"
        >
          <ExternalLink className="w-4 h-4" />
          <span className="text-sm font-medium">TradingView'da Aç</span>
        </button>
      </div>

      {/* Controls */}
      <div className="mb-6 space-y-4">
        {/* Time Intervals */}
        <div>
          <label className="text-xs text-gray-400 mb-2 block flex items-center space-x-2">
            <Clock className="w-3 h-3" />
            <span>ZAMAN ARALIĞI</span>
          </label>
          <div className="flex flex-wrap gap-2">
            {intervals.map((int) => (
              <button
                key={int.value}
                onClick={() => setInterval(int.value)}
                className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${
                  interval === int.value
                    ? 'bg-primary-600 text-white'
                    : 'bg-dark-800 text-gray-400 hover:bg-dark-700'
                }`}
              >
                {int.label}
              </button>
            ))}
          </div>
        </div>

        {/* Date Ranges */}
        <div>
          <label className="text-xs text-gray-400 mb-2 block">SÜRE</label>
          <div className="flex flex-wrap gap-2">
            {ranges.map((r) => (
              <button
                key={r.value}
                onClick={() => setRange(r.value)}
                className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${
                  range === r.value
                    ? 'bg-success-600 text-white'
                    : 'bg-dark-800 text-gray-400 hover:bg-dark-700'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>

        {/* View Type */}
        <div>
          <label className="text-xs text-gray-400 mb-2 block">GÖRÜNÜM</label>
          <div className="flex gap-2">
            {['line', 'volume'].map((type) => (
              <button
                key={type}
                onClick={() => setViewType(type)}
                className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${
                  viewType === type
                    ? 'bg-warning-600 text-white'
                    : 'bg-dark-800 text-gray-400 hover:bg-dark-700'
                }`}
              >
                {type === 'line' ? 'Çizgi' : 'Hacim'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Chart */}
      <div className="h-96">
        {chartData.length === 0 ? (
          <div className="h-full flex items-center justify-center text-gray-500">
            Veri bulunamadı
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            {viewType === 'line' ? (
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis
                  dataKey="date"
                  tickFormatter={formatDate}
                  stroke="#64748b"
                  fontSize={11}
                />
                <YAxis
                  stroke="#64748b"
                  fontSize={11}
                  domain={['auto', 'auto']}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#1e293b',
                    border: '1px solid #334155',
                    borderRadius: '8px',
                    color: '#fff'
                  }}
                  labelFormatter={formatDate}
                  formatter={(value) => [`${parseFloat(value).toFixed(2)} ₺`, 'Fiyat']}
                />
                <Line
                  type="monotone"
                  dataKey="close"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            ) : (
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis
                  dataKey="date"
                  tickFormatter={formatDate}
                  stroke="#64748b"
                  fontSize={11}
                />
                <YAxis
                  stroke="#64748b"
                  fontSize={11}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#1e293b',
                    border: '1px solid #334155',
                    borderRadius: '8px',
                    color: '#fff'
                  }}
                  labelFormatter={formatDate}
                  formatter={(value) => [value.toLocaleString('tr-TR'), 'Hacim']}
                />
                <Bar dataKey="volume" fill="#3b82f6" />
              </BarChart>
            )}
          </ResponsiveContainer>
        )}
      </div>

      {/* Info */}
      <div className="mt-4 pt-4 border-t border-dark-800">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
          <div>
            <p className="text-gray-500">Açılış</p>
            <p className="text-white font-semibold">
              {chartData[0]?.open?.toFixed(2) || '-'} ₺
            </p>
          </div>
          <div>
            <p className="text-gray-500">En Yüksek</p>
            <p className="text-success-500 font-semibold">
              {Math.max(...(chartData.map(d => d.high) || [0])).toFixed(2)} ₺
            </p>
          </div>
          <div>
            <p className="text-gray-500">En Düşük</p>
            <p className="text-danger-500 font-semibold">
              {Math.min(...(chartData.map(d => d.low) || [Infinity])).toFixed(2)} ₺
            </p>
          </div>
          <div>
            <p className="text-gray-500">Kapanış</p>
            <p className="text-white font-semibold">
              {chartData[chartData.length - 1]?.close?.toFixed(2) || '-'} ₺
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
