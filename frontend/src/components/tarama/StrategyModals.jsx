import { X, Zap, Target } from 'lucide-react'
import useModalDismiss from '../../hooks/useModalDismiss'

/**
 * TaramaAnalizMerkezi sayfasından çıkarılmış 3 yardımcı bileşen.
 *
 * - StrategyStocksModal: bir stratejide tetiklenen hisseler listesi (modal)
 * - StockDetailModal: tek hisse detayı (Standart/Strateji görünüm toggle'lı modal)
 * - StrategyView: StockDetailModal içinde gösterilen indikatör konsensüsü +
 *   tetiklenen tarama stratejileri + pozisyon seviyeleri
 *
 * Önceden TaramaAnalizMerkezi.jsx içinde 480 satır local function olarak duruyordu.
 * Sayfa state'i çok değil — props'la geçiyor.
 */

export function StrategyStocksModal({ strategy, onClose, onSelectStock }) {
  useModalDismiss(onClose)
  const stocks = strategy.stocks || []
  const isBull = !strategy.type?.toLowerCase().includes('ay') && !strategy.type?.toLowerCase().includes('düş')
  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-2 md:p-4" onClick={onClose}>
      <div
        className="bg-dark-900 rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto border border-dark-700"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-dark-900 border-b border-dark-700 p-4 flex items-center justify-between z-10">
          <div className="flex items-center gap-3">
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center text-white font-bold ${isBull ? 'bg-green-600' : 'bg-red-600'}`}>
              {stocks.length}
            </div>
            <div>
              <h2 className="text-lg md:text-xl font-bold text-white">{strategy.name}</h2>
              <p className={`text-xs ${isBull ? 'text-green-400' : 'text-red-400'}`}>{strategy.type} · {stocks.length} tespit · %{strategy.success} başarı</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-dark-700 rounded-lg">
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        <div className="p-3 md:p-4">
          {stocks.length === 0 ? (
            <p className="text-center text-gray-500 py-8 text-sm">Bu stratejide hisse bulunamadı.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {stocks
                .slice()
                .sort((a, b) => (b.change || 0) - (a.change || 0))
                .map((st) => (
                  <button
                    key={st.symbol}
                    onClick={() => onSelectStock(st)}
                    className="text-left bg-dark-800 hover:bg-dark-700 border border-dark-700 hover:border-primary-500/40 rounded-xl p-3 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-white font-semibold">{st.symbol}</span>
                        <span className="text-gray-400 text-xs font-mono">{st.price?.toFixed(2)} ₺</span>
                      </div>
                      <span className={`text-sm font-semibold ${(st.change || 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {(st.change || 0) >= 0 ? '+' : ''}{st.change?.toFixed(2)}%
                      </span>
                    </div>
                    <div className="mt-1 flex items-center justify-between text-[11px] text-gray-500">
                      <span>Haftalık</span>
                      <span className={(st.weekChange || 0) >= 0 ? 'text-green-400' : 'text-red-400'}>
                        {(st.weekChange || 0) >= 0 ? '+' : ''}{st.weekChange?.toFixed(2)}%
                      </span>
                    </div>
                  </button>
                ))}
            </div>
          )}
          <p className="text-center text-[10px] text-gray-500 mt-3">Detaylı analiz için bir hisseye tıklayın.</p>
        </div>
      </div>
    </div>
  )
}

