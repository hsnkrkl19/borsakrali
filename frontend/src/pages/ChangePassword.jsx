import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  Loader,
  ShieldCheck,
} from 'lucide-react'
import PasswordChecklist from '../components/PasswordChecklist'
import { changePassword } from '../services/auth'
import { useAuthStore } from '../store/authStore'
import { isPasswordValid } from '../utils/passwordPolicy'

export default function ChangePassword() {
  const { user, token, login } = useAuthStore()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [showCurrent, setShowCurrent] = useState(false)
  const [showNext, setShowNext] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [form, setForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  })

  const passwordsMatch = form.newPassword === form.confirmPassword
  const canSubmit = useMemo(() => {
    return (
      form.currentPassword &&
      form.newPassword &&
      form.confirmPassword &&
      passwordsMatch &&
      isPasswordValid(form.newPassword) &&
      form.currentPassword !== form.newPassword
    )
  }, [form, passwordsMatch])

  const updateField = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }))
    setError('')
    setSuccess('')
  }

  const handleSubmit = async (event) => {
    event.preventDefault()

    if (!passwordsMatch) {
      setError('Yeni sifre ve tekrar alani ayni olmali')
      return
    }

    if (!isPasswordValid(form.newPassword)) {
      setError('Yeni sifre guvenlik kurallarini karsilamiyor')
      return
    }

    if (form.currentPassword === form.newPassword) {
      setError('Yeni sifre mevcut sifre ile ayni olamaz')
      return
    }

    setLoading(true)
    setError('')
    setSuccess('')

    try {
      const result = await changePassword(
        {
          currentPassword: form.currentPassword,
          newPassword: form.newPassword,
        },
        token
      )

      login(result.user, result.token)
      setSuccess(result.message || 'Sifreniz basariyla degistirildi')
      setForm({
        currentPassword: '',
        newPassword: '',
        confirmPassword: '',
      })
    } catch (err) {
      setError(err.message || 'Sifre degistirme islemi basarisiz')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="rounded-3xl border border-gold-500/20 bg-gradient-to-br from-dark-900 via-surface-100 to-dark-950 p-6 shadow-premium">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full border border-gold-500/20 bg-gold-500/10 px-3 py-1 text-xs text-gold-300">
              <ShieldCheck className="h-4 w-4" />
              Guvenlik merkezi
            </div>
            <h1 className="text-2xl font-bold text-white">Sifre Degistir</h1>
            <p className="max-w-xl text-sm text-gray-400">
              Hesabinizin guvenligini korumak icin mevcut sifrenizi dogrulayip yeni sifre belirleyin.
              Sifre degistiginde eski oturumlar otomatik olarak gecersiz olur.
            </p>
          </div>

          <div className="rounded-2xl border border-gold-500/10 bg-dark-900/70 p-4 text-sm text-gray-300">
            <div className="text-xs uppercase tracking-[0.2em] text-gray-500">Hesap</div>
            <div className="mt-2 font-semibold text-white">
              {user?.firstName} {user?.lastName}
            </div>
            <div className="text-xs text-gold-300">{user?.email}</div>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(280px,0.9fr)]">
        <div className="rounded-3xl border border-gold-500/20 bg-surface-100 p-6 shadow-premium">
          <h2 className="mb-1 text-xl font-semibold text-white">Yeni sifre belirle</h2>
          <p className="mb-6 text-sm text-gray-400">
            Yeni sifreniz en az 8 karakter olmali ve buyuk harf, kucuk harf, rakam icermeli.
          </p>

          {error && (
            <div className="mb-4 flex items-center gap-2 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              {error}
            </div>
          )}

          {success && (
            <div className="mb-4 flex items-center gap-2 rounded-2xl border border-green-500/30 bg-green-500/10 px-4 py-3 text-sm text-green-300">
              <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
              {success}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <PasswordField
              label="Mevcut sifre"
              placeholder="Mevcut sifrenizi girin"
              value={form.currentPassword}
              visible={showCurrent}
              onToggle={() => setShowCurrent((prev) => !prev)}
              onChange={(value) => updateField('currentPassword', value)}
              autoComplete="current-password"
            />

            <PasswordField
              label="Yeni sifre"
              placeholder="Yeni sifrenizi girin"
              value={form.newPassword}
              visible={showNext}
              onToggle={() => setShowNext((prev) => !prev)}
              onChange={(value) => updateField('newPassword', value)}
              autoComplete="new-password"
            />

            <PasswordChecklist password={form.newPassword} />

            <PasswordField
              label="Yeni sifre tekrar"
              placeholder="Yeni sifrenizi tekrar girin"
              value={form.confirmPassword}
              visible={showConfirm}
              onToggle={() => setShowConfirm((prev) => !prev)}
              onChange={(value) => updateField('confirmPassword', value)}
              autoComplete="new-password"
              invalid={Boolean(form.confirmPassword) && !passwordsMatch}
              hint={
                form.confirmPassword && !passwordsMatch
                  ? 'Tekrar alani yeni sifre ile ayni olmali'
                  : ''
              }
            />

            <button
              type="submit"
              disabled={loading || !canSubmit}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-gold-500 to-gold-600 px-4 py-3.5 font-semibold text-dark-950 shadow-glow-gold transition-all hover:from-gold-400 hover:to-gold-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? (
                <>
                  <Loader className="h-4 w-4 animate-spin" />
                  Guncelleniyor...
                </>
              ) : (
                <>
                  Sifreyi Guncelle
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </form>
        </div>

        <div className="space-y-4">
          <div className="rounded-3xl border border-gold-500/20 bg-dark-900/80 p-5">
            <div className="mb-3 flex items-center gap-3">
              <div className="rounded-2xl bg-gold-500/15 p-3">
                <KeyRound className="h-5 w-5 text-gold-300" />
              </div>
              <div>
                <h2 className="font-semibold text-white">Guvenlik Notlari</h2>
                <p className="text-xs text-gray-500">Canli kullanim icin onerilen adimlar</p>
              </div>
            </div>

            <div className="space-y-3 text-sm text-gray-300">
              <div className="rounded-2xl border border-dark-700 bg-dark-800/80 p-3">
                Ayni sifreyi farkli platformlarda tekrar kullanmayin.
              </div>
              <div className="rounded-2xl border border-dark-700 bg-dark-800/80 p-3">
                Sifre degistiginde diger cihazlardaki onceki oturumlar otomatik olarak kapanir.
              </div>
              <div className="rounded-2xl border border-dark-700 bg-dark-800/80 p-3">
                Ortak cihaz kullaniyorsaniz islemden sonra cikis yapmaniz tavsiye edilir.
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-gold-500/20 bg-surface-100 p-5">
            <h2 className="font-semibold text-white">Hizli erisim</h2>
            <div className="mt-4 space-y-3">
              <Link
                to="/ayarlar"
                className="flex items-center justify-between rounded-2xl border border-gold-500/10 bg-dark-900/60 px-4 py-3 text-sm text-gray-300 transition-colors hover:border-gold-500/30 hover:text-white"
              >
                Ayarlar sayfasina don
                <ArrowRight className="h-4 w-4 text-gold-300" />
              </Link>
              <Link
                to="/account-deletion"
                className="flex items-center justify-between rounded-2xl border border-gold-500/10 bg-dark-900/60 px-4 py-3 text-sm text-gray-300 transition-colors hover:border-gold-500/30 hover:text-white"
              >
                Hesap silme talepleri
                <ArrowRight className="h-4 w-4 text-gold-300" />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function PasswordField({
  label,
  placeholder,
  value,
  visible,
  onToggle,
  onChange,
  autoComplete,
  invalid = false,
  hint = '',
}) {
  return (
    <div>
      <label className="mb-2 block text-sm text-gray-400">{label}</label>
      <div className="relative">
        <input
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          className={`w-full rounded-2xl border bg-dark-900/70 px-4 py-3 pr-12 text-gray-100 placeholder:text-gray-500 focus:outline-none focus:ring-1 ${
            invalid
              ? 'border-red-500/40 focus:border-red-500 focus:ring-red-500'
              : 'border-gold-500/20 focus:border-gold-500 focus:ring-gold-500'
          }`}
          required
        />
        <button
          type="button"
          onClick={onToggle}
          className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1 text-gray-400 transition-colors hover:text-white"
        >
          {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
      {hint ? <p className="mt-2 text-xs text-red-300">{hint}</p> : null}
    </div>
  )
}
