import { useState, useEffect } from 'react'
import { X, Sparkles, CheckCircle } from 'lucide-react'
import { createPortal } from 'react-dom'

const FEATURES = [
  { icon: '🏅', text: 'Kıymetli Madenler (Altın, Gümüş, Altın TL)' },
  { icon: '☀️', text: 'Aydınlık Tema' },
  { icon: '✨', text: 'Yeni Arayüz & Modern Tasarım' },
  { icon: '📊', text: 'Gelişmiş Grafik Araçları' },
  { icon: '🔔', text: 'Fiyat Alarm Sistemi' },
  { icon: '🤖', text: 'Yapay Zeka Destekli Analiz' },
  { icon: '📱', text: 'Mobil Uygulama Güncellemeleri' },
]

const POPUP_KEY   = 'bk-update-popup'
const MAX_SHOWS   = 2
const INTERVAL_MS = 10 * 60 * 1000  // 10 dakika

export default function UpdatePopup() {
  const [visible, setVisible] = useState(false)
  const [canClose, setCanClose] = useState(false)
  const [countdown, setCountdown] = useState(3)

  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search)
      if (params.get('playstorePreview') === '1') return
    } catch (_) {}

    try {
      const stored = JSON.parse(localStorage.getItem(POPUP_KEY) || '{}')
      const count    = stored.count    || 0
      const lastShown = stored.lastShown || 0

      if (count >= MAX_SHOWS) return
      const elapsed = Date.now() - lastShown
      if (count > 0 && elapsed < INTERVAL_MS) return

      // Gösterilecek — küçük gecikme ile
      const timer = setTimeout(() => {
        setVisible(true)
        localStorage.setItem(POPUP_KEY, JSON.stringify({
          count: count + 1,
          lastShown: Date.now()
        }))
      }, 1500)
      return () => clearTimeout(timer)
    } catch (_) {}
  }, [])

  // 3 saniye geri sayım — kapat butonunu aktif et
  useEffect(() => {
    if (!visible) return
    setCanClose(false)
    setCountdown(3)
    const interval = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(interval)
          setCanClose(true)
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(interval)
  }, [visible])

  if (!visible) return null

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={canClose ? () => setVisible(false) : undefined}
      />

      {/* Modal */}
      <div className="relative w-full max-w-sm rounded-2xl overflow-hidden shadow-2xl"
           style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)', border: '1px solid rgba(245,158,11,0.3)' }}>

        {/* Altın üst çizgi */}
        <div className="h-1 w-full" style={{ background: 'linear-gradient(90deg, #f59e0b, #fbbf24, #f59e0b)' }} />

        {/* İçerik */}
        <div className="p-5">
          {/* Başlık */}
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.3)' }}>
                <Sparkles className="w-5 h-5 text-amber-400" />
              </div>
              <div>
                <p className="text-xs text-amber-400 font-semibold tracking-wider uppercase">Borsa Krali</p>
                <h2 className="text-white font-bold text-base leading-tight">Geliştirme Devam Ediyor!</h2>
              </div>
            </div>

            {/* Kapat butonu */}
            <button
              onClick={() => canClose && setVisible(false)}
              className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${
                canClose
                  ? 'bg-gray-700 hover:bg-gray-600 text-white cursor-pointer'
                  : 'bg-gray-800 text-gray-600 cursor-not-allowed'
              }`}
            >
              {canClose ? (
                <X className="w-4 h-4" />
              ) : (
                <span className="text-xs font-bold">{countdown}</span>
              )}
            </button>
          </div>

          {/* Alt metin */}
          <p className="text-gray-400 text-sm mb-4 leading-relaxed">
            Platformumuzu daha iyi hale getirmek için çalışıyoruz.
            Yakında gelecek özellikler:
          </p>

          {/* Özellik listesi */}
          <ul className="space-y-2 mb-5">
            {FEATURES.map((f, i) => (
              <li key={i} className="flex items-center gap-2.5 text-sm text-gray-300">
                <span className="text-base leading-none shrink-0">{f.icon}</span>
                <span>{f.text}</span>
              </li>
            ))}
          </ul>

          {/* Alt buton */}
          <button
            onClick={() => canClose && setVisible(false)}
            disabled={!canClose}
            className={`w-full py-2.5 rounded-xl font-semibold text-sm transition-all ${
              canClose
                ? 'text-slate-950 cursor-pointer hover:opacity-90 active:scale-95'
                : 'text-gray-500 cursor-not-allowed'
            }`}
            style={canClose ? { background: 'linear-gradient(90deg, #f59e0b, #fbbf24)' } : { background: '#1e293b', border: '1px solid #334155' }}
          >
            {canClose ? 'Harika, devam edin! 🚀' : `Lütfen bekleyin (${countdown}s)`}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
