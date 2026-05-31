import { useEffect, useState } from 'react'
import { X, Send, Megaphone, Loader, CheckCircle2, AlertTriangle, Sparkles } from 'lucide-react'
import { useAuthStore } from '../store/authStore'
import { sendBroadcastNotification } from '../services/adminNotifications'

const TEMPLATES = [
  { label: 'Güncelleme yolda', title: 'Yeni güncelleme yolda', body: 'Borsa Kralı için yeni özellikler hazırlanıyor. Yakında uygulamayı güncellemeyi unutmayın.', path: '/site-haritasi' },
  { label: 'Yeni sinyal',     title: 'Yeni günlük sinyaller hazır', body: 'Algoritma yeni AL/SAT fırsatları tespit etti. Sinyal listesini hemen kontrol edin.',                  path: '/gunluk-tespitler' },
  { label: 'Pro Analiz',       title: 'Pro analizler güncellendi',    body: 'Bugün için Pro Analiz raporları yayınlandı. Premium üyeliğinizle erişebilirsiniz.',                  path: '/pro-analiz' },
  { label: 'Pazar haberi',     title: 'Önemli pazar gelişmesi',       body: 'BIST için takip etmeniz gereken bir gelişme yaşandı. Detaylar için Ekonomik Takvim sayfasına bakın.', path: '/ekonomik-takvim' },
]

