import { useState } from 'react';
import { X, TrendingUp, BarChart3, ExternalLink } from 'lucide-react';
import StockChart from './StockChart';
import TradingViewWidget from './TradingViewWidget';

export default function StockDetailModal({ symbol, onClose }) {
  const [activeTab, setActiveTab] = useState('our-chart'); // our-chart, tradingview, indicators

  if (!symbol) return null;

  const tabs = [
    { id: 'our-chart', label: 'Grafik', icon: TrendingUp },
    { id: 'tradingview', label: 'TradingView', icon: BarChart3 },
    { id: 'indicators', label: 'İndikatörler', icon: BarChart3 }
  ];

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-dark-900 rounded-xl border border-dark-700 w-full max-w-6xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-dark-800">
          <div>
            <h2 className="text-2xl font-bold text-white">{symbol}</h2>
            <p className="text-sm text-gray-400 mt-1">Detaylı Grafik ve Analiz</p>
          </div>
          
          <button
            onClick={onClose}
            className="p-2 hover:bg-dark-800 rounded-lg transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex space-x-2 px-6 py-4 border-b border-dark-800 bg-dark-950">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center space-x-2 px-4 py-2 rounded-lg transition-colors ${
                activeTab === tab.id
                  ? 'bg-primary-600 text-white'
                  : 'bg-dark-800 text-gray-400 hover:bg-dark-700'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              <span className="font-medium">{tab.label}</span>
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-6">
          {activeTab === 'our-chart' && (
            <StockChart symbol={symbol} defaultInterval="1d" defaultRange="3mo" />
          )}

          {activeTab === 'tradingview' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-gray-400">
                  TradingView profesyonel grafik aracı ile detaylı analiz yapabilirsiniz.
                </p>
                <a
                  href={`https://tr.tradingview.com/chart/?symbol=BIST:${symbol}&interval=D`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center space-x-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 rounded-lg transition-colors"
                >
                  <ExternalLink className="w-4 h-4" />
                  <span className="text-sm font-medium">Yeni Sekmede Aç</span>
                </a>
              </div>
              <TradingViewWidget symbol={symbol} interval="D" height={500} />
            </div>
          )}

          {activeTab === 'indicators' && (
            <div className="space-y-6">
              <div className="card">
                <h3 className="text-lg font-semibold text-white mb-4">Teknik İndikatörler</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <IndicatorCard label="RSI (14)" value="67.59" status="nötr" />
                  <IndicatorCard label="MACD" value="0.69" status="pozitif" />
                  <IndicatorCard label="ADX" value="15.73" status="zayıf" />
                  <IndicatorCard label="EMA 5" value="13,904.35" status="üstünde" />
                  <IndicatorCard label="EMA 50" value="11,957.33" status="üstünde" />
                  <IndicatorCard label="EMA 200" value="10,858.05" status="üstünde" />
                </div>
              </div>

              <div className="card">
                <h3 className="text-lg font-semibold text-white mb-4">Hareketli Ortalamalar</h3>
                <div className="space-y-2">
                  {[
                    { period: 'EMA 5', value: 13904.35, color: 'success' },
                    { period: 'EMA 9', value: 13804.56, color: 'success' },
                    { period: 'EMA 21', value: 12595.89, color: 'warning' },
                    { period: 'EMA 50', value: 11957.33, color: 'primary' },
                    { period: 'EMA 200', value: 10858.05, color: 'purple' }
                  ].map((ema, i) => (
                    <div key={i} className="flex items-center justify-between p-3 bg-dark-800 rounded-lg">
                      <span className="text-sm text-gray-400">{ema.period}</span>
                      <span className={`text-lg font-bold text-${ema.color}-500`}>
                        {ema.value.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-dark-800 bg-dark-950">
          <div className="flex items-center justify-between">
            <p className="text-xs text-gray-500">
              Veriler 15 dakika gecikmeli olabilir. Yatırım tavsiyesi değildir.
            </p>
            <button
              onClick={onClose}
              className="px-6 py-2 bg-dark-800 hover:bg-dark-700 rounded-lg transition-colors"
            >
              Kapat
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function IndicatorCard({ label, value, status }) {
  const statusColors = {
    pozitif: 'text-success-500',
    negatif: 'text-danger-500',
    nötr: 'text-warning-500',
    zayıf: 'text-gray-500',
    üstünde: 'text-success-500',
    altında: 'text-danger-500'
  };

  return (
    <div className="bg-dark-800 rounded-lg p-4">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className="text-2xl font-bold text-white mb-1">{value}</p>
      <p className={`text-xs font-medium ${statusColors[status]}`}>
        {status?.toUpperCase()}
      </p>
    </div>
  );
}
