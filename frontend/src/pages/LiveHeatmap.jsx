import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ExternalLink } from 'lucide-react';
import axios from 'axios';

import { getApiBase } from '../config'
const API_BASE = getApiBase() + '/api';

export default function LiveHeatmap() {
  const navigate = useNavigate();
  const [stocks, setStocks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [selectedStock, setSelectedStock] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [technicalData, setTechnicalData] = useState(null);
  const [loadingTechnical, setLoadingTechnical] = useState(false);
  const [marketStatus, setMarketStatus] = useState('');
  const isMarketOpen = useCallback(() => {
    const now = new Date();
    const day = now.getDay();
    const hour = now.getHours();
    const min = now.getMinutes();
    return (day >= 1 && day <= 5) && (hour > 9 || (hour === 9 && min >= 55)) && hour < 18;
  }, []);

  useEffect(() => {
    const checkStatus = () => setMarketStatus(isMarketOpen() ? 'Canlı' : 'Piyasa Kapalı');
    checkStatus();
    const interval = setInterval(checkStatus, 60000);
    return () => clearInterval(interval);
  }, [isMarketOpen]);

  // Veri cekme — ilk yüklemede loading göster, sonrakilerde sessizce güncelle
  const fetchHeatmapData = useCallback(async (isInitial = false) => {
    try {
      if (isInitial) setLoading(true);
      const response = await axios.get(`${API_BASE}/market/live`);
      if (response.data.stocks) {
        setStocks(response.data.stocks);
        setLastUpdate(new Date());
      }
      if (isInitial) setLoading(false);
    } catch (error) {
      console.error('Canlı veri hatası:', error);
      if (isInitial) setLoading(false);
    }
  }, []);

  // Teknik analiz cek
  const fetchTechnicalAnalysis = async (symbol) => {
    setLoadingTechnical(true);
    try {
      const response = await axios.get(`${API_BASE}/analysis/technical/${symbol}`);
      setTechnicalData(response.data);
    } catch (error) {
      console.error('Teknik analiz hatasi:', error);
    }
    setLoadingTechnical(false);
  };

  // Piyasa açıksa 5sn, kapalıysa 5dk'da bir güncelle (gereksiz istek atma)
  useEffect(() => {
    fetchHeatmapData(true);
    const getInterval = () => isMarketOpen() ? 5000 : 5 * 60 * 1000;
    let timer = setInterval(() => fetchHeatmapData(false), getInterval());
    // Piyasa durumu değişince interval'ı yenile
    const statusTimer = setInterval(() => {
      clearInterval(timer);
      timer = setInterval(() => fetchHeatmapData(false), getInterval());
    }, 60000);
    return () => { clearInterval(timer); clearInterval(statusTimer); };
  }, [fetchHeatmapData, isMarketOpen]);

  // Hisse secildiginde
  const handleStockClick = (stock) => {
    setSelectedStock(stock);
    setShowModal(true);
    fetchTechnicalAnalysis(stock.symbol);
  };

  // Renk hesaplama
  const getChangeColor = (change) => {
    if (!change || change === 0) return 'bg-gray-700';
    if (change > 3) return 'bg-green-500';
    if (change > 1.5) return 'bg-green-600';
    if (change > 0) return 'bg-green-700';
    if (change < -3) return 'bg-red-500';
    if (change < -1.5) return 'bg-red-600';
    return 'bg-red-700';
  };

  // Boyut hesaplama (volume bazli)
  const getBoxSize = (stock, index) => {
    // BIST 30 icindeki siralama bazli boyut
    if (index < 5) return 'col-span-2 row-span-2';
    if (index < 10) return 'col-span-2';
    return '';
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-dark-950 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-gold-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gold-400 text-lg">Canlı veriler yükleniyor...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-dark-950 p-2 sm:p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-4 gap-2">
        <div>
          <h1 className="text-xl sm:text-3xl font-bold bg-gradient-to-r from-gold-400 to-gold-600 bg-clip-text text-transparent">
            BIST 30 {marketStatus} Heatmap
          </h1>
          <p className="text-gray-400 text-xs sm:text-sm mt-0.5">
            Tıklayın → teknik analiz görün
          </p>
        </div>
        <div className="flex items-center gap-2 sm:gap-4">
          <div className="flex items-center gap-1.5">
            <div className={`w-2.5 h-2.5 rounded-full ${marketStatus === 'Canlı' ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></div>
            <span className="text-gray-400 text-xs sm:text-sm">{marketStatus}</span>
          </div>
          <div className="bg-surface-100 px-2 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm">
            <span className="text-gray-400">Son: </span>
            <span className="text-gold-400 font-mono">
              {lastUpdate ? lastUpdate.toLocaleTimeString('tr-TR') : '--:--:--'}
            </span>
          </div>
        </div>
      </div>

      {/* Renk Aciklamasi - yatay scroll mobilde */}
      <div className="flex items-center gap-2 sm:gap-4 mb-3 sm:mb-6 text-xs overflow-x-auto pb-1 scrollbar-hide">
        <span className="text-gray-500 shrink-0">Değişim:</span>
        {[
          { color: 'bg-red-500', label: '<-3%' },
          { color: 'bg-red-700', label: '-3~0%' },
          { color: 'bg-gray-700', label: '0%' },
          { color: 'bg-green-700', label: '0~3%' },
          { color: 'bg-green-500', label: '>3%' },
        ].map(({ color, label }) => (
          <div key={label} className="flex items-center gap-1 shrink-0">
            <div className={`w-3 h-3 ${color} rounded`}></div>
            <span className="text-gray-400">{label}</span>
          </div>
        ))}
      </div>

      {/* Heatmap Grid — 3 sütun mobil, 4 tablet, 6 masaüstü */}
      <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-1.5 sm:gap-2">
        {stocks.slice(0, 30).map((stock, index) => (
          <div
            key={stock.symbol}
            onClick={() => handleStockClick(stock)}
            className={`
              ${getChangeColor(stock.changePercent)}
              rounded-xl p-2 sm:p-4 cursor-pointer
              active:scale-95 transition-all duration-200
              hover:scale-105 hover:shadow-glow-gold hover:z-10
              flex flex-col justify-between
              min-h-[90px] sm:min-h-[120px]
              border border-white/5
            `}
          >
            <div>
              <div className="font-bold text-white text-sm sm:text-lg leading-tight">{stock.symbol}</div>
              <div className="text-white/60 text-[10px] sm:text-xs truncate">{stock.name}</div>
            </div>
            <div>
              <div className="font-mono text-white text-xs sm:text-xl font-semibold leading-tight">
                {stock.price ? `${stock.price.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}` : '-'}
                <span className="text-white/60 text-[10px] sm:text-sm"> TL</span>
              </div>
              <div className={`font-mono text-xs sm:text-sm font-bold ${stock.changePercent >= 0 ? 'text-green-200' : 'text-red-200'}`}>
                {stock.changePercent !== null ? `${stock.changePercent >= 0 ? '+' : ''}${stock.changePercent.toFixed(2)}%` : '-'}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Ozet Istatistikler */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4 mt-4 sm:mt-6">
        <div className="bg-surface-100 rounded-xl p-3 sm:p-4 border border-gold-500/20">
          <div className="text-gray-400 text-xs sm:text-sm">Toplam Hisse</div>
          <div className="text-xl sm:text-2xl font-bold text-white">{stocks.length}</div>
        </div>
        <div className="bg-surface-100 rounded-xl p-3 sm:p-4 border border-green-500/20">
          <div className="text-gray-400 text-xs sm:text-sm">Yükselenler</div>
          <div className="text-xl sm:text-2xl font-bold text-green-400">
            {stocks.filter(s => s.changePercent > 0).length}
          </div>
        </div>
        <div className="bg-surface-100 rounded-xl p-3 sm:p-4 border border-red-500/20">
          <div className="text-gray-400 text-xs sm:text-sm">Düşenler</div>
          <div className="text-xl sm:text-2xl font-bold text-red-400">
            {stocks.filter(s => s.changePercent < 0).length}
          </div>
        </div>
        <div className="bg-surface-100 rounded-xl p-3 sm:p-4 border border-gray-500/20">
          <div className="text-gray-400 text-xs sm:text-sm">Değişmeyen</div>
          <div className="text-xl sm:text-2xl font-bold text-gray-400">
            {stocks.filter(s => !s.changePercent || s.changePercent === 0).length}
          </div>
        </div>
      </div>

      {/* Teknik Analiz Modal */}
      {showModal && selectedStock && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-surface-100 rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto border border-gold-500/30 shadow-premium">
            {/* Modal Header */}
            <div className="sticky top-0 bg-surface-100 border-b border-surface-300 p-6 flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold text-white">{selectedStock.symbol}</h2>
                <p className="text-gray-400">{selectedStock.name}</p>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-right">
                  <div className="text-2xl font-bold text-white">
                    {selectedStock.price?.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} TL
                  </div>
                  <div className={`font-mono ${selectedStock.changePercent >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {selectedStock.changePercent >= 0 ? '+' : ''}{selectedStock.changePercent?.toFixed(2)}%
                  </div>
                </div>
                <button
                  onClick={() => setShowModal(false)}
                  className="p-2 hover:bg-surface-300 rounded-lg transition-colors"
                >
                  <svg className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Modal Content */}
            <div className="p-6">
              {loadingTechnical ? (
                <div className="flex items-center justify-center py-12">
                  <div className="w-12 h-12 border-4 border-gold-500 border-t-transparent rounded-full animate-spin"></div>
                </div>
              ) : technicalData ? (
                <div className="space-y-6">
                  {/* Trend ve Momentum */}
                  <div className="grid grid-cols-3 gap-2 sm:gap-4">
                    <div className="bg-surface-200 rounded-xl p-4">
                      <div className="text-gray-400 text-sm mb-2">Trend</div>
                      <div className={`text-xl font-bold ${technicalData.trend === 'Yükseliş' ? 'text-green-400' : 'text-red-400'}`}>
                        {technicalData.trend}
                      </div>
                    </div>
                    <div className="bg-surface-200 rounded-xl p-4">
                      <div className="text-gray-400 text-sm mb-2">Momentum</div>
                      <div className={`text-xl font-bold ${technicalData.momentum === 'Guclu' ? 'text-green-400' : 'text-orange-400'}`}>
                        {technicalData.momentum}
                      </div>
                    </div>
                    <div className="bg-surface-200 rounded-xl p-4">
                      <div className="text-gray-400 text-sm mb-2">Volatilite</div>
                      <div className="text-xl font-bold text-white">{technicalData.volatility}%</div>
                    </div>
                  </div>

                  {/* Teknik Gostergeler */}
                  <div>
                    <h3 className="text-lg font-semibold text-white mb-4">Teknik Göstergeler</h3>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div className="bg-surface-200 rounded-lg p-3">
                        <div className="text-gray-400 text-xs">RSI (14)</div>
                        <div className={`text-lg font-bold ${technicalData.indicators?.rsi < 30 ? 'text-green-400' : technicalData.indicators?.rsi > 70 ? 'text-red-400' : 'text-white'}`}>
                          {technicalData.indicators?.rsi || '-'}
                        </div>
                      </div>
                      <div className="bg-surface-200 rounded-lg p-3">
                        <div className="text-gray-400 text-xs">MACD</div>
                        <div className={`text-lg font-bold ${technicalData.indicators?.macd > technicalData.indicators?.macdSignal ? 'text-green-400' : 'text-red-400'}`}>
                          {technicalData.indicators?.macd?.toFixed(2) || '-'}
                        </div>
                      </div>
                      <div className="bg-surface-200 rounded-lg p-3">
                        <div className="text-gray-400 text-xs">EMA 21</div>
                        <div className="text-lg font-bold text-white">
                          {technicalData.indicators?.ema21?.toFixed(2) || '-'}
                        </div>
                      </div>
                      <div className="bg-surface-200 rounded-lg p-3">
                        <div className="text-gray-400 text-xs">EMA 50</div>
                        <div className="text-lg font-bold text-white">
                          {technicalData.indicators?.ema50?.toFixed(2) || '-'}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Bollinger Bands */}
                  <div>
                    <h3 className="text-lg font-semibold text-white mb-4">Bollinger Bands</h3>
                    <div className="bg-surface-200 rounded-xl p-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-gray-400">Üst Bant</span>
                        <span className="text-white font-mono">{technicalData.indicators?.bollingerUpper?.toFixed(2)}</span>
                      </div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-gray-400">Orta Bant (SMA 20)</span>
                        <span className="text-gold-400 font-mono">{technicalData.indicators?.bollingerMiddle?.toFixed(2)}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-gray-400">Alt Bant</span>
                        <span className="text-white font-mono">{technicalData.indicators?.bollingerLower?.toFixed(2)}</span>
                      </div>
                      <div className="mt-3 pt-3 border-t border-surface-300">
                        <div className="flex items-center justify-between">
                          <span className="text-gray-400">Güncel Fiyat</span>
                          <span className="text-xl font-bold text-gold-400">{selectedStock.price?.toFixed(2)} TL</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Destek/Direnc */}
                  <div>
                    <h3 className="text-lg font-semibold text-white mb-4">Destek ve Direnç Seviyeleri</h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-surface-200 rounded-xl p-4">
                        <div className="text-red-400 text-sm mb-2">Direnç</div>
                        <div className="text-xl font-bold text-white">{technicalData.levels?.resistance?.toFixed(2)} TL</div>
                      </div>
                      <div className="bg-surface-200 rounded-xl p-4">
                        <div className="text-green-400 text-sm mb-2">Destek</div>
                        <div className="text-xl font-bold text-white">{technicalData.levels?.support?.toFixed(2)} TL</div>
                      </div>
                    </div>
                  </div>

                  {/* Sinyaller */}
                  {technicalData.signals && (
                    <div>
                      <h3 className="text-lg font-semibold text-white mb-4">Teknik Sinyaller</h3>
                      <div className="grid grid-cols-2 gap-3">
                        {technicalData.signals.map((signal, idx) => (
                          <div key={idx} className="bg-surface-200 rounded-lg p-3 flex items-center justify-between">
                            <span className="text-gray-400">{signal.indicator}</span>
                            <span className={`font-semibold ${signal.signal.includes('Alis') || signal.signal.includes('Pozitif') || signal.signal.includes('Asiri Satim')
                              ? 'text-green-400'
                              : signal.signal.includes('Satis') || signal.signal.includes('Negatif') || signal.signal.includes('Asiri Alim')
                                ? 'text-red-400'
                                : 'text-gray-300'
                              }`}>
                              {signal.signal}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Butonlar */}
                  <div className="space-y-3 pt-4">
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        onClick={() => navigate(`/teknik-analiz-ai?symbol=${selectedStock.symbol}`)}
                        className="bg-gradient-to-r from-gold-500 to-gold-600 text-dark-950 font-semibold py-3 rounded-xl hover:from-gold-400 hover:to-gold-500 transition-all"
                      >
                        Detaylı Teknik Analiz
                      </button>
                      <button
                        onClick={() => navigate(`/temel-analiz-ai?symbol=${selectedStock.symbol}`)}
                        className="bg-surface-200 text-white font-semibold py-3 rounded-xl hover:bg-surface-300 transition-all border border-gold-500/30"
                      >
                        Temel Analiz
                      </button>
                    </div>
                    <button
                      onClick={() => window.open(`https://tr.tradingview.com/chart/?symbol=BIST:${selectedStock.symbol}&interval=D`, '_blank')}
                      className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-xl transition-all flex items-center justify-center gap-2"
                    >
                      <ExternalLink className="w-5 h-5" />
                      TradingView'de Aç
                    </button>
                  </div>
                </div>
              ) : (
                <div className="text-center py-12 text-gray-400">
                  Teknik analiz verisi yüklenemedi
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="mt-8 text-center text-gray-500 text-sm">
        <p>Tüm hakları saklıdır. Borsa Krali</p>
        <p className="mt-1">Yatırım tavsiyesi ve öneri niteliği taşımaz. Yalnızca eğitim amaçlıdır.</p>
      </div>
    </div>
  );
}