export function StockDetailModal({ stock, detail, loading, view, onViewChange, onClose, backLabel }) {
  useModalDismiss(onClose, { open: !!stock })
  if (!stock) return null

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-2 md:p-4" onClick={onClose}>
      <div
        className="bg-dark-900 rounded-2xl w-full max-w-4xl max-h-[95vh] overflow-y-auto border border-dark-700"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="sticky top-0 bg-dark-900 border-b border-dark-700 p-3 md:p-4 flex items-center justify-between z-10">
          <div>
            {backLabel && (
              <button
                onClick={onClose}
                className="text-xs text-primary-400 hover:text-primary-300 mb-1 flex items-center gap-1"
              >
                ← {backLabel}
              </button>
            )}
            <h2 className="text-xl md:text-2xl font-bold text-white">{stock.symbol}</h2>
            <div className="flex flex-wrap items-center gap-2 md:gap-3 mt-1">
              <span className="text-lg md:text-2xl font-bold text-gold-400">
                {detail?.price?.toFixed(2) || stock.price?.toFixed(2)} ₺
              </span>
              {detail?.trend && (
                <span className={`px-2 md:px-3 py-1 rounded-lg text-xs md:text-sm font-medium ${detail.trend.includes('YÜKSELİŞ') || detail.trend.includes('BOĞA')
                    ? 'bg-green-500/20 text-green-400'
                    : detail.trend.includes('DÜŞÜŞ')
                      ? 'bg-red-500/20 text-red-400'
                      : 'bg-gray-500/20 text-gray-400'
                  }`}>
                  TREND: {detail.trend}
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex gap-1 bg-dark-800 rounded-lg p-1">
              <button
                onClick={() => onViewChange('standart')}
                className={`px-2 md:px-3 py-1 rounded text-xs md:text-sm flex items-center gap-1 ${view === 'standart' ? 'bg-primary-500 text-white' : 'text-gray-400'
                  }`}
              >
                ⚡ STANDART
              </button>
              <button
                onClick={() => onViewChange('strateji')}
                className={`px-2 md:px-3 py-1 rounded text-xs md:text-sm flex items-center gap-1 ${view === 'strateji' ? 'bg-primary-500 text-white' : 'text-gray-400'
                  }`}
              >
                ✨ STRATEJİ
              </button>
            </div>

            <button onClick={onClose} className="p-2 hover:bg-dark-700 rounded-lg">
              <X className="w-5 h-5 text-gray-400" />
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-10 h-10 border-4 border-primary-500 border-t-transparent rounded-full animate-spin"></div>
          </div>
        ) : detail ? view === 'strateji' ? (
          <StrategyView detail={detail} />
        ) : (
          <div className="p-4 md:p-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
              {/* EMA Merdiveni */}
              <div className="bg-dark-800 rounded-xl p-4 border border-dark-700">
                <h3 className="text-gray-400 text-xs md:text-sm font-medium mb-3 md:mb-4 flex items-center gap-2">
                  <span className="w-2 h-2 bg-primary-500 rounded-full"></span>
                  EMA MERDİVENİ
                </h3>

                <div className="space-y-2">
                  <div className="flex justify-between items-center py-2 border-b border-dark-700">
                    <span className="text-gray-400 text-sm">GÜNCEL FİYAT</span>
                    <span className="text-white font-mono">{detail.price?.toFixed(2)}</span>
                  </div>

                  {detail.emaLadder
                    .sort((a, b) => b.value - a.value)
                    .map((ema) => (
                      <div
                        key={ema.name}
                        className={`flex justify-between items-center py-2 px-3 rounded-lg text-sm ${ema.abovePrice ? 'bg-green-500/10 border border-green-500/30' : 'bg-dark-700'
                          }`}
                      >
                        <span className={ema.abovePrice ? 'text-green-400' : 'text-gray-400'}>{ema.name}</span>
                        <span className={`font-mono ${ema.abovePrice ? 'text-green-400' : 'text-white'}`}>
                          {ema.value?.toFixed(2)}
                        </span>
                      </div>
                    ))}
                </div>
              </div>

              {/* İndikatörler */}
              <div className="bg-dark-800 rounded-xl p-4 border border-dark-700">
                <h3 className="text-gray-400 text-xs md:text-sm font-medium mb-3 md:mb-4">İNDİKATÖRLER</h3>
                <div className="grid grid-cols-2 gap-3 md:gap-4">
                  <div className="text-center p-3 bg-dark-700 rounded-lg">
                    <div className="text-[10px] md:text-xs text-gray-500 mb-1">RSI (14)</div>
                    <div className={`text-xl md:text-2xl font-bold ${detail.indicators.rsi > 70 ? 'text-red-400' :
                        detail.indicators.rsi < 30 ? 'text-green-400' : 'text-yellow-400'
                      }`}>
                      {detail.indicators.rsi?.toFixed(2)}
                    </div>
                  </div>
                  <div className="text-center p-3 bg-dark-700 rounded-lg">
                    <div className="text-[10px] md:text-xs text-gray-500 mb-1">ADX Gücü</div>
                    <div className="text-xl md:text-2xl font-bold text-primary-400">
                      {detail.indicators.adx?.toFixed(2)}
                    </div>
                  </div>
                </div>
                <div className="mt-3 md:mt-4 p-3 bg-dark-700 rounded-lg">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-500 text-sm">MACD</span>
                    <span className={`text-lg md:text-xl font-bold ${detail.indicators.macd > 0 ? 'text-green-400' : 'text-red-400'
                      }`}>
                      {detail.indicators.macd?.toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Performans & Doygunluk */}
              <div className="space-y-4">
                <div className="bg-dark-800 rounded-xl p-4 border border-dark-700">
                  <h3 className="text-gray-400 text-xs md:text-sm font-medium mb-3 md:mb-4">PERFORMANS</h3>
                  <div className="space-y-2 md:space-y-3 text-sm">
                    <div className="flex justify-between items-center">
                      <span className="text-gray-400">Sektör Relatif</span>
                      <span className={`font-semibold ${parseFloat(detail.performance.sektorRelatif) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        %{detail.performance.sektorRelatif > 0 ? '+' : ''}{detail.performance.sektorRelatif}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-400">Endeks (XU100)</span>
                      <span className={`font-semibold ${parseFloat(detail.performance.endeksPerformans) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        %{detail.performance.endeksPerformans > 0 ? '+' : ''}{detail.performance.endeksPerformans}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-400">Haftalık Değişim</span>
                      <span className={`font-semibold ${parseFloat(detail.performance.haftalikDegisim) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        %{detail.performance.haftalikDegisim > 0 ? '+' : ''}{detail.performance.haftalikDegisim}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="bg-dark-800 rounded-xl p-4 border border-dark-700 space-y-3 md:space-y-4">
                  <div>
                    <div className="flex justify-between items-center mb-2 text-sm">
                      <span className="text-gray-400">FİYAT DOYGUNLUĞU</span>
                      <span className="text-white font-semibold">%{detail.fiyatDoygunlugu?.toFixed(2)}</span>
                    </div>
                    <div className="h-2 bg-dark-700 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${detail.fiyatDoygunlugu > 70 ? 'bg-red-500' :
                            detail.fiyatDoygunlugu < 30 ? 'bg-green-500' : 'bg-primary-500'
                          }`}
                        style={{ width: `${detail.fiyatDoygunlugu}%` }}
                      ></div>
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between items-center mb-2 text-sm">
                      <span className="text-gray-400">HACİM GÜCÜ</span>
                      <span className={`font-semibold ${detail.hacimGucu > 100 ? 'text-green-400' : 'text-red-400'}`}>
                        %{detail.hacimGucu}
                      </span>
                    </div>
                    <div className="h-2 bg-dark-700 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${detail.hacimGucu > 100 ? 'bg-green-500' : 'bg-red-500'}`}
                        style={{ width: `${Math.min(100, detail.hacimGucu)}%` }}
                      ></div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-4 md:mt-6 text-center text-[10px] md:text-xs text-yellow-400/70">
              ⚠️ Bu veriler yalnızca teknik analiz eğitim amaçlıdır. Yatırım tavsiyesi niteliği taşımaz.
            </div>
          </div>
        ) : (
          <div className="p-8 text-center text-gray-400">Veri yüklenemedi</div>
        )}
      </div>
    </div>
  )
}

// Strateji görünümü — indikatör bazlı sinyal kararı, tetiklenen stratejiler, AL/SAT seviyeleri
function StrategyView({ detail }) {
  const price = detail.price
  const ema5   = detail.emaLadder.find(e => e.name === 'EMA 5')?.value
  const ema21  = detail.emaLadder.find(e => e.name === 'EMA 21')?.value
  const ema50  = detail.emaLadder.find(e => e.name === 'EMA 50')?.value
  const ema200 = detail.emaLadder.find(e => e.name === 'EMA 200')?.value
  const rsi  = detail.indicators.rsi
  const macd = detail.indicators.macd
  const macdSignal = detail.indicators.macdSignal ?? 0
  const macdHist   = detail.indicators.macdHist ?? (macd - macdSignal)
  const adx  = detail.indicators.adx
  const atr  = detail.indicators.atr || price * 0.02
  const hacim = detail.hacimGucu

  // İndikatör bazlı verdict listesi
  const verdicts = [
    {
      name: 'RSI Momentum',
      desc: '< 30 aşırı satım (AL), > 70 aşırı alım (SAT)',
      signal: rsi < 30 ? 'AL' : rsi > 70 ? 'SAT' : 'NÖTR',
      detay: `RSI: ${rsi.toFixed(2)}`,
    },
    {
      name: 'MACD Yön',
      desc: 'MACD > Sinyal ve histogram pozitif → AL',
      signal: (macd > macdSignal && macdHist > 0) ? 'AL' : (macd < macdSignal && macdHist < 0) ? 'SAT' : 'NÖTR',
      detay: `MACD ${macd.toFixed(2)} · Sinyal ${macdSignal.toFixed(2)} · Hist ${macdHist.toFixed(2)}`,
    },
    {
      name: 'ADX Trend Gücü',
      desc: '> 25 güçlü trend var; < 20 trend zayıf',
      signal: adx > 25 ? 'GÜÇLÜ' : adx > 20 ? 'NORMAL' : 'ZAYIF',
      detay: `ADX: ${adx.toFixed(2)}`,
    },
    {
      name: 'EMA Sıralaması (21/50)',
      desc: 'Fiyat > EMA21 > EMA50 yükselen sıralama → AL',
      signal: (price > (ema21 || 0) && (ema21 || 0) > (ema50 || 0)) ? 'AL'
            : (price < (ema21 || 0) && (ema21 || 0) < (ema50 || 0)) ? 'SAT' : 'NÖTR',
      detay: `Fiyat ${price.toFixed(2)} · EMA21 ${ema21?.toFixed(2)} · EMA50 ${ema50?.toFixed(2)}`,
    },
    {
      name: 'EMA 200 Uzun Vade',
      desc: 'EMA200 üzeri uzun vadeli yükseliş; altı düşüş',
      signal: ema200 ? (price > ema200 ? 'AL' : 'SAT') : 'NÖTR',
      detay: `EMA200: ${ema200?.toFixed(2) ?? '—'}`,
    },
    {
      name: 'Hacim Doygunluğu',
      desc: '20 günlük ortalamaya kıyasla; > %150 güçlü',
      signal: hacim > 150 ? 'GÜÇLÜ' : hacim > 100 ? 'NORMAL' : 'ZAYIF',
      detay: `Hacim: %${hacim}`,
    },
  ]

  const alSayisi  = verdicts.filter(v => v.signal === 'AL').length
  const satSayisi = verdicts.filter(v => v.signal === 'SAT').length
  const ana = alSayisi > satSayisi ? 'AL' : satSayisi > alSayisi ? 'SAT' : 'NÖTR'
  const skorYuzde = Math.round(((alSayisi - satSayisi) + 6) / 12 * 100)

  // AL/SAT seviyeleri — ATR bazlı: stop = 1.5 ATR aşağı, hedefler 1.5R / 3R / 5R
  const stopLossLong  = Math.max(price - atr * 1.5, ema21 || 0, price * 0.93)
  const stopAdjusted  = stopLossLong > price ? price * 0.95 : stopLossLong
  const risk = price - stopAdjusted
  const tp1 = price + risk * 1.5
  const tp2 = price + risk * 3
  const tp3 = price + risk * 5

  const matchedBoga = detail.matchedBoga || []
  const matchedAyi  = detail.matchedAyi  || []

  return (
    <div className="p-4 md:p-6 space-y-4">
      {/* Ana karar kartı */}
      <div className={`rounded-2xl p-4 md:p-5 border-2 ${
        ana === 'AL' ? 'bg-green-500/10 border-green-500/40'
        : ana === 'SAT' ? 'bg-red-500/10 border-red-500/40'
        : 'bg-yellow-500/10 border-yellow-500/40'
      }`}>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <p className="text-[11px] text-gray-400 uppercase tracking-wide">İndikatör Konsensüs Kararı</p>
            <p className={`text-3xl md:text-4xl font-bold mt-1 ${
              ana === 'AL' ? 'text-green-400'
              : ana === 'SAT' ? 'text-red-400'
              : 'text-yellow-400'
            }`}>{ana}</p>
            <p className="text-[11px] text-gray-500 mt-1">{verdicts.length} indikatör değerlendirildi</p>
          </div>
          <div className="text-right">
            <div className="flex items-center gap-3 text-sm">
              <span className="text-green-400 font-semibold">↑ {alSayisi} AL</span>
              <span className="text-red-400 font-semibold">↓ {satSayisi} SAT</span>
              <span className="text-yellow-400 font-semibold">~ {verdicts.length - alSayisi - satSayisi} NÖTR</span>
            </div>
            <div className="mt-2 w-32 md:w-40 ml-auto">
              <div className="h-1.5 bg-dark-700 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${ana === 'AL' ? 'bg-green-500' : ana === 'SAT' ? 'bg-red-500' : 'bg-yellow-500'}`}
                  style={{ width: `${Math.max(5, Math.min(95, skorYuzde))}%` }}
                />
              </div>
              <p className="text-[10px] text-gray-500 mt-1">Boğa Skoru: %{skorYuzde}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Tetiklenen tarama stratejileri */}
      {(matchedBoga.length > 0 || matchedAyi.length > 0) && (
        <div className="bg-dark-800 rounded-xl p-4 border border-dark-700">
          <h3 className="text-white text-sm font-semibold mb-3 flex items-center gap-2">
            <Zap className="w-4 h-4 text-amber-400" />
            Bu Hissede Tetiklenen Tarama Stratejileri
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {matchedBoga.map(s => (
              <div key={`boga-${s.name}`} className="flex items-center justify-between p-2.5 bg-green-500/5 border border-green-500/20 rounded-lg">
                <div className="min-w-0">
                  <p className="text-green-400 text-sm font-semibold truncate">↑ {s.name}</p>
                  <p className="text-[10px] text-gray-500">{s.type}</p>
                </div>
                <div className="text-right text-[11px] shrink-0 ml-2">
                  <p className="text-white">%{s.success}</p>
                  <p className="text-gray-500">R/K {s.riskReward}</p>
                </div>
              </div>
            ))}
            {matchedAyi.map(s => (
              <div key={`ayi-${s.name}`} className="flex items-center justify-between p-2.5 bg-red-500/5 border border-red-500/20 rounded-lg">
                <div className="min-w-0">
                  <p className="text-red-400 text-sm font-semibold truncate">↓ {s.name}</p>
                  <p className="text-[10px] text-gray-500">{s.type}</p>
                </div>
                <div className="text-right text-[11px] shrink-0 ml-2">
                  <p className="text-white">%{s.success}</p>
                  <p className="text-gray-500">R/K {s.riskReward}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* İndikatör bazlı verdict listesi */}
      <div className="bg-dark-800 rounded-xl p-4 border border-dark-700">
        <h3 className="text-white text-sm font-semibold mb-3">İndikatör Bazlı Sinyaller</h3>
        <div className="space-y-2">
          {verdicts.map(v => (
            <div key={v.name} className="flex items-center justify-between gap-3 py-2 px-3 bg-dark-700/40 rounded-lg">
              <div className="flex-1 min-w-0">
                <p className="text-white text-sm font-medium">{v.name}</p>
                <p className="text-[10px] text-gray-500">{v.desc}</p>
                <p className="text-[10px] text-gray-400 mt-0.5 font-mono">{v.detay}</p>
              </div>
              <span className={`px-2.5 py-1 rounded text-xs font-bold whitespace-nowrap ${
                v.signal === 'AL' || v.signal === 'GÜÇLÜ' ? 'bg-green-500/20 text-green-400'
                : v.signal === 'SAT' || v.signal === 'ZAYIF' ? 'bg-red-500/20 text-red-400'
                : v.signal === 'NORMAL' ? 'bg-blue-500/20 text-blue-400'
                : 'bg-yellow-500/20 text-yellow-400'
              }`}>{v.signal}</span>
            </div>
          ))}
        </div>
      </div>

      {/* AL/SAT Seviyeleri (long senaryo) */}
      <div className="bg-dark-800 rounded-xl p-4 border border-dark-700">
        <h3 className="text-white text-sm font-semibold mb-3 flex items-center gap-2">
          <Target className="w-4 h-4 text-primary-400" />
          Pozisyon Seviyeleri — Long Senaryo (ATR Bazlı)
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
          <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-2.5 text-center">
            <p className="text-[10px] text-blue-300 uppercase">Giriş</p>
            <p className="text-white font-mono text-sm md:text-base mt-0.5">{price.toFixed(2)} ₺</p>
            <p className="text-[9px] text-gray-500">spot</p>
          </div>
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-2.5 text-center">
            <p className="text-[10px] text-red-300 uppercase">Zarar Durdur</p>
            <p className="text-red-400 font-mono text-sm md:text-base mt-0.5">{stopAdjusted.toFixed(2)} ₺</p>
            <p className="text-[9px] text-red-300/80">{((stopAdjusted/price - 1) * 100).toFixed(2)}%</p>
          </div>
          <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-2.5 text-center">
            <p className="text-[10px] text-green-300 uppercase">TP1 (1.5R)</p>
            <p className="text-green-400 font-mono text-sm md:text-base mt-0.5">{tp1.toFixed(2)} ₺</p>
            <p className="text-[9px] text-green-300/80">+{((tp1/price - 1) * 100).toFixed(2)}%</p>
          </div>
          <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-2.5 text-center">
            <p className="text-[10px] text-green-300 uppercase">TP2 (3R)</p>
            <p className="text-green-400 font-mono text-sm md:text-base mt-0.5">{tp2.toFixed(2)} ₺</p>
            <p className="text-[9px] text-green-300/80">+{((tp2/price - 1) * 100).toFixed(2)}%</p>
          </div>
          <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-2.5 text-center">
            <p className="text-[10px] text-green-300 uppercase">TP3 (5R)</p>
            <p className="text-green-400 font-mono text-sm md:text-base mt-0.5">{tp3.toFixed(2)} ₺</p>
            <p className="text-[9px] text-green-300/80">+{((tp3/price - 1) * 100).toFixed(2)}%</p>
          </div>
        </div>
        <p className="text-[10px] text-gray-500 mt-3 leading-relaxed">
          Zarar Durdur: 1.5 kat oynaklık aşağı veya kısa-vade ortalama (hangisi yüksekse) — risk {risk.toFixed(2)} ₺.
          Hedefler kazanç-zarar oranına göre. Oynaklık ölçüsü: {atr.toFixed(2)} ₺.
        </p>
      </div>

      <div className="mt-2 text-center text-[10px] md:text-xs text-yellow-400/70">
        ⚠️ Bu veriler yalnızca teknik analiz eğitim amaçlıdır. Yatırım tavsiyesi niteliği taşımaz.
      </div>
    </div>
  )
}
