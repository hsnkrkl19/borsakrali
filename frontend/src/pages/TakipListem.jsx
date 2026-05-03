import { useState, useEffect, useMemo } from 'react'
import {
  Briefcase, Plus, Trash2, TrendingUp, TrendingDown, RefreshCw,
  X, Calendar, DollarSign, Hash, FileText, AlertCircle, Edit3,
  ChevronDown, ChevronRight, ShoppingCart, Receipt,
} from 'lucide-react'
import api from '../services/api'

const fmt    = (n, d = 2) => n == null || isNaN(n) ? '—' : n.toLocaleString('tr-TR', { minimumFractionDigits: d, maximumFractionDigits: d })
const fmtTL  = (n) => n == null ? '—' : `${fmt(n)} ₺`
const fmtPct = (n) => n == null ? '—' : `${n >= 0 ? '+' : ''}${fmt(n)}%`

export default function TakipListem() {
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)
  const [showAdd, setShowAdd] = useState(false)
  const [editingLot, setEditingLot] = useState(null)
  const [expandedSym, setExpandedSym] = useState(new Set())
  const [refreshTick, setRefreshTick] = useState(0)
  const [filter, setFilter]   = useState('') // sym arama

  // Form state
  const [formSymbol, setFormSymbol]   = useState('')
  const [formQty, setFormQty]         = useState('')
  const [formPrice, setFormPrice]     = useState('')
  const [formDate, setFormDate]       = useState(new Date().toISOString().slice(0, 10))
  const [formType, setFormType]       = useState('buy')
  const [formNote, setFormNote]       = useState('')
  const [submitting, setSubmitting]   = useState(false)

  const fetchPortfolio = async () => {
    setLoading(true)
    setError(null)
    try {
      const r = await api.get('/portfolio')
      setData(r.data)
    } catch (e) {
      setError(e.response?.data?.error || e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchPortfolio() }, [refreshTick])

  // Auto-refresh fiyatlar (60sn)
  useEffect(() => {
    const i = setInterval(() => setRefreshTick(t => t + 1), 60_000)
    return () => clearInterval(i)
  }, [])

  const resetForm = () => {
    setFormSymbol('')
    setFormQty('')
    setFormPrice('')
    setFormDate(new Date().toISOString().slice(0, 10))
    setFormType('buy')
    setFormNote('')
    setEditingLot(null)
  }

  const handleAdd = async (e) => {
    e?.preventDefault()
    if (!formSymbol || !formQty || !formPrice) return
    setSubmitting(true)
    try {
      if (editingLot) {
        await api.put(`/portfolio/${editingLot.id}`, {
          quantity: formQty,
          buyPrice: formPrice,
          buyDate: formDate,
          type: formType,
          note: formNote,
        })
      } else {
        await api.post('/portfolio', {
          symbol: formSymbol.toUpperCase().trim(),
          quantity: formQty,
          buyPrice: formPrice,
          buyDate: formDate,
          type: formType,
          note: formNote,
        })
      }
      resetForm()
      setShowAdd(false)
      setRefreshTick(t => t + 1)
    } catch (e) {
      alert(e.response?.data?.error || e.message)
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (lotId) => {
    if (!confirm('Bu işlemi silmek istediğinize emin misiniz?')) return
    try {
      await api.delete(`/portfolio/${lotId}`)
      setRefreshTick(t => t + 1)
    } catch (e) {
      alert(e.response?.data?.error || e.message)
    }
  }

  const handleEdit = (lot) => {
    setEditingLot(lot)
    setFormSymbol(lot.symbol)
    setFormQty(lot.quantity)
    setFormPrice(lot.buyPrice)
    setFormDate(lot.buyDate)
    setFormType(lot.type)
    setFormNote(lot.note || '')
    setShowAdd(true)
  }

  const toggleExpand = (sym) => {
    setExpandedSym(prev => {
      const next = new Set(prev)
      next.has(sym) ? next.delete(sym) : next.add(sym)
      return next
    })
  }

  // Filtreleme
  const positions = useMemo(() => {
    if (!data?.positions) return []
    const q = filter.trim().toUpperCase()
    if (!q) return data.positions
    return data.positions.filter(p => p.symbol.includes(q))
  }, [data, filter])

  const summary = data?.summary || { totalInvested: 0, totalCurrent: 0, totalProfit: 0, totalProfitPercent: 0 }
  const isProfitable = summary.totalProfit >= 0

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="rounded-2xl border border-amber-500/20 bg-gradient-to-br from-amber-500/[0.06] via-dark-900/60 to-dark-900/30 p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center shadow-lg shadow-amber-500/30 flex-shrink-0">
              <Briefcase className="w-5 h-5 text-dark-950" />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">Portföyüm</h1>
              <p className="text-xs sm:text-sm text-gray-400">Lot bazlı takip · canlı kar/zarar · 60sn auto-refresh</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setRefreshTick(t => t + 1)}
              className="p-2 bg-dark-800 hover:bg-dark-700 rounded-xl text-gray-300"
              title="Yenile"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={() => { resetForm(); setShowAdd(true) }}
              className="flex items-center gap-2 px-3 py-2 bg-amber-500 hover:bg-amber-600 text-dark-950 font-bold rounded-xl text-sm shadow-lg shadow-amber-500/25"
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">İşlem Ekle</span>
            </button>
          </div>
        </div>
      </div>

      {/* Toplam Özet */}
      <div className={`rounded-2xl border p-4 sm:p-5 ${
        isProfitable
          ? 'border-emerald-500/30 bg-gradient-to-br from-emerald-500/[0.08] via-dark-900/60 to-dark-900/30'
          : 'border-red-500/30 bg-gradient-to-br from-red-500/[0.08] via-dark-900/60 to-dark-900/30'
      }`}>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">Toplam Maliyet</div>
            <div className="text-base sm:text-xl font-bold text-white font-mono">{fmtTL(summary.totalInvested)}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">Güncel Değer</div>
            <div className="text-base sm:text-xl font-bold text-white font-mono">{fmtTL(summary.totalCurrent)}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">Kar / Zarar</div>
            <div className={`text-base sm:text-xl font-bold font-mono ${isProfitable ? 'text-emerald-400' : 'text-red-400'}`}>
              {summary.totalProfit >= 0 ? '+' : ''}{fmtTL(summary.totalProfit)}
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">Getiri %</div>
            <div className={`text-base sm:text-xl font-bold font-mono ${isProfitable ? 'text-emerald-400' : 'text-red-400'}`}>
              {fmtPct(summary.totalProfitPercent)}
            </div>
          </div>
        </div>
      </div>

      {/* Hata */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 text-sm text-red-400 flex items-center gap-2">
          <AlertCircle className="w-4 h-4" /> {error}
        </div>
      )}

      {/* Filtre */}
      {positions.length > 0 && (
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Sembol ara (örn. THYAO)"
            value={filter}
            onChange={e => setFilter(e.target.value)}
            className="flex-1 px-3 py-2 bg-dark-900 border border-dark-700 rounded-xl text-sm text-white placeholder-gray-600 focus:outline-none focus:border-amber-500/50"
          />
        </div>
      )}

      {/* Pozisyonlar */}
      <div className="space-y-2">
        {loading && (
          <div className="text-center py-8">
            <RefreshCw className="w-6 h-6 text-amber-400 animate-spin mx-auto mb-2" />
            <span className="text-sm text-gray-400">Yükleniyor...</span>
          </div>
        )}

        {!loading && positions.length === 0 && !error && (
          <div className="bg-dark-900/60 border border-dashed border-dark-700 rounded-2xl p-8 text-center">
            <Briefcase className="w-10 h-10 text-gray-600 mx-auto mb-3" />
            <h3 className="text-base font-semibold text-white mb-1">Henüz işlem eklemediniz</h3>
            <p className="text-xs text-gray-500 mb-4">
              "İşlem Ekle" butonu ile alım/satım kaydedip otomatik kar/zarar takibi yapabilirsiniz.
            </p>
            <button
              onClick={() => { resetForm(); setShowAdd(true) }}
              className="inline-flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-dark-950 font-bold rounded-xl text-sm"
            >
              <Plus className="w-4 h-4" /> İlk İşlemi Ekle
            </button>
          </div>
        )}

        {!loading && positions.map(p => {
          const expanded = expandedSym.has(p.symbol)
          const profit = p.profit >= 0
          return (
            <div
              key={p.symbol}
              className="bg-dark-900/60 border border-dark-700 hover:border-amber-500/30 rounded-2xl overflow-hidden transition-colors"
            >
              {/* Position summary row */}
              <button
                onClick={() => toggleExpand(p.symbol)}
                className="w-full px-3 sm:px-4 py-3 flex items-center justify-between gap-3 hover:bg-dark-800/40 transition-colors text-left"
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center text-[10px] font-bold tracking-wider flex-shrink-0
                    ${profit ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'}`}>
                    {p.symbol.slice(0, 4)}
                  </div>
                  <div className="min-w-0">
                    <div className="font-semibold text-white text-sm sm:text-base">{p.symbol}</div>
                    <div className="text-[11px] text-gray-500">
                      {fmt(p.quantity, p.quantity < 1 ? 4 : 0)} adet · Ort. {fmt(p.avgCost)} ₺
                    </div>
                  </div>
                </div>

                <div className="text-right flex-shrink-0">
                  <div className="text-sm sm:text-base font-bold text-white font-mono">{fmtTL(p.currentValue)}</div>
                  <div className={`text-xs font-semibold ${profit ? 'text-emerald-400' : 'text-red-400'}`}>
                    {p.profit >= 0 ? '+' : ''}{fmt(p.profit, 0)} ₺ ({fmtPct(p.profitPercent)})
                  </div>
                </div>

                {expanded ? <ChevronDown className="w-4 h-4 text-gray-500 flex-shrink-0" /> : <ChevronRight className="w-4 h-4 text-gray-500 flex-shrink-0" />}
              </button>

              {/* Expanded details */}
              {expanded && (
                <div className="border-t border-dark-700 px-3 sm:px-4 py-3 bg-dark-900/40 space-y-3">
                  {/* Performans grid */}
                  <div className="grid grid-cols-3 gap-2">
                    <Mini label="Anlık Fiyat" value={fmtTL(p.currentPrice)} />
                    <Mini label="Günlük %"   value={fmtPct(p.dayChangePercent)} color={p.dayChangePercent >= 0 ? 'emerald' : 'red'} />
                    <Mini label="Maliyet"    value={fmtTL(p.investedValue)} />
                  </div>

                  {/* Lot listesi */}
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-2 px-1">İşlem Geçmişi ({p.lots.length})</div>
                    <div className="space-y-1.5">
                      {p.lots.map(lot => (
                        <div
                          key={lot.id}
                          className={`flex items-center justify-between gap-2 p-2 rounded-lg text-xs
                            ${lot.type === 'buy' ? 'bg-emerald-500/[0.05] border border-emerald-500/15' : 'bg-red-500/[0.05] border border-red-500/15'}`}
                        >
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            <div className={`px-1.5 py-0.5 rounded font-bold text-[9px] tracking-wider
                              ${lot.type === 'buy' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
                              {lot.type === 'buy' ? 'ALIM' : 'SATIM'}
                            </div>
                            <div className="min-w-0">
                              <div className="text-white font-medium">
                                {fmt(lot.quantity, lot.quantity < 1 ? 4 : 0)} × {fmt(lot.buyPrice)} ₺
                              </div>
                              <div className="text-[10px] text-gray-500">
                                {lot.buyDate}
                                {lot.note && <span className="ml-1.5">· {lot.note}</span>}
                              </div>
                            </div>
                          </div>
                          <div className="flex gap-1 flex-shrink-0">
                            <button
                              onClick={() => handleEdit(lot)}
                              className="p-1.5 hover:bg-dark-700 rounded-lg text-gray-400 hover:text-amber-400"
                              title="Düzenle"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleDelete(lot.id)}
                              className="p-1.5 hover:bg-red-500/20 rounded-lg text-gray-400 hover:text-red-400"
                              title="Sil"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Hızlı al/sat butonları */}
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        resetForm()
                        setFormSymbol(p.symbol)
                        setFormType('buy')
                        setFormPrice(p.currentPrice?.toString() || '')
                        setShowAdd(true)
                      }}
                      className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 rounded-lg text-xs font-semibold"
                    >
                      <ShoppingCart className="w-3.5 h-3.5" /> Alım Ekle
                    </button>
                    <button
                      onClick={() => {
                        resetForm()
                        setFormSymbol(p.symbol)
                        setFormType('sell')
                        setFormPrice(p.currentPrice?.toString() || '')
                        setShowAdd(true)
                      }}
                      className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-400 rounded-lg text-xs font-semibold"
                    >
                      <Receipt className="w-3.5 h-3.5" /> Satım Ekle
                    </button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* İşlem Ekleme Modal */}
      {showAdd && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-3 bg-black/70 backdrop-blur-sm"
          onClick={() => setShowAdd(false)}
        >
          <form
            onSubmit={handleAdd}
            onClick={e => e.stopPropagation()}
            className="w-full max-w-md bg-dark-900 border border-amber-500/30 rounded-2xl p-4 sm:p-5 shadow-2xl"
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-white">
                {editingLot ? 'İşlem Düzenle' : 'Yeni İşlem'}
              </h2>
              <button
                type="button"
                onClick={() => setShowAdd(false)}
                className="p-1.5 hover:bg-dark-800 rounded-lg text-gray-400"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Tip seçici */}
            <div className="grid grid-cols-2 gap-1 mb-3 bg-dark-800 p-1 rounded-xl">
              <button
                type="button"
                onClick={() => setFormType('buy')}
                className={`py-2 rounded-lg text-sm font-bold transition-colors ${
                  formType === 'buy' ? 'bg-emerald-500 text-dark-950' : 'text-gray-400'
                }`}
              >
                ALIM
              </button>
              <button
                type="button"
                onClick={() => setFormType('sell')}
                className={`py-2 rounded-lg text-sm font-bold transition-colors ${
                  formType === 'sell' ? 'bg-red-500 text-white' : 'text-gray-400'
                }`}
              >
                SATIM
              </button>
            </div>

            <div className="space-y-3">
              {/* Sembol */}
              <FormField label="Hisse Sembolü" icon={Hash}>
                <input
                  type="text"
                  required
                  disabled={!!editingLot}
                  value={formSymbol}
                  onChange={e => setFormSymbol(e.target.value.toUpperCase())}
                  placeholder="THYAO, AKBNK, ASELS..."
                  className="w-full bg-transparent border-none outline-none text-white placeholder-gray-600 disabled:opacity-50"
                />
              </FormField>

              {/* Adet */}
              <FormField label="Adet" icon={Hash}>
                <input
                  type="number"
                  required
                  step="any"
                  min="0"
                  value={formQty}
                  onChange={e => setFormQty(e.target.value)}
                  placeholder="Örn: 100"
                  className="w-full bg-transparent border-none outline-none text-white placeholder-gray-600"
                />
              </FormField>

              {/* Fiyat */}
              <FormField label={formType === 'buy' ? 'Alım Fiyatı (₺)' : 'Satım Fiyatı (₺)'} icon={DollarSign}>
                <input
                  type="number"
                  required
                  step="any"
                  min="0"
                  value={formPrice}
                  onChange={e => setFormPrice(e.target.value)}
                  placeholder="Örn: 250.50"
                  className="w-full bg-transparent border-none outline-none text-white placeholder-gray-600"
                />
              </FormField>

              {/* Tarih */}
              <FormField label="İşlem Tarihi" icon={Calendar}>
                <input
                  type="date"
                  required
                  value={formDate}
                  onChange={e => setFormDate(e.target.value)}
                  className="w-full bg-transparent border-none outline-none text-white"
                />
              </FormField>

              {/* Not */}
              <FormField label="Not (opsiyonel)" icon={FileText}>
                <input
                  type="text"
                  value={formNote}
                  onChange={e => setFormNote(e.target.value)}
                  maxLength={100}
                  placeholder="Örn: TL eshare alım"
                  className="w-full bg-transparent border-none outline-none text-white placeholder-gray-600"
                />
              </FormField>

              {/* Toplam Tutar Önizleme */}
              {formQty && formPrice && (
                <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3">
                  <div className="text-[10px] uppercase tracking-wider text-amber-400 mb-1">Toplam Tutar</div>
                  <div className="text-lg font-bold text-white font-mono">
                    {fmtTL((parseFloat(formQty) || 0) * (parseFloat(formPrice) || 0))}
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-2 mt-4">
              <button
                type="button"
                onClick={() => setShowAdd(false)}
                className="flex-1 py-2.5 bg-dark-800 hover:bg-dark-700 text-gray-300 rounded-xl text-sm font-semibold"
              >
                İptal
              </button>
              <button
                type="submit"
                disabled={submitting || !formSymbol || !formQty || !formPrice}
                className="flex-1 py-2.5 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-dark-950 font-bold rounded-xl text-sm flex items-center justify-center gap-2"
              >
                {submitting ? <RefreshCw className="w-4 h-4 animate-spin" /> : (editingLot ? 'Güncelle' : 'Kaydet')}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="text-xs text-gray-600 text-center pt-2 pb-4">
        Pozisyonlar Yahoo Finance canlı fiyatları ile hesaplanır · Eğitim amaçlıdır
      </div>
    </div>
  )
}

function FormField({ label, icon: Icon, children }) {
  return (
    <label className="block">
      <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1 font-semibold">{label}</div>
      <div className="flex items-center gap-2 px-3 py-2 bg-dark-800 border border-dark-700 rounded-xl focus-within:border-amber-500/50 transition-colors">
        <Icon className="w-4 h-4 text-gray-500 flex-shrink-0" />
        {children}
      </div>
    </label>
  )
}

function Mini({ label, value, color = 'gray' }) {
  const colorClass = color === 'emerald' ? 'text-emerald-400'
                   : color === 'red'     ? 'text-red-400'
                   : 'text-white'
  return (
    <div className="bg-dark-800 rounded-lg px-2.5 py-2">
      <div className="text-[9px] uppercase tracking-wider text-gray-500">{label}</div>
      <div className={`text-xs sm:text-sm font-bold font-mono ${colorClass}`}>{value}</div>
    </div>
  )
}
