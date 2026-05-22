import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  ShieldCheck,
} from 'lucide-react'
import PasswordChecklist from '../components/PasswordChecklist'
import { changePassword } from '../services/auth'
import { useAuthStore } from '../store/authStore'
import { isPasswordValid } from '../utils/passwordPolicy'
import { Button } from '../components/ui'

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
      setError('Yeni şifre ve tekrar alanı aynı olmalı')
      return
    }

    if (!isPasswordValid(form.newPassword)) {
      setError('Yeni şifre güvenlik kurallarını karşılamıyor')
      return
    }

    if (form.currentPassword === form.newPassword) {
      setError('Yeni şifre mevcut şifre ile aynı olamaz')
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
      setSuccess(result.message || 'Şifreniz başarıyla değiştirildi')
      setForm({
        currentPassword: '',
        newPassword: '',
        confirmPassword: '',
      })
    } catch (err) {
      setError(err.message || 'Şifre değiştirme işlemi başarısız')
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
              Güvenlik merkezi
            </div>
            <h1 className="text-2xl font-bold text-white">Şifre Değiştir</h1>
            <p className="max-w-xl text-sm text-gray-400">
              Hesabınızın güvenliğini korumak için mevcut şifrenizi doğrulayıp yeni şifre belirleyin.
              Şifre değiştiğinde eski oturumlar otomatik olarak geçersiz olur.
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
          <h2 className="mb-1 text-xl font-semibold text-white">Yeni şifre belirle</h2>
          <p className="mb-6 text-sm text-gray-400">
            Yeni şifreniz en az 8 karakter olmalı ve büyük harf, küçük harf, rakam içermeli.
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
              label="Mevcut şifre"
              placeholder="Mevcut şifrenizi girin"
              value={form.currentPassword}
              visible={showCurrent}
              onToggle={() => setShowCurrent((prev) => !prev)}
              onChange={(value) => updateField('currentPassword', value)}
              autoComplete="current-password"
            />

            <PasswordField
              label="Yeni şifre"
              placeholder="Yeni şifrenizi girin"
              value={form.newPassword}
              visible={showNext}
              onToggle={() => setShowNext((prev) => !prev)}
              onChange={(value) => updateField('newPassword', value)}
              autoComplete="new-password"
            />

            <PasswordChecklist password={form.newPassword} />

            <PasswordField
              label="Yeni şifre tekrar"
              placeholder="Yeni şifrenizi tekrar girin"
              value={form.confirmPassword}
              visible={showConfirm}
              onToggle={() => setShowConfirm((prev) => !prev)}
              onChange={(value) => updateField('confirmPassword', value)}
              autoComplete="new-password"
              invalid={Boolean(form.confirmPassword) && !passwordsMatch}
              hint={
                form.confirmPassword && !passwordsMatch
                  ? 'Tekrar alanı yeni şifre ile aynı olmalı'
                  : ''
              }
            />

            <Button type="submit" variant="gold" size="lg" block loading={loading} iconRight={ArrowRight} disabled={!canSubmit}>
              {loading ? 'Güncelleniyor…' : 'Şifreyi Güncelle'}
            </Button>
          </form>
        </div>

        <div className="space-y-4">
          <div className="rounded-3xl border border-gold-500/20 bg-dark-900/80 p-5">
            <div className="mb-3 flex items-center gap-3">
              <div className="rounded-2xl bg-gold-500/15 p-3">
                <KeyRound className="h-5 w-5 text-gold-300" />
              </div>
              <div>
                <h2 className="font-semibold text-white">Güvenlik Notları</h2>
                <p className="text-xs text-gray-500">Canlı kullanım için önerilen adımlar</p>
              </div>
            </div>

            <div className="space-y-3 text-sm text-gray-300">
              <div className="rounded-2xl border border-dark-700 bg-dark-800/80 p-3">
                Aynı şifreyi farklı platformlarda tekrar kullanmayın.
              </div>
              <div className="rounded-2xl border border-dark-700 bg-dark-800/80 p-3">
                Şifre değiştiğinde diğer cihazlardaki önceki oturumlar otomatik olarak kapanır.
              </div>
              <div className="rounded-2xl border border-dark-700 bg-dark-800/80 p-3">
                Ortak cihaz kullanıyorsanız işlemden sonra çıkış yapmanız tavsiye edilir.
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-gold-500/20 bg-surface-100 p-5">
            <h2 className="font-semibold text-white">Hızlı erişim</h2>
            <div className="mt-4 space-y-3">
              <Link
                to="/ayarlar"
                className="flex items-center justify-between rounded-2xl border border-gold-500/10 bg-dark-900/60 px-4 py-3 text-sm text-gray-300 transition-colors hover:border-gold-500/30 hover:text-white"
              >
                Ayarlar sayfasına dön
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
          className="input-premium pr-12"
          style={invalid ? { borderColor: 'var(--ember)' } : undefined}
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
