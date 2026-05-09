import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Mail, MessageSquare, Send, CheckCircle2, AlertCircle, Globe, Clock } from 'lucide-react'
import BrandMark from '../components/BrandMark'

const SUPPORT_EMAIL = 'destek@borsakrali.com'

export default function Iletisim() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [subject, setSubject] = useState('Genel')
  const [message, setMessage] = useState('')
  const [status, setStatus] = useState('idle') // idle | sending | sent | error
  const [errorMsg, setErrorMsg] = useState('')

  const handleSubmit = (e) => {
    e.preventDefault()
    setStatus('sending')
    setErrorMsg('')

    if (!name.trim() || !email.trim() || !message.trim()) {
      setStatus('error')
      setErrorMsg('Lutfen ad, e-posta ve mesaj alanlarini doldurun.')
      return
    }

    try {
      const body = `Ad Soyad: ${name}\nE-posta: ${email}\nKonu: ${subject}\n\n${message}`
      const mailto = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('[Iletisim] ' + subject)}&body=${encodeURIComponent(body)}`
      window.location.href = mailto
      setStatus('sent')
      setMessage('')
    } catch (err) {
      setStatus('error')
      setErrorMsg('Mesaj gonderilemedi. Lutfen dogrudan ' + SUPPORT_EMAIL + ' adresine yazin.')
    }
  }

  return (
    <div className="min-h-screen bg-dark-950 px-4 py-10">
      <div className="mx-auto max-w-4xl">
        <div className="mb-8 flex items-center justify-between gap-4">
          <Link to="/" className="inline-flex items-center gap-3 text-sm text-gold-400 hover:text-gold-300">
            <BrandMark size="sm" />
            Borsa Krali
          </Link>
          <div className="flex flex-wrap gap-4 text-sm">
            <Link to="/hakkimizda" className="text-gray-400 hover:text-white">Hakkimizda</Link>
            <Link to="/privacy-policy" className="text-gray-400 hover:text-white">Gizlilik</Link>
            <Link to="/terms-of-use" className="text-gray-400 hover:text-white">Kullanim Kosullari</Link>
          </div>
        </div>

        <div className="rounded-3xl border border-gold-500/20 bg-surface-100 p-6 md:p-8 shadow-premium">
          <div className="mb-8 space-y-3">
            <p className="text-sm font-medium text-gold-400">Iletisim</p>
            <h1 className="text-3xl font-bold text-white">Bize Ulasin</h1>
            <p className="max-w-3xl text-sm leading-7 text-gray-300">
              Sorulariniz, oneriler, hata bildirimleri ve is birligi talepleri icin bize asagidaki formdan
              veya dogrudan e-posta yoluyla ulasabilirsiniz. Tum mesajlar 1-2 is gunu icinde yanitlanir.
            </p>
          </div>

          <div className="mb-6 grid gap-4 md:grid-cols-3">
            <div className="rounded-2xl border border-white/5 bg-dark-900/40 p-5">
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-gold-500/15 text-gold-400">
                <Mail className="h-5 w-5" />
              </div>
              <h2 className="mb-1 text-sm font-semibold text-white">E-posta</h2>
              <a href={`mailto:${SUPPORT_EMAIL}`} className="text-sm text-gold-400 hover:underline">
                {SUPPORT_EMAIL}
              </a>
            </div>

            <div className="rounded-2xl border border-white/5 bg-dark-900/40 p-5">
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-gold-500/15 text-gold-400">
                <Globe className="h-5 w-5" />
              </div>
              <h2 className="mb-1 text-sm font-semibold text-white">Web</h2>
              <p className="text-sm text-gray-300">borsakrali.com</p>
            </div>

            <div className="rounded-2xl border border-white/5 bg-dark-900/40 p-5">
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-gold-500/15 text-gold-400">
                <Clock className="h-5 w-5" />
              </div>
              <h2 className="mb-1 text-sm font-semibold text-white">Cevap Suresi</h2>
              <p className="text-sm text-gray-300">1-2 is gunu</p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm text-gray-300">Ad Soyad</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-2xl border border-gold-500/20 bg-dark-900/40 px-4 py-3 text-white outline-none transition focus:border-gold-500"
                  placeholder="Adiniz Soyadiniz"
                  required
                />
              </div>
              <div>
                <label className="mb-2 block text-sm text-gray-300">E-posta</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-2xl border border-gold-500/20 bg-dark-900/40 px-4 py-3 text-white outline-none transition focus:border-gold-500"
                  placeholder="ornek@mail.com"
                  required
                />
              </div>
            </div>

            <div>
              <label className="mb-2 block text-sm text-gray-300">Konu</label>
              <select
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="w-full rounded-2xl border border-gold-500/20 bg-dark-900/40 px-4 py-3 text-white outline-none transition focus:border-gold-500"
              >
                <option>Genel</option>
                <option>Hata Bildirimi</option>
                <option>Ozellik Onerisi</option>
                <option>Abonelik / Odeme</option>
                <option>Reklam / Is Birligi</option>
                <option>KVKK / Gizlilik</option>
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm text-gray-300">Mesajiniz</label>
              <textarea
                rows={6}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className="w-full rounded-2xl border border-gold-500/20 bg-dark-900/40 px-4 py-3 text-white outline-none transition focus:border-gold-500"
                placeholder="Bize iletmek istediginiz konuyu kisa ve acik sekilde yazin..."
                required
              />
            </div>

            {status === 'error' && (
              <div className="flex items-start gap-2 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            {status === 'sent' && (
              <div className="flex items-start gap-2 rounded-2xl border border-green-500/30 bg-green-500/10 px-4 py-3 text-sm text-green-300">
                <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0" />
                <span>E-posta uygulamaniz acildi. Mesaji gondermeyi unutmayin.</span>
              </div>
            )}

            <button
              type="submit"
              disabled={status === 'sending'}
              className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-gold-500 to-gold-600 px-4 py-3 font-semibold text-dark-950 transition hover:from-gold-400 hover:to-gold-500 disabled:opacity-60"
            >
              {status === 'sending' ? (
                <>
                  <Send className="h-4 w-4 animate-pulse" /> Gonderiliyor...
                </>
              ) : (
                <>
                  <MessageSquare className="h-4 w-4" /> Mesaj Gonder
                </>
              )}
            </button>

            <p className="text-center text-xs text-gray-500">
              Form gonderildiginde varsayilan e-posta uygulamaniz acilir. Sorun yasarsaniz dogrudan{' '}
              <a href={`mailto:${SUPPORT_EMAIL}`} className="text-gold-400 hover:underline">
                {SUPPORT_EMAIL}
              </a>{' '}
              adresine yazabilirsiniz.
            </p>
          </form>

          <p className="mt-8 text-xs text-gray-500">Son guncelleme: 9 Mayis 2026</p>
        </div>
      </div>
    </div>
  )
}