export default function QuickBroadcastModal({ open, onClose }) {
  const { token, user } = useAuthStore()
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [path, setPath] = useState('/site-haritasi')
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setResult(null)
    setError('')
    const onKey = (e) => { if (e.key === 'Escape') onClose?.() }
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  if (!open) return null

  const applyTemplate = (t) => {
    setTitle(t.title)
    setBody(t.body)
    setPath(t.path)
  }

  const handleSend = async (e) => {
    e.preventDefault()
    if (!token) { setError('Önce giriş yapmanız gerekiyor.'); return }
    if (!title.trim() || !body.trim()) { setError('Başlık ve mesaj zorunludur.'); return }
    setSending(true); setError(''); setResult(null)
    try {
      const res = await sendBroadcastNotification({ title: title.trim(), body: body.trim(), path: path.trim() }, token)
      setResult(res)
    } catch (err) {
      setError(err.message || 'Bildirim gönderilemedi.')
    } finally {
      setSending(false)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Bildirim Gönder"
      className="cmdk-backdrop fixed inset-0 z-[200] flex items-start justify-center pt-[8vh] px-3 pb-6"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="cmdk-panel w-full max-w-lg rounded-2xl overflow-hidden flex flex-col"
        style={{ maxHeight: '88vh' }}
      >
        {/* Header */}
        <div
          className="px-4 py-3.5 flex items-center justify-between flex-shrink-0"
          style={{ borderBottom: '1px solid var(--border-main)' }}
        >
          <div className="flex items-center gap-2.5">
            <div
              className="w-9 h-9 rounded-lg flex items-center justify-center"
              style={{ background: 'rgba(16, 185, 129, 0.15)', color: 'var(--gold-400)', border: '1px solid var(--border-gold)' }}
            >
              <Megaphone className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-[15px] font-bold" style={{ color: 'var(--text-primary)' }}>Hızlı Bildirim Gönder</h2>
              <p className="text-[11px]" style={{ color: 'var(--text-faint)' }}>Tüm kullanıcılara duyuru</p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Kapat"
            className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors"
            style={{ color: 'var(--text-muted)' }}
            onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-hover)'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-3">
          <div
            className="rounded-lg p-2.5 text-[11.5px] flex items-start gap-2"
            style={{
              background: 'rgba(16, 185, 129, 0.07)',
              border: '1px solid var(--border-gold)',
              color: 'var(--text-secondary)',
            }}
          >
            <Sparkles className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" style={{ color: 'var(--gold-400)' }} />
            <span>
              <strong>{user?.email}</strong> olarak gönderiliyor. Mesaj
              {' '}<strong>tüm kayıtlı cihazlara FCM</strong>{' '}
              ve{' '}<strong>tüm aktif web kullanıcılarına anlık</strong>{' '}
              ulaştırılır. Soğuk-anonim durumdaki ziyaretçiler bağlandıklarında listeye dahil edilir.
            </span>
          </div>

          {/* Şablonlar */}
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-faint)' }}>
              Hızlı Şablonlar
            </label>
            <div className="flex flex-wrap gap-1.5">
              {TEMPLATES.map(t => (
                <button
                  key={t.label}
                  type="button"
                  onClick={() => applyTemplate(t)}
                  className="text-[11px] font-medium px-2.5 py-1 rounded-full transition-colors"
                  style={{
                    background: 'var(--bg-input)',
                    border: '1px solid var(--border-main)',
                    color: 'var(--text-secondary)',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(16, 185, 129, 0.10)'; e.currentTarget.style.borderColor = 'var(--border-gold)' }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--bg-input)'; e.currentTarget.style.borderColor = 'var(--border-main)' }}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <form onSubmit={handleSend} className="space-y-3">
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-faint)' }}>
                Başlık <span style={{ color: 'var(--text-faint)' }}>({title.length}/120)</span>
              </label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={120}
                required
                placeholder="Örn: Yeni güncelleme yolda"
                className="w-full px-3 py-2 rounded-lg text-[13px] outline-none"
                style={{
                  background: 'var(--bg-input)',
                  border: '1px solid var(--border-main)',
                  color: 'var(--text-primary)',
                }}
                onFocus={(e) => e.currentTarget.style.borderColor = 'var(--border-gold-strong)'}
                onBlur={(e) => e.currentTarget.style.borderColor = 'var(--border-main)'}
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-faint)' }}>
                Mesaj <span style={{ color: 'var(--text-faint)' }}>({body.length}/500)</span>
              </label>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                maxLength={500}
                required
                rows={4}
                placeholder="Tüm kullanıcılara iletilecek mesaj…"
                className="w-full px-3 py-2 rounded-lg text-[13px] outline-none resize-y"
                style={{
                  background: 'var(--bg-input)',
                  border: '1px solid var(--border-main)',
                  color: 'var(--text-primary)',
                }}
                onFocus={(e) => e.currentTarget.style.borderColor = 'var(--border-gold-strong)'}
                onBlur={(e) => e.currentTarget.style.borderColor = 'var(--border-main)'}
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-faint)' }}>
                Yönlendirme Yolu (opsiyonel)
              </label>
              <input
                value={path}
                onChange={(e) => setPath(e.target.value)}
                placeholder="/site-haritasi"
                className="w-full px-3 py-2 rounded-lg text-[13px] outline-none font-mono"
                style={{
                  background: 'var(--bg-input)',
                  border: '1px solid var(--border-main)',
                  color: 'var(--text-secondary)',
                }}
                onFocus={(e) => e.currentTarget.style.borderColor = 'var(--border-gold-strong)'}
                onBlur={(e) => e.currentTarget.style.borderColor = 'var(--border-main)'}
              />
              <p className="text-[10.5px] mt-1" style={{ color: 'var(--text-faint)' }}>
                Kullanıcı bildirime tıklayınca açılacak sayfa.
              </p>
            </div>

            {error && (
              <div
                className="rounded-lg p-2.5 text-[12px] flex items-start gap-2"
                style={{ background: 'rgba(225, 29, 72, 0.08)', border: '1px solid rgba(225, 29, 72, 0.30)', color: 'var(--ember)' }}
              >
                <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {result && (
              <div
                className="rounded-lg p-3 text-[12px]"
                style={{
                  background: 'rgba(16, 185, 129, 0.08)',
                  border: '1px solid rgba(16, 185, 129, 0.30)',
                  color: 'var(--text-secondary)',
                }}
              >
                <div className="flex items-center gap-2 mb-1">
                  <CheckCircle2 className="w-3.5 h-3.5" style={{ color: 'var(--jade)' }} />
                  <strong style={{ color: 'var(--jade)' }}>Gönderildi</strong>
                </div>
                <div>{result.message}</div>
                {result.broadcast?.fcmStatus && (
                  <div className="text-[11px] mt-1" style={{ color: 'var(--text-faint)' }}>
                    FCM: <strong>{result.broadcast.fcmStatus}</strong>
                    {result.registeredDeviceCount != null && <> · Kayıtlı cihaz: <strong>{result.registeredDeviceCount}</strong></>}
                  </div>
                )}
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={onClose}
                className="px-3.5 py-2 rounded-lg text-[12.5px] font-semibold transition-colors"
                style={{ background: 'transparent', color: 'var(--text-muted)', border: '1px solid var(--border-main)' }}
                onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-hover)'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
              >
                Vazgeç
              </button>
              <button
                type="submit"
                disabled={sending || !title.trim() || !body.trim()}
                className="px-3.5 py-2 rounded-lg text-[12.5px] font-bold flex items-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                style={{
                  background: 'linear-gradient(135deg, var(--gold-300), var(--gold-500))',
                  color: '#1a1208',
                  border: '1px solid var(--border-gold-strong)',
                }}
              >
                {sending ? <Loader className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                {sending ? 'Gönderiliyor…' : 'Tüm kullanıcılara gönder'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
