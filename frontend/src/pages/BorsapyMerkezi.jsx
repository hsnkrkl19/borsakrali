import { useState, useEffect, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  Database, Search, TrendingUp, Building2, Calculator, RefreshCw,
  AlertCircle, ArrowUp, ArrowDown, Landmark, PiggyBank, Percent,
  Layers, Globe, BookOpen, Filter, Star, X, Plus,
} from 'lucide-react'
import api from '../services/api'
import { PageHeader, Card, Button, Badge, Spinner, EmptyState } from '../components/ui'
import ScrollableTabBar from '../components/ScrollableTabBar'

const TABS = [
  { key: 'makro',     label: 'TCMB & Makro',    icon: Landmark   },
  { key: 'tefas',     label: 'TEFAS Fonları',   icon: PiggyBank  },
  { key: 'bankalar',  label: 'Banka Kurları',   icon: Building2  },
  { key: 'enflasyon', label: 'Enflasyon Hesap', icon: Calculator },
  { key: 'viop',      label: 'VIOP Vadeli',     icon: Layers     },
  { key: 'evds',      label: 'EVDS Veri',       icon: BookOpen   },
  { key: 'eurobond',  label: 'Eurobond',        icon: Globe      },
  { key: 'scanner',   label: 'Teknik Scanner',  icon: Filter     },
]

export default function BorsapyMerkezi() {
  const [params, setParams] = useSearchParams()
  const activeTab = TABS.find(t => t.key === params.get('tab'))?.key || 'makro'

  const setTab = (key) => {
    const next = new URLSearchParams(params)
    next.set('tab', key)
    setParams(next, { replace: true })
  }

  return (
    <div className="space-y-5">
      <PageHeader
        icon={Database}
        eyebrow="Veri Merkezi"
        title="Borsapy Veri Merkezi"
        description="TEFAS fonları • TCMB politika faizi • Banka döviz kurları • Enflasyon hesaplayıcı"
      />

      <ScrollableTabBar activeKey={activeTab} wrapperClassName="border-b" >
        <div className="flex gap-1 pb-1">
          {TABS.map(t => {
            const Icon = t.icon
            const active = activeTab === t.key
            return (
              <button
                key={t.key}
                data-tab-key={t.key}
                onClick={() => setTab(t.key)}
                className={`flex items-center gap-1.5 whitespace-nowrap px-3.5 py-2 rounded-lg text-[13px] font-medium transition-all ${
                  active
                    ? 'bg-gold-500/15 text-gold-300 border border-gold-500/40'
                    : 'text-gray-400 hover:text-gold-200 hover:bg-dark-800/60 border border-transparent'
                }`}
              >
                <Icon size={15} />
                {t.label}
              </button>
            )
          })}
        </div>
      </ScrollableTabBar>

      <div>
        {activeTab === 'makro'     && <MakroTab />}
        {activeTab === 'tefas'     && <TefasTab />}
        {activeTab === 'bankalar'  && <BankalarTab />}
        {activeTab === 'enflasyon' && <EnflasyonTab />}
        {activeTab === 'viop'      && <ViopTab />}
        {activeTab === 'evds'      && <EvdsTab />}
        {activeTab === 'eurobond'  && <EurobondTab />}
        {activeTab === 'scanner'   && <ScannerTab />}
      </div>

      <div className="text-[11px] text-gray-500 pt-4 border-t border-dark-800/60">
        Kaynak: TEFAS (tefas.gov.tr) • TCMB (tcmb.gov.tr) • canlidoviz.com • doviz.com.
        Veriler eğitim amaçlıdır; yatırım kararı için kaynak siteleri doğrulayın.
        <br />
        <em>Esin: <a href="https://github.com/saidsurucu/borsapy" target="_blank" rel="noreferrer" className="text-gold-400 hover:underline">github.com/saidsurucu/borsapy</a></em>
      </div>
    </div>
  )
}

// ─── Yardımcı: Stat Kart ─────────────────────────────────────────────
function StatCard({ icon: Icon, label, value, suffix = '', accent = 'gold', sub }) {
  return (
    <Card padding="md">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-[11px] uppercase tracking-wider text-gray-500 font-semibold">{label}</div>
          <div className={`mt-1.5 text-2xl font-bold ${
            accent === 'green' ? 'text-emerald-400' :
            accent === 'red'   ? 'text-red-400' :
            'text-gold-300'
          }`}>
            {value ?? '—'}{value != null ? suffix : ''}
          </div>
          {sub && <div className="mt-1 text-[11px] text-gray-500">{sub}</div>}
        </div>
        {Icon && (
          <div className={`p-2 rounded-lg ${
            accent === 'green' ? 'bg-emerald-500/10' :
            accent === 'red'   ? 'bg-red-500/10' :
            'bg-gold-500/10'
          }`}>
            <Icon size={18} className={
              accent === 'green' ? 'text-emerald-400' :
              accent === 'red'   ? 'text-red-400' :
              'text-gold-400'
            } />
          </div>
        )}
      </div>
    </Card>
  )
}

