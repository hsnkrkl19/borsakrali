import { useState, useEffect } from 'react'
import { Moon, Sun, Palette, Type, User, Smartphone, ChevronDown, ChevronUp, Check, Crown, Minus, Plus, BarChart2, TrendingUp, CandlestickChart } from 'lucide-react'
import { useAuthStore } from '../store/authStore'
import { applyTheme, getStoredTheme } from '../utils/theme'

const FONT_LEVELS = [80, 87, 93, 100, 108, 116]
const DEFAULT_LEVEL = 3 // index 3 = 100%

function getFontLevel() {
  const saved = localStorage.getItem('bk-font-level')
  const idx = saved !== null ? parseInt(saved) : DEFAULT_LEVEL
  return Math.max(0, Math.min(FONT_LEVELS.length - 1, idx))
}

function applyFontLevel(idx) {
  document.documentElement.style.fontSize = `${FONT_LEVELS[idx]}%`
  localStorage.setItem('bk-font-level', String(idx))
}

export default function Ayarlar() {
  const { user } = useAuthStore()
  const [fontLevel, setFontLevel] = useState(getFontLevel)
  const [chartColor, setChartColor] = useState(() => localStorage.getItem('bk-chart-color') || 'default')
  const [chartType, setChartType] = useState(() => localStorage.getItem('bk-chart-type') || 'candlestick')
  const [theme, setTheme] = useState(() => getStoredTheme())
  const [savedMsg, setSavedMsg] = useState('')

  const saveTheme = (val) => {
    setTheme(applyTheme(val))
    setSavedMsg('Tema değiştirildi!')
    setTimeout(() => setSavedMsg(''), 2000)
  }

  const decreaseFont = () => {
    if (fontLevel <= 0) return
    const next = fontLevel - 1
    setFontLevel(next)
    applyFontLevel(next)
  }

  const increaseFont = () => {
    if (fontLevel >= FONT_LEVELS.length - 1) return
    const next = fontLevel + 1
    setFontLevel(next)
    applyFontLevel(next)
  }

  const resetFont = () => {
    setFontLevel(DEFAULT_LEVEL)
    applyFontLevel(DEFAULT_LEVEL)
  }

  const saveChartColor = (val) => {
    setChartColor(val)
    localStorage.setItem('bk-chart-color', val)
    setSavedMsg('Kaydedildi!')
    setTimeout(() => setSavedMsg(''), 2000)
  }

  const saveChartType = (val) => {
    setChartType(val)
    localStorage.setItem('bk-chart-type', val)
    setSavedMsg('Kaydedildi!')
    setTimeout(() => setSavedMsg(''), 2000)
  }

  const fontPercent = FONT_LEVELS[fontLevel]
  const canDecrease = fontLevel > 0
  const canIncrease = fontLevel < FONT_LEVELS.length - 1

  return (
    <div className="space-y-5 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-white">Ayarlar</h1>

      {/* Font Boyutu */}
      <div className="card border-gold-500/20">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-gold-500/20 rounded-xl flex items-center justify-center">
            <Type className="w-5 h-5 text-gold-400" />
          </div>
          <div>
            <h3 className="font-semibold text-white">Yazı Boyutu</h3>
            <p className="text-xs text-gray-500">Sayfadaki metin boyutunu ayarlayın</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <button
            onClick={decreaseFont}
            disabled={!canDecrease}
            className={`w-10 h-10 rounded-xl border flex items-center justify-center transition-all ${
              canDecrease
                ? 'border-gold-500/30 text-gold-400 hover:bg-gold-500/10 active:scale-95'
                : 'border-dark-600 text-gray-600 cursor-not-allowed'
            }`}
          >
            <Minus className="w-4 h-4" />
          </button>

          <div className="flex-1">
            <div className="flex justify-between mb-1.5">
              {FONT_LEVELS.map((lvl, i) => (
                <button
                  key={i}
                  onClick={() => { setFontLevel(i); applyFontLevel(i) }}
                  className={`w-7 h-7 rounded-lg text-xs font-medium transition-all ${
                    i === fontLevel
                      ? 'bg-gold-500 text-dark-950'
                      : 'bg-dark-700 text-gray-400 hover:bg-dark-600'
                  }`}
                >
                  {lvl}
                </button>
              ))}
            </div>
            <div className="text-center text-xs text-gray-500">
              {fontPercent === 100 ? (
                <span className="text-green-400">Varsayılan (%100)</span>
              ) : (
                <span>%{fontPercent}
                  {' '}<button onClick={resetFont} className="text-gold-400 hover:text-gold-300 underline">sıfırla</button>
                </span>
              )}
            </div>
          </div>

          <button
            onClick={increaseFont}
            disabled={!canIncrease}
            className={`w-10 h-10 rounded-xl border flex items-center justify-center transition-all ${
              canIncrease
                ? 'border-gold-500/30 text-gold-400 hover:bg-gold-500/10 active:scale-95'
              : 'border-dark-600 text-gray-600 cursor-not-allowed'
            }`}
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>

        {/* Preview */}
        <div className="mt-4 p-3 bg-dark-800 rounded-xl border border-dark-600">
          <p className="text-xs text-gray-500 mb-1">Önizleme:</p>
          <p className="text-white font-medium" style={{ fontSize: `${fontPercent}%` }}>THYAO — Türk Hava Yolları</p>
          <p className="text-gray-400 text-sm" style={{ fontSize: `${fontPercent * 0.875}%` }}>+2.45% • 289.25 TL</p>
        </div>
      </div>

      {/* Tema */}
      <div className="card border-gold-500/20">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-gold-500/20 rounded-xl flex items-center justify-center">
            <Palette className="w-5 h-5 text-gold-400" />
          </div>
          <h3 className="font-semibold text-white">Tema</h3>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button
            onClick={() => saveTheme('dark')}
            className={`flex items-center gap-3 p-3.5 rounded-xl border-2 relative transition-all ${
              theme === 'dark'
                ? 'bg-dark-950 border-gold-500'
                : 'bg-dark-800 border-dark-600 hover:border-dark-500'
            }`}
          >
            <Moon className={`w-5 h-5 ${theme === 'dark' ? 'text-gold-400' : 'text-gray-400'}`} />
            <div className="text-left">
              <p className="text-sm font-medium text-white">Karanlık</p>
              <p className="text-xs text-gray-500">Gece modu</p>
            </div>
            {theme === 'dark' && <Check className="absolute top-2 right-2 w-4 h-4 text-gold-400" />}
          </button>

          <button
            onClick={() => saveTheme('light')}
            className={`flex items-center gap-3 p-3.5 rounded-xl border-2 relative transition-all ${
              theme === 'light'
                ? 'bg-dark-950 border-gold-500'
                : 'bg-dark-800 border-dark-600 hover:border-dark-500'
            }`}
          >
            <Sun className={`w-5 h-5 ${theme === 'light' ? 'text-gold-400' : 'text-gray-400'}`} />
            <div className="text-left">
              <p className="text-sm font-medium text-white">Aydınlık</p>
              <p className="text-xs text-gray-500">Gündüz modu</p>
            </div>
            {theme === 'light' && <Check className="absolute top-2 right-2 w-4 h-4 text-gold-400" />}
          </button>
        </div>
        {savedMsg && (
          <div className="mt-3 flex items-center gap-2 text-green-400 text-sm">
            <Check className="w-4 h-4" /> {savedMsg}
          </div>
        )}
      </div>

      {/* Grafik Renkleri */}
      <div className="card border-gold-500/20">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-gold-500/20 rounded-xl flex items-center justify-center">
            <svg className="w-5 h-5 text-gold-400" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M3 3a1 1 0 000 2v8a2 2 0 002 2h2.586l-1.293 1.293a1 1 0 101.414 1.414L10 15.414l2.293 2.293a1 1 0 001.414-1.414L12.414 15H15a2 2 0 002-2V5a1 1 0 100-2H3zm11 4a1 1 0 10-2 0v4a1 1 0 102 0V7zm-3 1a1 1 0 10-2 0v3a1 1 0 102 0V8zM8 9a1 1 0 00-2 0v2a1 1 0 102 0V9z" clipRule="evenodd" />
            </svg>
          </div>
          <div>
            <h3 className="font-semibold text-white">Grafik Renkleri</h3>
            <p className="text-xs text-gray-500">Yükselen / düşen mum renkleri</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button
            onClick={() => saveChartColor('default')}
            className={`flex items-center gap-3 p-3.5 rounded-xl border-2 transition-all ${
              chartColor === 'default' ? 'border-gold-500 bg-gold-500/5' : 'border-dark-600 bg-dark-800 hover:border-dark-500'
            }`}
          >
            <div className="flex gap-1">
              <div className="w-4 h-6 rounded bg-green-500"></div>
              <div className="w-4 h-6 rounded bg-red-500"></div>
            </div>
            <div className="text-left">
              <p className="text-sm font-medium text-white">Standart</p>
              <p className="text-xs text-gray-500">Yeşil AL / Kırmızı SAT</p>
            </div>
            {chartColor === 'default' && <Check className="ml-auto w-4 h-4 text-gold-400 flex-shrink-0" />}
          </button>

          <button
            onClick={() => saveChartColor('reverse')}
            className={`flex items-center gap-3 p-3.5 rounded-xl border-2 transition-all ${
              chartColor === 'reverse' ? 'border-gold-500 bg-gold-500/5' : 'border-dark-600 bg-dark-800 hover:border-dark-500'
            }`}
          >
            <div className="flex gap-1">
              <div className="w-4 h-6 rounded bg-red-500"></div>
              <div className="w-4 h-6 rounded bg-green-500"></div>
            </div>
            <div className="text-left">
              <p className="text-sm font-medium text-white">Ters</p>
              <p className="text-xs text-gray-500">Kırmızı AL / Yeşil SAT</p>
            </div>
            {chartColor === 'reverse' && <Check className="ml-auto w-4 h-4 text-gold-400 flex-shrink-0" />}
          </button>
        </div>

        {savedMsg && (
          <div className="mt-3 flex items-center gap-2 text-green-400 text-sm">
            <Check className="w-4 h-4" /> {savedMsg}
          </div>
        )}
      </div>

      {/* Grafik Türü */}
      <div className="card border-gold-500/20">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-gold-500/20 rounded-xl flex items-center justify-center">
            <CandlestickChart className="w-5 h-5 text-gold-400" />
          </div>
          <div>
            <h3 className="font-semibold text-white">Grafik Türü</h3>
            <p className="text-xs text-gray-500">Hisse grafiklerinin görünümü</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[
            {
              key: 'candlestick', label: 'Mum', sub: 'Klasik',
              icon: (
                <svg className="w-8 h-8" viewBox="0 0 32 32" fill="none">
                  <rect x="6" y="10" width="6" height="14" rx="1" fill="#22c55e"/>
                  <line x1="9" y1="6" x2="9" y2="10" stroke="#22c55e" strokeWidth="2"/>
                  <line x1="9" y1="24" x2="9" y2="28" stroke="#22c55e" strokeWidth="2"/>
                  <rect x="18" y="8" width="6" height="12" rx="1" fill="#ef4444"/>
                  <line x1="21" y1="4" x2="21" y2="8" stroke="#ef4444" strokeWidth="2"/>
                  <line x1="21" y1="20" x2="21" y2="26" stroke="#ef4444" strokeWidth="2"/>
                </svg>
              )
            },
            {
              key: 'line', label: 'Çizgi', sub: 'Sade',
              icon: (
                <svg className="w-8 h-8" viewBox="0 0 32 32" fill="none">
                  <polyline points="4,24 10,18 16,20 22,10 28,14" stroke="#eab308" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round"/>
                  <circle cx="4" cy="24" r="2" fill="#eab308"/>
                  <circle cx="28" cy="14" r="2" fill="#eab308"/>
                </svg>
              )
            },
            {
              key: 'bar', label: 'Çubuk', sub: 'OHLC',
              icon: (
                <svg className="w-8 h-8" viewBox="0 0 32 32" fill="none">
                  <line x1="9" y1="6" x2="9" y2="26" stroke="#22c55e" strokeWidth="2.5"/>
                  <line x1="9" y1="12" x2="6" y2="12" stroke="#22c55e" strokeWidth="2"/>
                  <line x1="9" y1="20" x2="12" y2="20" stroke="#22c55e" strokeWidth="2"/>
                  <line x1="21" y1="4" x2="21" y2="24" stroke="#ef4444" strokeWidth="2.5"/>
                  <line x1="21" y1="10" x2="18" y2="10" stroke="#ef4444" strokeWidth="2"/>
                  <line x1="21" y1="18" x2="24" y2="18" stroke="#ef4444" strokeWidth="2"/>
                </svg>
              )
            },
          ].map(({ key, label, sub, icon }) => (
            <button
              key={key}
              onClick={() => saveChartType(key)}
              className={`flex flex-col items-center gap-2 p-3.5 rounded-xl border-2 transition-all ${
                chartType === key
                  ? 'border-gold-500 bg-gold-500/10'
                  : 'border-dark-600 bg-dark-800 hover:border-dark-500'
              }`}
            >
              {icon}
              <div>
                <p className="text-sm font-medium text-white">{label}</p>
                <p className="text-[10px] text-gray-500">{sub}</p>
              </div>
              {chartType === key && <Check className="w-3.5 h-3.5 text-gold-400" />}
            </button>
          ))}
        </div>
        <p className="text-[11px] text-gray-600 mt-3">* Mum grafik en fazla bilgiyi sunar. Çizgi daha sade bir görünüm sağlar.</p>
      </div>

      {/* Hesap Bilgileri */}
      <div className="card border-gold-500/20">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-gold-500/20 rounded-xl flex items-center justify-center">
            <User className="w-5 h-5 text-gold-400" />
          </div>
          <h3 className="font-semibold text-white">Hesap Bilgileri</h3>
        </div>

        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-400 block mb-1">AD</label>
              <input
                className="input w-full text-gray-300 bg-dark-800"
                value={user?.firstName || '—'}
                readOnly
              />
            </div>
            <div>
              <label className="text-xs text-gray-400 block mb-1">SOYAD</label>
              <input
                className="input w-full text-gray-300 bg-dark-800"
                value={user?.lastName || '—'}
                readOnly
              />
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-400 block mb-1">E-POSTA</label>
            <input
              className="input w-full text-gray-300 bg-dark-800"
              value={user?.email || '—'}
              readOnly
            />
          </div>
          <div>
            <label className="text-xs text-gray-400 block mb-1">TELEFON</label>
            <input
              className="input w-full text-gray-300 bg-dark-800"
              value={user?.phone ? `${user.phone.slice(0,3)} ${user.phone.slice(3,6)} ${user.phone.slice(6,8)} ${user.phone.slice(8)}` : '—'}
              readOnly
            />
          </div>
          <div className="p-3 bg-gold-500/10 border border-gold-500/20 rounded-lg">
            <p className="text-xs text-gold-400">Hesap bilgilerini güncellemek için destek ekibiyle iletişime geçin.</p>
          </div>
        </div>
      </div>

      {/* Uygulama Hakkında */}
      <div className="card border-gold-500/20">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-gold-500/20 rounded-xl flex items-center justify-center">
            <Smartphone className="w-5 h-5 text-gold-400" />
          </div>
          <h3 className="font-semibold text-white">Uygulama Hakkında</h3>
        </div>
        <div className="space-y-2 text-sm">
          {[
            ['Uygulama Adı', 'Borsa Krali'],
            ['Versiyon', '3.0.0'],
            ['Veri Kaynağı', 'Yahoo Finance'],
            ['Borsa', 'BIST (Borsa İstanbul)'],
          ].map(([label, value]) => (
            <div key={label} className="flex justify-between items-center py-1 border-b border-dark-700 last:border-0">
              <span className="text-gray-400">{label}</span>
              <span className="text-white font-medium">{value}</span>
            </div>
          ))}
        </div>
        <div className="mt-4 p-3 bg-dark-800 rounded-lg">
          <p className="text-xs text-gray-500 text-center">
            Bu uygulama yalnızca eğitim amaçlıdır. Yatırım tavsiyesi değildir.
          </p>
        </div>
      </div>
    </div>
  )
}
