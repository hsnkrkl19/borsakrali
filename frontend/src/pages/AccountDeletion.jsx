import { useState } from 'react'
import { Link } from 'react-router-dom'
import BrandMark from '../components/BrandMark'
import { getApiBase } from '../config'

const API_BASE = getApiBase() + '/api'

export default function AccountDeletion() {
  const [email, setEmail] = useState('')
  const [note, setNote] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    setMessage('')

    try {
      const response = await fetch(`${API_BASE}/auth/account-deletion-request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, note })
      })

      const data = await response.json()
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Talep gonderilemedi')
      }

      setMessage(data.message || 'Talebiniz alindi')
      setEmail('')
      setNote('')
    } catch (err) {
      setError(err.message || 'Talep gonderilemedi')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-dark-950 px-4 py-10">
      <div className="mx-auto max-w-3xl">
        <div className="mb-8 flex items-center justify-between gap-4">
          <Link to="/login" className="inline-flex items-center gap-3 text-sm text-gold-400 hover:text-gold-300">
            <BrandMark size="sm" />
            Borsa Krali
          </Link>
          <div className="flex gap-4 text-sm">
            <Link to="/privacy-policy" className="text-gray-400 hover:text-white">Gizlilik</Link>
            <Link to="/terms-of-use" className="text-gray-400 hover:text-white">Kullanim Kosullari</Link>
          </div>
        </div>

        <div className="rounded-3xl border border-gold-500/20 bg-surface-100 p-6 md:p-8 shadow-premium">
          <p className="text-sm font-medium text-gold-400">Hesap Silme</p>
          <h1 className="mt-3 text-3xl font-bold text-white">Veri silme talebi olustur</h1>
          <p className="mt-3 text-sm leading-6 text-gray-400">
            Uygulama icinde giris yapabilen kullanicilar, Ayarlar ekranindan hesaplarini dogrudan silebilir.
            Uygulamaya erisemiyorsaniz asagidaki form ile hesap silme talebi iletebilirsiniz.
          </p>

          <form onSubmit={handleSubmit} className="mt-8 space-y-4">
            <div>
              <label className="mb-2 block text-sm text-gray-300">Hesap e-postasi</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-2xl border border-gold-500/20 bg-dark-900/40 px-4 py-3 text-white outline-none transition focus:border-gold-500"
                placeholder="ornek@borsakrali.com"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm text-gray-300">Ek not (opsiyonel)</label>
              <textarea
                rows={4}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="w-full rounded-2xl border border-gold-500/20 bg-dark-900/40 px-4 py-3 text-white outline-none transition focus:border-gold-500"
                placeholder="Hesap silme talebinizle ilgili ek bilgi"
              />
            </div>

            {error && (
              <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                {error}
              </div>
            )}

            {message && (
              <div className="rounded-2xl border border-green-500/30 bg-green-500/10 px-4 py-3 text-sm text-green-300">
                {message}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-2xl bg-gradient-to-r from-gold-500 to-gold-600 px-4 py-3 font-semibold text-dark-950 transition hover:from-gold-400 hover:to-gold-500 disabled:opacity-60"
            >
              {loading ? 'Gonderiliyor...' : 'Hesap silme talebini gonder'}
            </button>
          </form>

          <div className="mt-8 rounded-2xl border border-white/5 bg-dark-900/40 p-5">
            <h2 className="text-lg font-semibold text-white">Ne silinir?</h2>
            <p className="mt-2 text-sm leading-6 text-gray-300">
              Hesap silme islemi tamamlandiginda kimlik dogrulama ve hesap kayitlari sistemden kaldirilir.
              Guvenlik, dolandiricilik onleme veya hukuki yukumluluk sebebiyle tutulmasi gereken sinirli kayitlar
              gerekli sure boyunca saklanabilir.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