// ─── Tab 1: TCMB & Makro ─────────────────────────────────────────────
function MakroTab() {
  const [policy, setPolicy] = useState(null)
  const [bonds, setBonds] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const load = async () => {
    setLoading(true); setError(null)
    try {
      const [p, b] = await Promise.all([
        api.get('/borsapy/tcmb/policy-rate').then(r => r.data).catch(() => ({})),
        api.get('/borsapy/bonds/yields').then(r => r.data).catch(() => ({})),
      ])
      setPolicy(p?.rates || null)
      setBonds(b?.yields || null)
    } catch (e) {
      setError('Veri yüklenemedi.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={load} disabled={loading} className="text-xs">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Yenile
        </Button>
      </div>

      {error && (
        <Card padding="md">
          <div className="flex items-center gap-2 text-red-400 text-sm">
            <AlertCircle size={16} /> {error}
          </div>
        </Card>
      )}

      <div>
        <div className="text-[11px] uppercase tracking-wider text-gray-500 font-semibold mb-2">TCMB Faiz Oranları</div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <StatCard
            icon={Percent}
            label="Politika Faizi (1H Repo)"
            value={policy?.policyRate}
            suffix="%"
            accent="gold"
            sub={policy?.asOfDate ? `Karar: ${policy.asOfDate}${policy.nextMeeting ? ` · Sonraki: ${policy.nextMeeting}` : ''}` : null}
          />
          <StatCard
            icon={ArrowUp}
            label="Gecelik Borç Verme"
            value={policy?.overnightLending}
            suffix="%"
            accent="red"
          />
          <StatCard
            icon={ArrowDown}
            label="Gecelik Borç Alma"
            value={policy?.overnightBorrowing}
            suffix="%"
            accent="green"
          />
        </div>
      </div>

      <div>
        <div className="text-[11px] uppercase tracking-wider text-gray-500 font-semibold mb-2">Devlet Tahvili Faizleri</div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <StatCard icon={TrendingUp} label="2 Yıllık"  value={bonds?.['2Y']}  suffix="%" />
          <StatCard icon={TrendingUp} label="5 Yıllık"  value={bonds?.['5Y']}  suffix="%" />
          <StatCard icon={TrendingUp} label="10 Yıllık" value={bonds?.['10Y']} suffix="%" sub="DCF risksiz oran" />
        </div>
        {bonds?.riskFreeRate != null && (
          <div className="mt-3 text-[12px] text-gray-400">
            <strong className="text-gold-300">Risksiz oran:</strong> {(bonds.riskFreeRate * 100).toFixed(2)}%
            {' '}— DCF değerleme sayfasında bu değer otomatik kullanılabilir.
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Tab 2: TEFAS Fonları ────────────────────────────────────────────
function TefasTab() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [selected, setSelected] = useState(null)
  const [detail, setDetail] = useState(null)
  const [series, setSeries] = useState([])
  const [period, setPeriod] = useState(12)
  const [searching, setSearching] = useState(false)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [error, setError] = useState(null)

  const search = async (q) => {
    if (!q || q.length < 2) { setResults([]); return }
    setSearching(true); setError(null)
    try {
      const r = await api.get(`/borsapy/tefas/search?q=${encodeURIComponent(q)}`)
      setResults(r.data.funds || [])
    } catch (e) {
      setError('Arama başarısız.'); setResults([])
    } finally {
      setSearching(false)
    }
  }

  useEffect(() => {
    const t = setTimeout(() => search(query), 350)
    return () => clearTimeout(t)
  }, [query])

  const loadDetail = async (code) => {
    setSelected(code); setLoadingDetail(true); setError(null); setDetail(null); setSeries([])
    try {
      const [d, h] = await Promise.all([
        api.get(`/borsapy/tefas/${code}`).then(r => r.data),
        api.get(`/borsapy/tefas/${code}/history?period=${period}`).then(r => r.data).catch(() => ({})),
      ])
      setDetail(d.fund || null)
      setSeries(h.series || [])
    } catch (e) {
      setError('Fon detayı alınamadı.')
    } finally {
      setLoadingDetail(false)
    }
  }

  useEffect(() => {
    if (selected) loadDetail(selected)
    // eslint-disable-next-line
  }, [period])

  const sparkline = useMemo(() => {
    if (!series.length) return null
    const w = 320, h = 60, pad = 4
    const prices = series.map(s => s.price)
    const min = Math.min(...prices), max = Math.max(...prices)
    const rng = (max - min) || 1
    const pts = series.map((p, i) => {
      const x = pad + (i / (series.length - 1)) * (w - 2 * pad)
      const y = h - pad - ((p.price - min) / rng) * (h - 2 * pad)
      return `${x.toFixed(1)},${y.toFixed(1)}`
    }).join(' ')
    const last = prices[prices.length - 1]
    const first = prices[0]
    const ret = first > 0 ? ((last - first) / first) * 100 : 0
    return { pts, w, h, ret, last, first }
  }, [series])

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* Sol: Arama */}
      <Card padding="md">
        <div className="space-y-3">
          <div>
            <label className="text-[11px] uppercase tracking-wider text-gray-500 font-semibold">Fon Ara (kod veya isim)</label>
            <div className="relative mt-1.5">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="örn: AAK, Ak Portföy, Hisse Senedi..."
                className="w-full pl-9 pr-3 py-2 bg-dark-900 border border-dark-700 rounded-lg text-sm focus:border-gold-500 outline-none"
              />
            </div>
          </div>

          {searching && <div className="flex items-center gap-2 text-xs text-gray-400"><Spinner size={12} /> Aranıyor...</div>}
          {error && <div className="text-red-400 text-xs flex items-center gap-1"><AlertCircle size={12} /> {error}</div>}

          <div className="max-h-[480px] overflow-y-auto space-y-1 custom-scrollbar">
            {results.length === 0 && !searching && query.length >= 2 && (
              <EmptyState icon={Search} title="Sonuç yok" description="Farklı bir terim deneyin." />
            )}
            {results.length === 0 && query.length < 2 && (
              <div className="text-xs text-gray-500 italic py-4 text-center">En az 2 karakter girin</div>
            )}
            {results.map(f => (
              <button
                key={f.code}
                onClick={() => loadDetail(f.code)}
                className={`w-full text-left px-3 py-2 rounded-lg border transition-all ${
                  selected === f.code
                    ? 'bg-gold-500/10 border-gold-500/40 text-gold-200'
                    : 'border-dark-800 hover:border-gold-500/30 hover:bg-dark-800/40 text-gray-300'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-mono text-sm font-bold">{f.code}</div>
                    <div className="text-xs text-gray-500 truncate max-w-[280px]">{f.name}</div>
                  </div>
                  {f.type && <Badge tone="neutral">{f.type}</Badge>}
                </div>
              </button>
            ))}
          </div>
        </div>
      </Card>

      {/* Sağ: Detay */}
      <Card padding="md">
        {!selected && (
          <EmptyState
            icon={PiggyBank}
            title="Fon seçilmedi"
            description="Soldan bir fon seçin; detay, fiyat geçmişi ve dönemsel getiriler burada görünecek."
          />
        )}

        {selected && loadingDetail && (
          <div className="flex items-center justify-center py-12"><Spinner /></div>
        )}

        {selected && detail && !loadingDetail && (
          <div className="space-y-3">
            <div className="flex items-start justify-between">
              <div>
                <div className="font-mono text-2xl font-bold text-gold-300">{detail.code}</div>
                <div className="text-sm text-gray-400 mt-0.5">{detail.name}</div>
              </div>
              <div className="flex items-center gap-2">
                <FundWatchlistButton code={detail.code} />
                {detail.type && <Badge tone="gold">{detail.type}</Badge>}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 text-sm">
              {detail.category && <Field label="Kategori" value={detail.category} />}
              {detail.isin && <Field label="ISIN" value={detail.isin} mono />}
              {detail.riskLevel && <Field label="Risk Seviyesi" value={detail.riskLevel} />}
              {detail.managementFee && <Field label="Yönetim Ücreti" value={detail.managementFee} />}
              {detail.price && <Field label="Son Fiyat" value={detail.price} accent="gold" />}
              {detail.date && <Field label="Fiyat Tarihi" value={detail.date} />}
              {detail.portfolioSize && <Field label="Portföy Büyüklüğü" value={detail.portfolioSize} />}
              {detail.investorCount && <Field label="Yatırımcı Sayısı" value={detail.investorCount} />}
            </div>

            {/* Periyod butonları */}
            <div className="flex items-center gap-2 pt-2">
              <span className="text-xs text-gray-500">Dönem:</span>
              {[1, 3, 6, 12, 36, 60].map(p => (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  className={`px-2 py-1 rounded text-xs ${
                    period === p
                      ? 'bg-gold-500/20 text-gold-300 border border-gold-500/40'
                      : 'border border-dark-700 text-gray-400 hover:border-gold-500/30'
                  }`}
                >
                  {p === 1 ? '1A' : p < 12 ? `${p}A` : `${p / 12}Y`}
                </button>
              ))}
            </div>

            {/* Sparkline */}
            {sparkline && (
              <div className="border border-dark-800 rounded-lg p-3 bg-dark-900/40">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-gray-500">Fiyat seyri ({series.length} gün)</span>
                  <span className={`text-sm font-bold ${sparkline.ret >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {sparkline.ret >= 0 ? '+' : ''}{sparkline.ret.toFixed(2)}%
                  </span>
                </div>
                <svg viewBox={`0 0 ${sparkline.w} ${sparkline.h}`} className="w-full h-16">
                  <polyline
                    fill="none"
                    stroke={sparkline.ret >= 0 ? '#34d399' : '#f87171'}
                    strokeWidth="1.5"
                    points={sparkline.pts}
                  />
                </svg>
                <div className="flex items-center justify-between mt-1 text-[11px] text-gray-500">
                  <span>İlk: {sparkline.first.toFixed(4)}</span>
                  <span>Son: {sparkline.last.toFixed(4)}</span>
                </div>
              </div>
            )}
            {selected && !sparkline && series.length === 0 && (
              <div className="text-xs text-gray-500 italic">Fiyat geçmişi alınamadı.</div>
            )}
          </div>
        )}
      </Card>
    </div>
  )
}

function Field({ label, value, mono, accent }) {
  return (
    <div className="border border-dark-800 rounded p-2 bg-dark-900/30">
      <div className="text-[10px] uppercase tracking-wider text-gray-500">{label}</div>
      <div className={`mt-0.5 text-[13px] ${mono ? 'font-mono' : ''} ${accent === 'gold' ? 'text-gold-300 font-bold' : 'text-gray-200'}`}>
        {value}
      </div>
    </div>
  )
}

// ─── Tab 3: Banka Kurları ────────────────────────────────────────────
function BankalarTab() {
  const [currency, setCurrency] = useState('USD')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const load = async () => {
    setLoading(true); setError(null)
    try {
      const r = await api.get(`/borsapy/banks/rates?currency=${currency}`)
      setData(r.data)
    } catch (e) {
      setError('Banka kurları yüklenemedi.'); setData(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [currency])

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-gray-500">Döviz:</span>
        {['USD', 'EUR', 'GBP', 'CHF'].map(c => (
          <button
            key={c}
            onClick={() => setCurrency(c)}
            className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-all ${
              currency === c
                ? 'bg-gold-500/20 text-gold-300 border border-gold-500/50'
                : 'border border-dark-700 text-gray-400 hover:border-gold-500/30'
            }`}
          >
            {c}
          </button>
        ))}
        <div className="flex-1" />
        <Button onClick={load} disabled={loading} className="text-xs">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Yenile
        </Button>
      </div>

      {error && (
        <Card padding="md">
          <div className="flex items-center gap-2 text-red-400 text-sm">
            <AlertCircle size={16} /> {error}
          </div>
        </Card>
      )}

      {loading && <div className="flex justify-center py-8"><Spinner /></div>}

      {data && data.banks?.length > 0 && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {data.bestForBuying && (
              <Card padding="md" tone="jade" accent>
                <div className="text-[11px] uppercase tracking-wider text-emerald-300 font-semibold">
                  {data.currency} ALMAK İÇİN
                </div>
                <div className="mt-1 text-xl font-bold text-emerald-300">{data.bestForBuying.sell.toFixed(4)} TL</div>
                <div className="text-xs text-gray-400 mt-0.5">{data.bestForBuying.name} (en düşük satış)</div>
              </Card>
            )}
            {data.bestForSelling && (
              <Card padding="md" tone="gold" accent>
                <div className="text-[11px] uppercase tracking-wider text-gold-300 font-semibold">
                  {data.currency} SATMAK İÇİN
                </div>
                <div className="mt-1 text-xl font-bold text-gold-300">{data.bestForSelling.buy.toFixed(4)} TL</div>
                <div className="text-xs text-gray-400 mt-0.5">{data.bestForSelling.name} (en yüksek alış)</div>
              </Card>
            )}
            {data.lowestSpread && (
              <Card padding="md">
                <div className="text-[11px] uppercase tracking-wider text-gray-400 font-semibold">EN DÜŞÜK SPREAD</div>
                <div className="mt-1 text-xl font-bold text-gray-200">{data.lowestSpread.spreadPct.toFixed(3)}%</div>
                <div className="text-xs text-gray-500 mt-0.5">{data.lowestSpread.name}</div>
              </Card>
            )}
          </div>

          <Card padding="none">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[11px] uppercase tracking-wider text-gray-500 border-b border-dark-800">
                    <th className="text-left p-3">Banka</th>
                    <th className="text-right p-3">Alış</th>
                    <th className="text-right p-3">Satış</th>
                    <th className="text-right p-3">Spread</th>
                    <th className="text-right p-3">Spread %</th>
                  </tr>
                </thead>
                <tbody>
                  {data.banks.map((b, i) => (
                    <tr key={b.slug} className={`border-b border-dark-800/60 hover:bg-dark-800/30 ${i === 0 ? 'bg-emerald-500/5' : ''}`}>
                      <td className="p-3 text-gray-200">
                        {i === 0 && <span className="text-emerald-400 mr-1">★</span>}
                        {b.name}
                      </td>
                      <td className="p-3 text-right font-mono">{b.buy.toFixed(4)}</td>
                      <td className="p-3 text-right font-mono">{b.sell.toFixed(4)}</td>
                      <td className="p-3 text-right font-mono text-gray-400">{b.spread.toFixed(4)}</td>
                      <td className={`p-3 text-right font-mono font-semibold ${i === 0 ? 'text-emerald-400' : 'text-gray-300'}`}>
                        {b.spreadPct.toFixed(3)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}

      {data && data.banks?.length === 0 && !loading && (
        <EmptyState icon={Building2} title="Banka kuru bulunamadı" description="Kaynak yanıt vermedi. Az sonra tekrar deneyin." />
      )}
    </div>
  )
}

// ─── Tab 4: Enflasyon Hesaplayıcı ────────────────────────────────────
function EnflasyonTab() {
  const now = new Date()
  const [amount, setAmount] = useState(10000)
  const [fromYear, setFromYear] = useState(2020)
  const [fromMonth, setFromMonth] = useState(1)
  const [toYear, setToYear] = useState(now.getFullYear())
  const [toMonth, setToMonth] = useState(Math.max(1, now.getMonth())) // önceki ay
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const calc = async () => {
    setLoading(true); setError(null); setResult(null)
    try {
      const r = await api.get('/borsapy/inflation/calculate', {
        params: { amount, fromYear, fromMonth, toYear, toMonth },
      })
      setResult(r.data.result)
    } catch (e) {
      setError(e.response?.data?.error || 'Hesaplama başarısız.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <Card padding="md">
        <div className="text-[11px] uppercase tracking-wider text-gray-500 font-semibold mb-3">Giriş</div>
        <div className="space-y-3">
          <NumberRow label="Tutar (TL)" value={amount} onChange={setAmount} min={1} step={100} />
          <div className="grid grid-cols-2 gap-2">
            <NumberRow label="Başlangıç Yılı" value={fromYear} onChange={setFromYear} min={2003} max={now.getFullYear()} />
            <NumberRow label="Başlangıç Ayı"  value={fromMonth} onChange={setFromMonth} min={1} max={12} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <NumberRow label="Bitiş Yılı" value={toYear} onChange={setToYear} min={2003} max={now.getFullYear()} />
            <NumberRow label="Bitiş Ayı"  value={toMonth} onChange={setToMonth} min={1} max={12} />
          </div>
          <Button onClick={calc} disabled={loading} className="w-full justify-center">
            {loading ? <Spinner size={12} /> : <Calculator size={14} />}
            Enflasyonu Hesapla
          </Button>
          {error && (
            <div className="text-red-400 text-xs flex items-center gap-1">
              <AlertCircle size={12} /> {error}
            </div>
          )}
        </div>
        <div className="mt-4 text-[11px] text-gray-500 italic">
          TÜFE bazlı resmi TCMB enflasyon hesaplayıcısı. Belirtilen tarih aralığında belirttiğiniz tutarın satın alma gücüne göre güncel değerini hesaplar.
        </div>
      </Card>

      <Card padding="md">
        <div className="text-[11px] uppercase tracking-wider text-gray-500 font-semibold mb-3">Sonuç</div>
        {!result && <EmptyState icon={Calculator} title="Hesaplama bekliyor" description="Soldaki formu doldurup hesaplayın." />}
        {result && (
          <div className="space-y-3">
            <div className="grid grid-cols-1 gap-2">
              <Card padding="sm" tone="neutral">
                <div className="text-[11px] uppercase text-gray-500">Başlangıç tutarı</div>
                <div className="text-2xl font-bold text-gray-300 mt-1">
                  {Number(result.initialValue).toLocaleString('tr-TR')} TL
                </div>
                <div className="text-[11px] text-gray-500 mt-0.5">
                  {String(result.fromMonth).padStart(2, '0')}/{result.fromYear}
                </div>
              </Card>
              <Card padding="sm" tone="gold" accent>
                <div className="text-[11px] uppercase text-gold-300">Bugünkü değer</div>
                <div className="text-3xl font-bold text-gold-300 mt-1">
                  {Number(result.finalValue).toLocaleString('tr-TR', { maximumFractionDigits: 2 })} TL
                </div>
                <div className="text-[11px] text-gray-500 mt-0.5">
                  {String(result.toMonth).padStart(2, '0')}/{result.toYear}
                </div>
              </Card>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Card padding="sm">
                <div className="text-[11px] uppercase text-gray-500">Toplam değişim</div>
                <div className={`text-xl font-bold mt-1 ${result.totalChangePct >= 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                  {result.totalChangePct >= 0 ? '+' : ''}{Number(result.totalChangePct).toFixed(2)}%
                </div>
              </Card>
              <Card padding="sm">
                <div className="text-[11px] uppercase text-gray-500">Yıllık ortalama</div>
                <div className="text-xl font-bold text-gray-200 mt-1">
                  {result.avgYearlyPct != null ? `${Number(result.avgYearlyPct).toFixed(2)}%` : '—'}
                </div>
              </Card>
            </div>
          </div>
        )}
      </Card>
    </div>
  )
}

function NumberRow({ label, value, onChange, min, max, step = 1 }) {
  return (
    <div>
      <label className="text-[11px] uppercase tracking-wider text-gray-500 font-semibold">{label}</label>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1.5 w-full px-3 py-2 bg-dark-900 border border-dark-700 rounded-lg text-sm focus:border-gold-500 outline-none"
      />
    </div>
  )
}

// ─── Fund Watchlist Buton ────────────────────────────────────────────
function FundWatchlistButton({ code }) {
  const [inList, setInList] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    api.get('/borsapy/funds/watchlist')
      .then(r => setInList((r.data?.codes || []).includes(code)))
      .catch(() => {})
  }, [code])

  const toggle = async () => {
    setBusy(true)
    try {
      if (inList) {
        await api.delete(`/borsapy/funds/watchlist/${code}`)
        setInList(false)
      } else {
        await api.post('/borsapy/funds/watchlist', { code })
        setInList(true)
      }
    } catch (e) {
      // sessizce yut
    } finally {
      setBusy(false)
    }
  }

  return (
    <button
      onClick={toggle}
      disabled={busy}
      title={inList ? 'Takip listesinden çıkar' : 'Takip listesine ekle'}
      className={`p-1.5 rounded-lg border transition-all ${
        inList
          ? 'bg-gold-500/20 border-gold-500/50 text-gold-300'
          : 'border-dark-700 text-gray-400 hover:border-gold-500/40 hover:text-gold-300'
      }`}
    >
      <Star size={14} className={inList ? 'fill-current' : ''} />
    </button>
  )
}

// ─── Tab 5: VIOP Vadeli İşlemler ─────────────────────────────────────
const VIOP_CATEGORIES = [
  { key: 'index_futures',     label: 'Endeks Vadeli'   },
  { key: 'stock_futures',     label: 'Pay Vadeli'      },
  { key: 'currency_futures',  label: 'Döviz Vadeli'    },
  { key: 'commodity_futures', label: 'Emtia Vadeli'    },
  { key: 'index_options',     label: 'Endeks Opsiyon'  },
  { key: 'stock_options',     label: 'Pay Opsiyon'     },
]

function ViopTab() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [category, setCategory] = useState('index_futures')
  const [query, setQuery] = useState('')

  const load = async () => {
    setLoading(true); setError(null)
    try {
      const r = await api.get('/borsapy/viop')
      setData(r.data.viop)
    } catch (e) {
      setError('VIOP verisi alınamadı.')
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { load() }, [])

  const contracts = useMemo(() => {
    const list = (data?.[category] || [])
    if (!query) return list
    const q = query.toUpperCase()
    return list.filter(c => (c.code || '').toUpperCase().includes(q) || (c.name || '').toUpperCase().includes(q))
  }, [data, category, query])

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="text-[11px] text-gray-500">
          Kaynak: İş Yatırım VİOP · 15dk gecikmeli
          {data?.timestamp && <> · Güncellendi: {new Date(data.timestamp).toLocaleTimeString('tr-TR')}</>}
        </div>
        <Button onClick={load} disabled={loading} className="text-xs">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Yenile
        </Button>
      </div>

      <ScrollableTabBar activeKey={category}>
        <div className="flex gap-1 pb-1">
          {VIOP_CATEGORIES.map(c => (
            <button
              key={c.key}
              data-tab-key={c.key}
              onClick={() => setCategory(c.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
                category === c.key
                  ? 'bg-gold-500/15 text-gold-300 border border-gold-500/40'
                  : 'text-gray-400 hover:text-gold-200 hover:bg-dark-800/60 border border-transparent'
              }`}
            >
              {c.label}
              <span className="ml-1 text-[10px] text-gray-500">({data?.[c.key]?.length || 0})</span>
            </button>
          ))}
        </div>
      </ScrollableTabBar>

      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Sözleşme ara (örn: XU030, AKBNK, USDTRY)..."
          className="w-full pl-9 pr-3 py-2 bg-dark-900 border border-dark-700 rounded-lg text-sm focus:border-gold-500 outline-none"
        />
      </div>

      {error && (
        <Card padding="md">
          <div className="flex items-center gap-2 text-red-400 text-sm">
            <AlertCircle size={16} /> {error}
          </div>
        </Card>
      )}

      {loading && <div className="flex justify-center py-8"><Spinner /></div>}

      {!loading && contracts.length === 0 && (
        <EmptyState icon={Layers} title="Sözleşme bulunamadı" description="Farklı kategori veya arama deneyin." />
      )}

      {contracts.length > 0 && (
        <Card padding="none">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] uppercase tracking-wider text-gray-500 border-b border-dark-800">
                  <th className="text-left p-3">Kod</th>
                  <th className="text-left p-3">Sözleşme</th>
                  <th className="text-right p-3">Fiyat</th>
                  <th className="text-right p-3">Değişim</th>
                  <th className="text-right p-3">Değ %</th>
                  <th className="text-right p-3">Hacim (TL)</th>
                  <th className="text-right p-3">Adet</th>
                </tr>
              </thead>
              <tbody>
                {contracts.slice(0, 200).map((c) => (
                  <tr key={c.code} className="border-b border-dark-800/60 hover:bg-dark-800/30">
                    <td className="p-3 font-mono text-xs text-gold-300">{c.code}</td>
                    <td className="p-3 text-gray-300 text-xs">{c.name}</td>
                    <td className="p-3 text-right font-mono">{c.price?.toLocaleString('tr-TR') ?? '—'}</td>
                    <td className={`p-3 text-right font-mono ${c.change > 0 ? 'text-emerald-400' : c.change < 0 ? 'text-red-400' : 'text-gray-400'}`}>
                      {c.change != null ? (c.change > 0 ? '+' : '') + c.change.toFixed(4) : '—'}
                    </td>
                    <td className={`p-3 text-right font-mono font-semibold ${c.changePct > 0 ? 'text-emerald-400' : c.changePct < 0 ? 'text-red-400' : 'text-gray-400'}`}>
                      {c.changePct != null ? (c.changePct > 0 ? '+' : '') + c.changePct.toFixed(2) + '%' : '—'}
                    </td>
                    <td className="p-3 text-right text-xs text-gray-400">{c.volumeTl?.toLocaleString('tr-TR') ?? '—'}</td>
                    <td className="p-3 text-right text-xs text-gray-500">{c.volumeQty?.toLocaleString('tr-TR') ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  )
}

// ─── Tab 6: EVDS (TCMB Makro Veri) ───────────────────────────────────
function EvdsTab() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState(null)

  const search = async (q) => {
    if (!q || q.length < 2) { setResults([]); return }
    setSearching(true); setError(null)
    try {
      const r = await api.get(`/borsapy/evds/search?q=${encodeURIComponent(q)}`)
      const payload = r.data?.data
      // searchResults yanıtı çeşitli şekiller dönebilir; en yaygın: { veriler: [...], veriGruplari: [...] }
      const series = Array.isArray(payload?.veriler) ? payload.veriler : []
      const groups = Array.isArray(payload?.veriGruplari) ? payload.veriGruplari : []
      setResults([
        ...groups.slice(0, 20).map(g => ({ type: 'group', code: g.dataGroupCode, title: g.dataGroupType, freq: g.frequencyStr })),
        ...series.slice(0, 30).map(s => ({ type: 'series', code: s.serieCode || s.code, title: s.serieName || s.title, freq: s.frequencyStr })),
      ])
    } catch (e) {
      setError('Arama başarısız.')
    } finally {
      setSearching(false)
    }
  }

  useEffect(() => {
    const t = setTimeout(() => search(query), 400)
    return () => clearTimeout(t)
  }, [query])

  return (
    <div className="space-y-3">
      <Card padding="md">
        <div className="text-[11px] uppercase tracking-wider text-gray-500 font-semibold mb-1">TCMB EVDS Veri Bankası</div>
        <p className="text-xs text-gray-400">
          TCMB'nin Elektronik Veri Dağıtım Sistemi'nde binlerce makro seri var: enflasyon, döviz kurları, para arzı,
          ödemeler dengesi, beklenti anketleri. Aşağıdan arama yapın — seri/veri grubu kodunu öğrenip detayını analiz edin.
        </p>
        <p className="text-[11px] text-gray-500 mt-2">
          <strong>Not:</strong> Seri değer indirimi için TCMB'den ücretsiz <code className="text-gold-400">EVDS_KEY</code> alıp env değişkenine eklemek gerekir. Katalog araması key gerektirmez.
        </p>
      </Card>

      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="EVDS'de ara: 'TÜFE', 'USD', 'politika faizi', 'M2'..."
          className="w-full pl-9 pr-3 py-2 bg-dark-900 border border-dark-700 rounded-lg text-sm focus:border-gold-500 outline-none"
        />
      </div>

      {searching && <div className="flex justify-center py-4"><Spinner /></div>}
      {error && (
        <Card padding="md">
          <div className="text-red-400 text-sm flex items-center gap-2"><AlertCircle size={14} /> {error}</div>
        </Card>
      )}

      {results.length > 0 && (
        <Card padding="none">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] uppercase tracking-wider text-gray-500 border-b border-dark-800">
                  <th className="text-left p-3">Tip</th>
                  <th className="text-left p-3">Kod</th>
                  <th className="text-left p-3">Başlık</th>
                  <th className="text-right p-3">Frekans</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r, i) => (
                  <tr key={`${r.code}-${i}`} className="border-b border-dark-800/60 hover:bg-dark-800/30">
                    <td className="p-3">
                      <Badge tone={r.type === 'group' ? 'gold' : 'neutral'}>
                        {r.type === 'group' ? 'Grup' : 'Seri'}
                      </Badge>
                    </td>
                    <td className="p-3 font-mono text-xs text-gold-300">{r.code}</td>
                    <td className="p-3 text-gray-300 text-xs">{r.title}</td>
                    <td className="p-3 text-right text-xs text-gray-500">{r.freq || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {!searching && results.length === 0 && query.length >= 2 && (
        <EmptyState icon={BookOpen} title="Sonuç yok" description="Farklı bir terim deneyin." />
      )}
    </div>
  )
}

// ─── Tab 7: Eurobond ─────────────────────────────────────────────────
function EurobondTab() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const load = async () => {
    setLoading(true); setError(null)
    try {
      const r = await api.get('/borsapy/eurobond/yields')
      setData(r.data.data)
    } catch (e) {
      setError('Eurobond verisi alınamadı.')
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { load() }, [])

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={load} disabled={loading} className="text-xs">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Yenile
        </Button>
      </div>

      {error && (
        <Card padding="md">
          <div className="text-red-400 text-sm flex items-center gap-2"><AlertCircle size={14} /> {error}</div>
        </Card>
      )}

      {loading && <div className="flex justify-center py-8"><Spinner /></div>}

      {data && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {(data.indicators || []).map((ind) => (
              <StatCard
                key={ind.ticker}
                icon={Globe}
                label={ind.label}
                value={ind.price != null ? ind.price.toFixed(3) : null}
                suffix={ind.ticker.startsWith('^') ? '%' : ` ${ind.currency || 'USD'}`}
                accent={ind.changePct > 0 ? 'green' : ind.changePct < 0 ? 'red' : 'gold'}
                sub={ind.changePct != null ? `${ind.changePct > 0 ? '+' : ''}${ind.changePct.toFixed(2)}% · ${ind.ticker}` : ind.ticker}
              />
            ))}
          </div>

          {data.note && (
            <Card padding="md">
              <div className="text-xs text-gray-400 italic">
                <strong className="text-gold-300">Bilgi:</strong> {data.note}
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  )
}

// ─── Tab 8: Teknik Scanner ───────────────────────────────────────────
function ScannerTab() {
  const [universe, setUniverse] = useState('bist30')
  const [preset, setPreset] = useState('custom')
  const [criteria, setCriteria] = useState({
    rsiBelow: null, rsiAbove: null,
    priceAboveSma: null, priceBelowSma: null,
    changeMin: null, changeMax: null,
    smaCross: null,
  })
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const PRESETS = {
    custom:        { label: 'Özel', crit: {} },
    oversold:      { label: 'Aşırı Satım (RSI<30)', crit: { rsiBelow: 30 } },
    overbought:    { label: 'Aşırı Alım (RSI>70)',   crit: { rsiAbove: 70 } },
    above_sma50:   { label: 'Fiyat SMA50 Üstünde',   crit: { priceAboveSma: 50 } },
    golden_cross:  { label: 'Golden Cross (SMA20>50)', crit: { smaCross: 'golden' } },
    death_cross:   { label: 'Death Cross (SMA20<50)',  crit: { smaCross: 'death' } },
    big_gainers:   { label: 'Büyük Yükseliş (+5%)',   crit: { changeMin: 5 } },
    big_losers:    { label: 'Büyük Düşüş (-5%)',      crit: { changeMax: -5 } },
  }

  const applyPreset = (key) => {
    setPreset(key)
    const c = PRESETS[key].crit
    setCriteria({
      rsiBelow: c.rsiBelow ?? null,
      rsiAbove: c.rsiAbove ?? null,
      priceAboveSma: c.priceAboveSma ?? null,
      priceBelowSma: c.priceBelowSma ?? null,
      changeMin: c.changeMin ?? null,
      changeMax: c.changeMax ?? null,
      smaCross: c.smaCross ?? null,
    })
  }

  const scan = async () => {
    setLoading(true); setError(null); setResult(null)
    try {
      const params = new URLSearchParams({ universe })
      Object.entries(criteria).forEach(([k, v]) => {
        if (v !== null && v !== '' && v !== undefined) params.append(k, v)
      })
      const r = await api.get(`/borsapy/scanner?${params.toString()}`)
      setResult(r.data)
    } catch (e) {
      setError('Tarama başarısız.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      <Card padding="md">
        <div className="text-[11px] uppercase tracking-wider text-gray-500 font-semibold mb-2">Hazır Tarama</div>
        <div className="flex flex-wrap gap-2">
          {Object.entries(PRESETS).map(([key, p]) => (
            <button
              key={key}
              onClick={() => applyPreset(key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                preset === key
                  ? 'bg-gold-500/20 text-gold-300 border border-gold-500/50'
                  : 'border border-dark-700 text-gray-400 hover:border-gold-500/30'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </Card>

      <Card padding="md">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <label className="text-[11px] uppercase tracking-wider text-gray-500 font-semibold">Evren</label>
            <select
              value={universe}
              onChange={(e) => setUniverse(e.target.value)}
              className="mt-1.5 w-full px-3 py-2 bg-dark-900 border border-dark-700 rounded-lg text-sm focus:border-gold-500 outline-none"
            >
              <option value="bist30">BIST 30</option>
              <option value="bist100">BIST 100</option>
              <option value="all">Tüm BIST</option>
            </select>
          </div>
          <NumberFilter label="RSI Altında" value={criteria.rsiBelow} onChange={(v) => setCriteria(c => ({ ...c, rsiBelow: v }))} />
          <NumberFilter label="RSI Üstünde" value={criteria.rsiAbove} onChange={(v) => setCriteria(c => ({ ...c, rsiAbove: v }))} />
          <NumberFilter label="Değişim ≥%" value={criteria.changeMin} onChange={(v) => setCriteria(c => ({ ...c, changeMin: v }))} step={0.5} />
        </div>
        <Button onClick={scan} disabled={loading} className="w-full justify-center mt-3">
          {loading ? <Spinner size={14} /> : <Filter size={14} />}
          Tarama Başlat
        </Button>
        {loading && <div className="mt-2 text-xs text-gray-400 text-center">{universe === 'all' ? 'Tüm BIST (~510 hisse) canlı quote + (varsa) historical çekiliyor — 30-90 sn.' : 'Canlı quote + (varsa) historical çekiliyor — 5-20 sn.'}</div>}
      </Card>

      {error && (
        <Card padding="md">
          <div className="text-red-400 text-sm flex items-center gap-2"><AlertCircle size={14} /> {error}</div>
        </Card>
      )}

      {result && (
        <Card padding="none">
          <div className="p-3 text-xs text-gray-400 border-b border-dark-800 flex items-center justify-between flex-wrap gap-2">
            <span><strong className="text-gold-300">{result.matches?.length || 0}</strong> sonuç · {result.scanned} sembol tarandı{result.quoted != null && result.quoted !== result.scanned ? ` (${result.quoted} canlı quote)` : ''} · {result.universe}</span>
            <span className="text-gray-500">{new Date(result.timestamp).toLocaleTimeString('tr-TR')}</span>
          </div>
          {result.matches?.length === 0 ? (
            <EmptyState icon={Filter} title="Sonuç bulunamadı" description="Kriterleri gevşetmeyi deneyin." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[11px] uppercase tracking-wider text-gray-500 border-b border-dark-800">
                    <th className="text-left p-3">Sembol</th>
                    <th className="text-right p-3">Fiyat</th>
                    <th className="text-right p-3">Değ %</th>
                    <th className="text-right p-3">RSI</th>
                    <th className="text-right p-3">SMA 20</th>
                    <th className="text-right p-3">SMA 50</th>
                    <th className="text-right p-3">Hacim</th>
                  </tr>
                </thead>
                <tbody>
                  {result.matches.map((m) => (
                    <tr key={m.symbol} className="border-b border-dark-800/60 hover:bg-dark-800/30">
                      <td className="p-3 font-mono font-bold text-gold-300">
                        <a href={`/hisse/${m.symbol}`} className="hover:underline">{m.symbol}</a>
                      </td>
                      <td className="p-3 text-right font-mono">{m.price?.toFixed(2) ?? '—'}</td>
                      <td className={`p-3 text-right font-mono font-semibold ${m.changePct > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {m.changePct > 0 ? '+' : ''}{m.changePct?.toFixed(2)}%
                      </td>
                      <td className={`p-3 text-right font-mono ${m.rsi != null && m.rsi < 30 ? 'text-emerald-400' : m.rsi != null && m.rsi > 70 ? 'text-red-400' : 'text-gray-300'}`}>
                        {m.rsi ?? '—'}
                      </td>
                      <td className="p-3 text-right text-xs text-gray-400">{m.sma20 ?? '—'}</td>
                      <td className="p-3 text-right text-xs text-gray-400">{m.sma50 ?? '—'}</td>
                      <td className="p-3 text-right text-xs text-gray-500">{m.volume?.toLocaleString('tr-TR') ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}
    </div>
  )
}

function NumberFilter({ label, value, onChange, step = 1 }) {
  return (
    <div>
      <label className="text-[11px] uppercase tracking-wider text-gray-500 font-semibold">{label}</label>
      <input
        type="number"
        value={value ?? ''}
        step={step}
        onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
        placeholder="—"
        className="mt-1.5 w-full px-3 py-2 bg-dark-900 border border-dark-700 rounded-lg text-sm focus:border-gold-500 outline-none"
      />
    </div>
  )
}
