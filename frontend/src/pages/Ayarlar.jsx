import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowRight,
  CandlestickChart,
  Check,
  KeyRound,
  Minus,
  Moon,
  Palette,
  Plus,
  ShieldCheck,
  Smartphone,
  Sun,
  Type,
  User,
} from 'lucide-react'
import { useAuthStore } from '../store/authStore'
import { applyTheme, getStoredTheme } from '../utils/theme'
import ConnectionTester from '../components/ConnectionTester'

const FONT_LEVELS = [80, 87, 93, 100, 108, 116]
const DEFAULT_LEVEL = 3

function getFontLevel() {
  const saved = localStorage.getItem('bk-font-level')
  const index = saved !== null ? parseInt(saved, 10) : DEFAULT_LEVEL
  return Math.max(0, Math.min(FONT_LEVELS.length - 1, index))
}

function applyFontLevel(index) {
  document.documentElement.style.fontSize = `${FONT_LEVELS[index]}%`
  localStorage.setItem('bk-font-level', String(index))
}

function formatPhone(phone) {
  if (!phone) {
    return '-'
  }

  const digits = String(phone)
  if (digits.length < 10) {
    return digits
  }

  return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6, 8)} ${digits.slice(8, 10)}`
}

const CHART_COLOR_OPTIONS = [
  {
    key: 'default',
    label: 'Standart',
    description: 'Yesil AL / Kirmizi SAT',
    swatches: ['bg-green-500', 'bg-red-500'],
  },
  {
    key: 'reverse',
    label: 'Ters',
    description: 'Kirmizi AL / Yesil SAT',
    swatches: ['bg-red-500', 'bg-green-500'],
  },
]

const CHART_TYPE_OPTIONS = [
  {
    key: 'candlestick',
    label: 'Mum',
    description: 'Klasik',
    icon: (
      <svg className="h-8 w-8" viewBox="0 0 32 32" fill="none">
        <rect x="6" y="10" width="6" height="14" rx="1" fill="#22c55e" />
        <line x1="9" y1="6" x2="9" y2="10" stroke="#22c55e" strokeWidth="2" />
        <line x1="9" y1="24" x2="9" y2="28" stroke="#22c55e" strokeWidth="2" />
        <rect x="18" y="8" width="6" height="12" rx="1" fill="#ef4444" />
        <line x1="21" y1="4" x2="21" y2="8" stroke="#ef4444" strokeWidth="2" />
        <line x1="21" y1="20" x2="21" y2="26" stroke="#ef4444" strokeWidth="2" />
      </svg>
    ),
  },
  {
    key: 'line',
    label: 'Cizgi',
    description: 'Sade',
    icon: (
      <svg className="h-8 w-8" viewBox="0 0 32 32" fill="none">
        <polyline
          points="4,24 10,18 16,20 22,10 28,14"
          stroke="#eab308"
          strokeWidth="2.5"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        <circle cx="4" cy="24" r="2" fill="#eab308" />
        <circle cx="28" cy="14" r="2" fill="#eab308" />
      </svg>
    ),
  },
  {
    key: 'bar',
    label: 'Cubuk',
    description: 'OHLC',
    icon: (
      <svg className="h-8 w-8" viewBox="0 0 32 32" fill="none">
        <line x1="9" y1="6" x2="9" y2="26" stroke="#22c55e" strokeWidth="2.5" />
        <line x1="9" y1="12" x2="6" y2="12" stroke="#22c55e" strokeWidth="2" />
        <line x1="9" y1="20" x2="12" y2="20" stroke="#22c55e" strokeWidth="2" />
        <line x1="21" y1="4" x2="21" y2="24" stroke="#ef4444" strokeWidth="2.5" />
        <line x1="21" y1="10" x2="18" y2="10" stroke="#ef4444" strokeWidth="2" />
        <line x1="21" y1="18" x2="24" y2="18" stroke="#ef4444" strokeWidth="2" />
      </svg>
    ),
  },
]

function SectionCard({ icon, title, subtitle, children }) {
  return (
    <div className="card border-gold-500/20">
      <div className="mb-4 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gold-500/20">
          {icon}
        </div>
        <div>
          <h3 className="font-semibold text-white">{title}</h3>
          {subtitle ? <p className="text-xs text-gray-500">{subtitle}</p> : null}
        </div>
      </div>
      {children}
    </div>
  )
}

export default function Ayarlar() {
  const { user } = useAuthStore()
  const [fontLevel, setFontLevel] = useState(getFontLevel)
  const [chartColor, setChartColor] = useState(() => localStorage.getItem('bk-chart-color') || 'default')
  const [chartType, setChartType] = useState(() => localStorage.getItem('bk-chart-type') || 'candlestick')
  const [theme, setTheme] = useState(() => getStoredTheme())
  const [savedMsg, setSavedMsg] = useState('')

  const saveTheme = (value) => {
    setTheme(applyTheme(value))
    setSavedMsg('Tema guncellendi')
    setTimeout(() => setSavedMsg(''), 2000)
  }

  const saveChartColor = (value) => {
    setChartColor(value)
    localStorage.setItem('bk-chart-color', value)
    setSavedMsg('Grafik renkleri kaydedildi')
    setTimeout(() => setSavedMsg(''), 2000)
  }

  const saveChartType = (value) => {
    setChartType(value)
    localStorage.setItem('bk-chart-type', value)
    setSavedMsg('Grafik tipi kaydedildi')
    setTimeout(() => setSavedMsg(''), 2000)
  }

  const decreaseFont = () => {
    if (fontLevel <= 0) {
      return
    }
    const next = fontLevel - 1
    setFontLevel(next)
    applyFontLevel(next)
  }

  const increaseFont = () => {
    if (fontLevel >= FONT_LEVELS.length - 1) {
      return
    }
    const next = fontLevel + 1
    setFontLevel(next)
    applyFontLevel(next)
  }

  const resetFont = () => {
    setFontLevel(DEFAULT_LEVEL)
    applyFontLevel(DEFAULT_LEVEL)
  }

  const fontPercent = FONT_LEVELS[fontLevel]

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <h1 className="text-2xl font-bold text-white">Ayarlar</h1>

      <SectionCard
        icon={<Type className="h-5 w-5 text-gold-400" />}
        title="Yazi Boyutu"
        subtitle="Ekrandaki metin buyuklugunu ayarlayin"
      >
        <div className="flex items-center gap-4">
          <button
            onClick={decreaseFont}
            disabled={fontLevel <= 0}
            className={`flex h-10 w-10 items-center justify-center rounded-xl border transition-all ${
              fontLevel > 0
                ? 'border-gold-500/30 text-gold-400 hover:bg-gold-500/10'
                : 'cursor-not-allowed border-dark-600 text-gray-600'
            }`}
          >
            <Minus className="h-4 w-4" />
          </button>

          <div className="flex-1">
            <div className="mb-2 flex justify-between gap-2">
              {FONT_LEVELS.map((level, index) => (
                <button
                  key={level}
                  onClick={() => {
                    setFontLevel(index)
                    applyFontLevel(index)
                  }}
                  className={`h-8 flex-1 rounded-lg text-xs font-medium transition-all ${
                    index === fontLevel
                      ? 'bg-gold-500 text-dark-950'
                      : 'bg-dark-700 text-gray-400 hover:bg-dark-600'
                  }`}
                >
                  {level}
                </button>
              ))}
            </div>

            <div className="text-center text-xs text-gray-500">
              {fontPercent === 100 ? (
                <span className="text-green-400">Varsayilan (%100)</span>
              ) : (
                <span>
                  %{fontPercent}{' '}
                  <button onClick={resetFont} className="text-gold-400 underline hover:text-gold-300">
                    sifirla
                  </button>
                </span>
              )}
            </div>
          </div>

          <button
            onClick={increaseFont}
            disabled={fontLevel >= FONT_LEVELS.length - 1}
            className={`flex h-10 w-10 items-center justify-center rounded-xl border transition-all ${
              fontLevel < FONT_LEVELS.length - 1
                ? 'border-gold-500/30 text-gold-400 hover:bg-gold-500/10'
                : 'cursor-not-allowed border-dark-600 text-gray-600'
            }`}
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 rounded-xl border border-dark-600 bg-dark-800 p-3">
          <p className="mb-1 text-xs text-gray-500">Onizleme</p>
          <p className="font-medium text-white" style={{ fontSize: `${fontPercent}%` }}>
            THYAO - Turk Hava Yollari
          </p>
          <p className="text-sm text-gray-400" style={{ fontSize: `${fontPercent * 0.875}%` }}>
            +2.45% • 289.25 TL
          </p>
        </div>
      </SectionCard>

      <SectionCard
        icon={<Palette className="h-5 w-5 text-gold-400" />}
        title="Tema"
        subtitle="Uygulamanin gorunum modunu secin"
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <button
            onClick={() => saveTheme('dark')}
            className={`relative flex items-center gap-3 rounded-xl border-2 p-3.5 transition-all ${
              theme === 'dark'
                ? 'border-gold-500 bg-dark-950'
                : 'border-dark-600 bg-dark-800 hover:border-dark-500'
            }`}
          >
            <Moon className={`h-5 w-5 ${theme === 'dark' ? 'text-gold-400' : 'text-gray-400'}`} />
            <div className="text-left">
              <p className="text-sm font-medium text-white">Karanlik</p>
              <p className="text-xs text-gray-500">Gece modu</p>
            </div>
            {theme === 'dark' ? <Check className="absolute right-3 top-3 h-4 w-4 text-gold-400" /> : null}
          </button>

          <button
            onClick={() => saveTheme('light')}
            className={`relative flex items-center gap-3 rounded-xl border-2 p-3.5 transition-all ${
              theme === 'light'
                ? 'border-gold-500 bg-dark-950'
                : 'border-dark-600 bg-dark-800 hover:border-dark-500'
            }`}
          >
            <Sun className={`h-5 w-5 ${theme === 'light' ? 'text-gold-400' : 'text-gray-400'}`} />
            <div className="text-left">
              <p className="text-sm font-medium text-white">Aydinlik</p>
              <p className="text-xs text-gray-500">Gunduz modu</p>
            </div>
            {theme === 'light' ? <Check className="absolute right-3 top-3 h-4 w-4 text-gold-400" /> : null}
          </button>
        </div>

        {savedMsg ? (
          <div className="mt-3 flex items-center gap-2 text-sm text-green-400">
            <Check className="h-4 w-4" />
            {savedMsg}
          </div>
        ) : null}
      </SectionCard>

      <SectionCard
        icon={
          <svg className="h-5 w-5 text-gold-400" viewBox="0 0 20 20" fill="currentColor">
            <path
              fillRule="evenodd"
              d="M3 3a1 1 0 000 2v8a2 2 0 002 2h2.586l-1.293 1.293a1 1 0 101.414 1.414L10 15.414l2.293 2.293a1 1 0 001.414-1.414L12.414 15H15a2 2 0 002-2V5a1 1 0 100-2H3zm11 4a1 1 0 10-2 0v4a1 1 0 102 0V7zm-3 1a1 1 0 10-2 0v3a1 1 0 102 0V8zM8 9a1 1 0 00-2 0v2a1 1 0 102 0V9z"
              clipRule="evenodd"
            />
          </svg>
        }
        title="Grafik Renkleri"
        subtitle="Yukselen ve dusen mum renkleri"
      >
        <div className="grid gap-3 sm:grid-cols-2">
          {CHART_COLOR_OPTIONS.map((option) => (
            <button
              key={option.key}
              onClick={() => saveChartColor(option.key)}
              className={`flex items-center gap-3 rounded-xl border-2 p-3.5 transition-all ${
                chartColor === option.key
                  ? 'border-gold-500 bg-gold-500/5'
                  : 'border-dark-600 bg-dark-800 hover:border-dark-500'
              }`}
            >
              <div className="flex gap-1">
                {option.swatches.map((swatch) => (
                  <div key={swatch} className={`h-6 w-4 rounded ${swatch}`} />
                ))}
              </div>
              <div className="text-left">
                <p className="text-sm font-medium text-white">{option.label}</p>
                <p className="text-xs text-gray-500">{option.description}</p>
              </div>
              {chartColor === option.key ? <Check className="ml-auto h-4 w-4 text-gold-400" /> : null}
            </button>
          ))}
        </div>
      </SectionCard>

      <SectionCard
        icon={<CandlestickChart className="h-5 w-5 text-gold-400" />}
        title="Grafik Turu"
        subtitle="Hisse grafiklerinin gorunumu"
      >
        <div className="grid gap-3 sm:grid-cols-3">
          {CHART_TYPE_OPTIONS.map((option) => (
            <button
              key={option.key}
              onClick={() => saveChartType(option.key)}
              className={`flex flex-col items-center gap-2 rounded-xl border-2 p-3.5 transition-all ${
                chartType === option.key
                  ? 'border-gold-500 bg-gold-500/10'
                  : 'border-dark-600 bg-dark-800 hover:border-dark-500'
              }`}
            >
              {option.icon}
              <div>
                <p className="text-sm font-medium text-white">{option.label}</p>
                <p className="text-[10px] text-gray-500">{option.description}</p>
              </div>
              {chartType === option.key ? <Check className="h-3.5 w-3.5 text-gold-400" /> : null}
            </button>
          ))}
        </div>

        <p className="mt-3 text-[11px] text-gray-600">
          Mum grafik en fazla bilgiyi sunar. Cizgi daha sade bir gorunum saglar.
        </p>
      </SectionCard>

      <SectionCard
        icon={<User className="h-5 w-5 text-gold-400" />}
        title="Hesap Bilgileri"
      >
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <InfoField label="AD" value={user?.firstName || '-'} />
            <InfoField label="SOYAD" value={user?.lastName || '-'} />
          </div>
          <InfoField label="E-POSTA" value={user?.email || '-'} />
          <InfoField label="TELEFON" value={formatPhone(user?.phone)} />

          <div className="rounded-lg border border-gold-500/20 bg-gold-500/10 p-3">
            <p className="text-xs text-gold-400">
              Hesap bilgilerini guncellemek icin destek ekibiyle iletisime gecin.
            </p>
          </div>
        </div>
      </SectionCard>

      <SectionCard
        icon={<KeyRound className="h-5 w-5 text-gold-400" />}
        title="Sifre ve Guvenlik"
        subtitle="Canli kullanima uygun oturum guvenligi"
      >
        <div className="space-y-3">
          <div className="rounded-2xl border border-green-500/20 bg-green-500/10 p-4">
            <div className="flex items-start gap-3">
              <ShieldCheck className="mt-0.5 h-5 w-5 flex-shrink-0 text-green-400" />
              <div>
                <p className="text-sm font-medium text-white">Eski oturumlar otomatik kapanir</p>
                <p className="mt-1 text-xs text-gray-300">
                  Sifre degistirdiginizde daha once acilmis tum eski oturumlar guvenlik icin gecersiz olur.
                </p>
              </div>
            </div>
          </div>

          <Link
            to="/sifre-degistir"
            className="flex items-center justify-between rounded-2xl border border-gold-500/20 bg-dark-800 px-4 py-3 text-sm text-gray-200 transition-all hover:border-gold-500/40 hover:bg-dark-700"
          >
            <div>
              <div className="font-medium text-white">Sifremi degistir</div>
              <div className="text-xs text-gray-500">Mevcut sifrenizi dogrulayip yeni sifre belirleyin</div>
            </div>
            <ArrowRight className="h-4 w-4 text-gold-400" />
          </Link>
        </div>
      </SectionCard>

      <SectionCard
        icon={<Smartphone className="h-5 w-5 text-gold-400" />}
        title="Uygulama Hakkinda"
      >
        <div className="space-y-2 text-sm">
          {[
            ['Uygulama Adi', 'Borsa Krali'],
            ['Versiyon', '3.3.2'],
            ['Veri Kaynagi', 'Yahoo Finance'],
            ['Borsa', 'BIST (Borsa Istanbul)'],
          ].map(([label, value]) => (
            <div
              key={label}
              className="flex items-center justify-between border-b border-dark-700 py-1 last:border-0"
            >
              <span className="text-gray-400">{label}</span>
              <span className="font-medium text-white">{value}</span>
            </div>
          ))}
        </div>

        <div className="mt-4 rounded-lg bg-dark-800 p-3">
          <p className="text-center text-xs text-gray-500">
            Bu uygulama yalnizca egitim amaclidir. Yatirim tavsiyesi degildir.
          </p>
        </div>

        <div className="mt-4">
          <ConnectionTester />
        </div>
      </SectionCard>
    </div>
  )
}

function InfoField({ label, value }) {
  return (
    <div>
      <label className="mb-1 block text-xs text-gray-400">{label}</label>
      <input className="input w-full bg-dark-800 text-gray-300" value={value} readOnly />
    </div>
  )
}
