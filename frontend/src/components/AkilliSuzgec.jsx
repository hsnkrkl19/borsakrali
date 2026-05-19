import { useState, useMemo } from 'react'
import { Search, Filter, ChevronDown, ChevronUp, RefreshCw, Activity } from 'lucide-react'
import InfoTooltip from './InfoTooltip'
import DailySignalRow from './DailySignalRow'

/**
 * Akıllı Süzgeç — GunlukTespitler "araclar/suzgec" sub-tab içeriği.
 *
 * Önceden GunlukTespitler.jsx içinde 160+ satır inline JSX idi; filtre state'i
 * ve expand state'i sayfa root'unda tutuluyordu. Şimdi bileşen kendi
 * filters+expanded state'ini yönetir, sayfa sadece signals + watchlist'i geçer.
 */
export default function AkilliSuzgec({
  signals,
  loading,
  isDesktop,
  watchlistSymbols,
  addingToWatchlist,
  onAddWatchlist,
  onRescan,
}) {
  const [filters, setFilters] = useState({ search: '', strategy: 'all', status: 'all' })
  const [showFilters, setShowFilters] = useState(false)
  const [expandedSignal, setExpandedSignal] = useState(null)

  const activeFilterCount =
    (filters.strategy !== 'all' ? 1 : 0) + (filters.status !== 'all' ? 1 : 0)

  const filteredSignals = useMemo(() => {
    return (signals || []).filter((signal) => {
      if (filters.search && !signal.stockSymbol?.toLowerCase().includes(filters.search.toLowerCase())) return false
      if (filters.strategy !== 'all' && signal.strategy !== filters.strategy) return false
      if (filters.status !== 'all' && signal.status !== filters.status) return false
      return true
    })
  }, [signals, filters])

  const clearFilters = () => setFilters((f) => ({ ...f, strategy: 'all', status: 'all' }))
  const toggleExpand = (id) => setExpandedSignal((cur) => (cur === id ? null : id))

  return (
    <>
      {/* Üst kontrol şeridi: Arama (her zaman) + Filtreler butonu (gelişmiş seçenekleri açar) */}
      <div className="card">
        <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 items-stretch sm:items-center">
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input
              type="text"
              placeholder="Sembol ara (THYAO, GARAN...)"
              value={filters.search}
              onChange={(e) => setFilters({ ...filters, search: e.target.value })}
              className="input pl-10 w-full text-sm"
            />
          </div>
          <button
            type="button"
            onClick={() => setShowFilters((v) => !v)}
            className={`flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold transition-colors whitespace-nowrap ${
              showFilters || activeFilterCount > 0
                ? 'bg-amber-500/15 text-amber-200 border border-amber-500/40'
                : 'bg-dark-800 text-gray-300 border border-dark-700 hover:bg-dark-700'
            }`}
          >
            <Filter className="w-4 h-4" />
            Filtreler
            {activeFilterCount > 0 && (
              <span className="bg-amber-500 text-dark-950 text-[10px] font-bold min-w-[18px] h-[18px] px-1 rounded-full flex items-center justify-center leading-none">
                {activeFilterCount}
              </span>
            )}
            {showFilters ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
          {activeFilterCount > 0 && (
            <button
              type="button"
              onClick={clearFilters}
              className="text-[11px] text-gray-400 hover:text-white whitespace-nowrap"
            >
              Filtreleri temizle
            </button>
          )}
        </div>

        {/* Gelişmiş filtreler — sadece toggle açıldığında */}
        {showFilters && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4 mt-3 pt-3 border-t border-dark-700">
            <div>
              <label className="block text-[10px] md:text-xs text-gray-400 mb-1.5 md:mb-2">STRATEJI</label>
              <select
                value={filters.strategy}
                onChange={(e) => setFilters({ ...filters, strategy: e.target.value })}
                className="input w-full text-sm"
              >
                <option value="all">Tümü</option>
                <option value="RSI Signal">RSI</option>
                <option value="MACD Crossover">MACD</option>
                <option value="EMA Crossover">EMA</option>
                <option value="Bollinger Oversold">Bollinger</option>
              </select>
            </div>
            <div>
              <label className="block text-[10px] md:text-xs text-gray-400 mb-1.5 md:mb-2">DURUM</label>
              <select
                value={filters.status}
                onChange={(e) => setFilters({ ...filters, status: e.target.value })}
                className="input w-full text-sm"
              >
                <option value="all">Tümü</option>
                <option value="active">Aktif</option>
                <option value="closed">Kapandı</option>
              </select>
            </div>
          </div>
        )}
      </div>

      {/* Signals Table */}
      <div className="card">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <RefreshCw className="w-8 h-8 text-primary-500 animate-spin" />
          </div>
        ) : filteredSignals.length === 0 ? (
          <div className="text-center py-12">
            <Activity className="w-12 h-12 text-gray-600 mx-auto mb-4" />
            <p className="text-gray-400">Sinyal bulunamadı</p>
            {onRescan && (
              <button
                onClick={onRescan}
                className="mt-4 text-primary-500 hover:text-primary-400 text-sm"
              >
                Yeni tarama baslat
              </button>
            )}
          </div>
        ) : (
          <>
            {/* Mobil kart listesi — sadece mobilde mount */}
            {!isDesktop && (
              <div className="space-y-3">
                {filteredSignals.map((signal, idx) => (
                  <DailySignalRow
                    key={signal.id || idx}
                    signal={signal}
                    idx={idx}
                    isDesktop={false}
                    isExpanded={expandedSignal === (signal.id || idx)}
                    onToggleExpand={() => toggleExpand(signal.id || idx)}
                    onAddWatchlist={onAddWatchlist}
                    addingToWatchlist={addingToWatchlist}
                    isInWatchlist={watchlistSymbols.has(signal.stockSymbol?.toUpperCase())}
                  />
                ))}
              </div>
            )}

            {/* Masaüstü tablosu — sadece desktop'ta mount */}
            {isDesktop && (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px]">
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border-main)' }}>
                      <th className="text-left text-[11px] font-semibold py-3 px-3" style={{ color: 'var(--text-faint)' }}>TAKİP</th>
                      <th className="text-left text-[11px] font-semibold py-3 px-3" style={{ color: 'var(--text-faint)' }}>SEMBOL</th>
                      <th className="text-left text-[11px] font-semibold py-3 px-3" style={{ color: 'var(--text-faint)' }}>
                        AKSİYON <InfoTooltip title="Aksiyon" description="AL: Algoritma alım fırsatı tespit etti. SAT: Çıkış / kâr alma sinyali. TUT: Belirsiz, yeni işlem önerilmez." size="sm" />
                      </th>
                      <th className="text-left text-[11px] font-semibold py-3 px-3" style={{ color: 'var(--text-faint)' }}>
                        STRATEJİ <InfoTooltip title="Strateji" description="Sinyali tetikleyen teknik gösterge. Üzerine ⓘ ile ne anlama geldiğini görebilirsiniz." size="sm" />
                      </th>
                      <th className="text-left text-[11px] font-semibold py-3 px-3" style={{ color: 'var(--text-faint)' }}>PERİYOD</th>
                      <th className="text-right text-[11px] font-semibold py-3 px-3" style={{ color: 'var(--text-faint)' }}>FİYAT</th>
                      <th className="text-right text-[11px] font-semibold py-3 px-3" style={{ color: 'var(--text-faint)' }}>DEĞİŞİM</th>
                      <th className="text-left text-[11px] font-semibold py-3 px-3" style={{ color: 'var(--text-faint)' }}>
                        TESPİT <InfoTooltip title="Tespit zamanı" description="Sinyalin algoritma tarafından üretildiği zaman. Eski sinyaller geçerliliğini yitirebilir; her stratejinin kendi vade süresi vardır." size="sm" />
                      </th>
                      <th className="text-left text-[11px] font-semibold py-3 px-3" style={{ color: 'var(--text-faint)' }}>DURUM</th>
                      <th className="text-center text-[11px] font-semibold py-3 px-2" style={{ color: 'var(--text-faint)' }}>PLAN</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredSignals.map((signal, idx) => (
                      <DailySignalRow
                        key={signal.id || idx}
                        signal={signal}
                        idx={idx}
                        isDesktop={true}
                        isExpanded={expandedSignal === (signal.id || idx)}
                        onToggleExpand={() => toggleExpand(signal.id || idx)}
                        onAddWatchlist={onAddWatchlist}
                        addingToWatchlist={addingToWatchlist}
                        isInWatchlist={watchlistSymbols.has(signal.stockSymbol?.toUpperCase())}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </>
  )
}
