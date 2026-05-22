import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { BellRing, Send, ShieldCheck, Smartphone, Loader, CheckCircle2, AlertTriangle } from 'lucide-react'
import { useAuthStore } from '../store/authStore'
import { fetchAdminNotificationSummary, sendBroadcastNotification } from '../services/adminNotifications'

const DEFAULT_PATH = '/gunluk-tespitler'

export default function AdminBildirimler() {
  const { user, token } = useAuthStore()
  const [summary, setSummary] = useState(null)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [targetPath, setTargetPath] = useState(DEFAULT_PATH)
  const [loadingSummary, setLoadingSummary] = useState(true)
  const [sending, setSending] = useState(false)
  const [feedback, setFeedback] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (user?.role !== 'admin' || !token) {
      setLoadingSummary(false)
      return
    }

    let active = true

    const loadSummary = async () => {
      setLoadingSummary(true)
      setError('')

      try {
        const data = await fetchAdminNotificationSummary(token)
        if (active) {
          setSummary(data)
        }
      } catch (err) {
        if (active) {
          setError(err.message || 'Bildirim özeti alınamadı')
        }
      } finally {
        if (active) {
          setLoadingSummary(false)
        }
      }
    }

    loadSummary()

    return () => {
      active = false
    }
  }, [token, user?.role])

  if (user?.role !== 'admin') {
    return <Navigate to="/" replace />
  }

  const handleSend = async (event) => {
    event.preventDefault()
    setSending(true)
    setError('')
    setFeedback('')

    try {
      const data = await sendBroadcastNotification({
        title,
        body,
        path: targetPath,
      }, token)

      setFeedback(data.message || 'Bildirim gönderildi')
      setTitle('')
      setBody('')

      const refreshed = await fetchAdminNotificationSummary(token)
      setSummary(refreshed)
    } catch (err) {
      setError(err.message || 'Bildirim gönderilemedi')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Admin Bildirim Merkezi</h1>
          <p className="text-sm text-gray-400 mt-1">
            Buradan uygulama kapalı olsa bile tüm kurulu cihazlara FCM bildirimi gönderebilirsiniz.
          </p>
        </div>
        <div className="px-3 py-2 rounded-xl bg-green-500/10 border border-green-500/30 text-green-400 text-sm flex items-center gap-2">
          <ShieldCheck className="w-4 h-4" />
          Admin aktif
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="card border-gold-500/20">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-gold-500/15 flex items-center justify-center">
              <Smartphone className="w-5 h-5 text-gold-400" />
            </div>
            <div>
              <div className="text-xs text-gray-500">Kayıtlı cihaz</div>
              <div className="text-2xl font-bold text-white">
                {loadingSummary ? '...' : summary?.registeredDeviceCount ?? 0}
              </div>
            </div>
          </div>
        </div>

        <div className="card border-gold-500/20">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-blue-500/15 flex items-center justify-center">
              <BellRing className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <div className="text-xs text-gray-500">Yayın konusu</div>
              <div className="text-sm font-semibold text-white break-all">
                {loadingSummary ? 'Yükleniyor' : summary?.topic || 'Yok'}
              </div>
            </div>
          </div>
        </div>

        <div className="card border-gold-500/20">
          <div className="flex items-center gap-3">
            <div className={`w-11 h-11 rounded-2xl flex items-center justify-center ${
              summary?.configured ? 'bg-green-500/15' : 'bg-amber-500/15'
            }`}>
              {summary?.configured ? (
                <CheckCircle2 className="w-5 h-5 text-green-400" />
              ) : (
                <AlertTriangle className="w-5 h-5 text-amber-400" />
              )}
            </div>
            <div>
              <div className="text-xs text-gray-500">Firebase durumu</div>
              <div className="text-sm font-semibold text-white">
                {loadingSummary ? 'Kontrol ediliyor' : summary?.configured ? 'Hazır' : 'Eksik'}
              </div>
            </div>
          </div>
        </div>
      </div>

      {summary && (
        <div className={`rounded-2xl border p-4 ${
          summary.configured
            ? 'bg-green-500/5 border-green-500/20'
            : 'bg-amber-500/5 border-amber-500/20'
        }`}>
          <p className={`text-sm ${summary.configured ? 'text-green-300' : 'text-amber-300'}`}>
            {summary.configurationMessage}
          </p>
          {!summary.configured && (
            <p className="text-xs text-amber-200/80 mt-2">
              Push bildiriminin çalışması için Render env tarafında Firebase service account eklenmeli ve
              Android uygulamaya google-services.json dosyası konulmalıdır.
            </p>
          )}
        </div>
      )}

      <div className="card border-gold-500/20">
        <h2 className="text-lg font-semibold text-white mb-4">Toplu Bildirim Gönder</h2>

        <form onSubmit={handleSend} className="space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-2">Bildirim başlığı</label>
            <input
              className="input w-full"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Örnek: Yeni analiz yayında"
              maxLength={120}
              required
            />
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-2">Bildirim mesajı</label>
            <textarea
              className="input w-full min-h-[120px] resize-y"
              value={body}
              onChange={(event) => setBody(event.target.value)}
              placeholder="Örnek: EMA34 tarayıcıya yeni sinyaller eklendi. Uygulamayı açıp inceleyebilirsiniz."
              maxLength={500}
              required
            />
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-2">Tıklanınca açılacak yol</label>
            <input
              className="input w-full"
              value={targetPath}
              onChange={(event) => setTargetPath(event.target.value)}
              placeholder="/gunluk-tespitler"
            />
            <p className="text-xs text-gray-500 mt-2">
              Uygulama açıldığında gidilecek sayfa. Örnek: <span className="text-gold-400">/pro-analiz</span>
            </p>
          </div>

          {feedback && (
            <div className="rounded-xl border border-green-500/30 bg-green-500/10 px-4 py-3 text-sm text-green-300">
              {feedback}
            </div>
          )}

          {error && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={sending || loadingSummary || !summary?.configured}
            className="w-full md:w-auto px-5 py-3 rounded-xl bg-gradient-to-r from-gold-500 to-gold-600 text-dark-950 font-semibold flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {sending ? <Loader className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            Bildirimi Gönder
          </button>
        </form>
      </div>

      {summary?.lastBroadcast && (
        <div className="card border-gold-500/20">
          <h2 className="text-lg font-semibold text-white mb-3">Son gönderim</h2>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between gap-4">
              <span className="text-gray-400">Başlık</span>
              <span className="text-white text-right">{summary.lastBroadcast.title}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-gray-400">Mesaj</span>
              <span className="text-white text-right">{summary.lastBroadcast.body}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-gray-400">Yönlendirme</span>
              <span className="text-gold-400 text-right">{summary.lastBroadcast.path || '-'}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-gray-400">Gönderen</span>
              <span className="text-white text-right">{summary.lastBroadcast.sentBy || '-'}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
