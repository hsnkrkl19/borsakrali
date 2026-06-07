import { useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import {
  AlertCircle,
  ArrowRight,
  Check,
  Eye,
  EyeOff,
  Lock,
  Mail,
  Phone,
  Shield,
  TrendingUp,
  User,
  Zap,
} from 'lucide-react'
import BrandMark from '../components/BrandMark'
import PasswordChecklist from '../components/PasswordChecklist'
import GoogleSignInButton from '../components/GoogleSignInButton'
import { loginWithPassword, registerWithPassword } from '../services/auth'
import { useAuthStore } from '../store/authStore'
import { isPasswordValid } from '../utils/passwordPolicy'
import { Button } from '../components/ui'

function formatPhone(digits) {
  if (digits.length <= 3) return digits
  if (digits.length <= 6) return `${digits.slice(0, 3)} ${digits.slice(3)}`
  if (digits.length <= 8) return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`
  return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6, 8)} ${digits.slice(8, 10)}`
}

const BENEFITS = [
  {
    icon: TrendingUp,
    title: 'Canlı BIST verisi',
    description: 'BIST hisselerini tek panelde hızlı ve temiz şekilde takip edin.',
  },
  {
    icon: Zap,
    title: 'AI destekli analiz',
    description: 'Tarama ve yorum ekranlarında yapay zeka destekli karar katmanı.',
  },
  {
    icon: Shield,
    title: 'Güvenli auth altyapısı',
    description: 'Şifre değişiminde eski oturumlar otomatik olarak geçersiz olur.',
  },
]

export default function Register() {
  const navigate = useNavigate()
  const { login, isAuthenticated, user } = useAuthStore()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    phone: '',
    email: '',
    password: '',
    confirmPassword: '',
    acceptTerms: false,
    acceptPrivacy: false,
  })

  // Misafir oturumdaki ziyaretçi gerçek hesap açabilsin diye kayıt sayfasına
  // erişimine izin ver; yalnızca gerçek kullanıcı yönlenir.
  if (isAuthenticated && !user?.isGuest) {
    return <Navigate to="/" replace />
  }

  const phoneDigits = form.phone.replace(/\D/g, '')
  const passwordsMatch = form.password === form.confirmPassword

  const updateField = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }))
    setError('')
  }

  const handlePhoneChange = (value) => {
    const raw = String(value || '').replace(/\D/g, '')
    if (raw && raw[0] !== '5') {
      return
    }

    updateField('phone', formatPhone(raw.slice(0, 10)))
  }

  const validate = () => {
    if (!form.firstName.trim()) return 'Ad gerekli'
    if (!form.lastName.trim()) return 'Soyad gerekli'
    if (phoneDigits.length !== 10) return 'Telefon numarası 10 haneli olmalı'
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) return 'Geçerli bir e-posta adresi girin'
    if (!isPasswordValid(form.password)) return 'Şifre güvenlik kurallarını karşılamıyor'
    if (!passwordsMatch) return 'Şifre tekrar alanı aynı olmalı'
    if (!form.acceptTerms || !form.acceptPrivacy) return 'Devam etmek için sözleşmeleri onaylamalısınız'
    return null
  }

  const handleSubmit = async (event) => {
    event.preventDefault()

    const validationError = validate()
    if (validationError) {
      setError(validationError)
      return
    }

    setLoading(true)
    setError('')

    try {
      await registerWithPassword({
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        phone: form.phone,
        email: form.email.trim(),
        password: form.password,
        acceptTerms: form.acceptTerms,
        acceptPrivacy: form.acceptPrivacy,
      })

      const session = await loginWithPassword({
        email: form.email.trim(),
        password: form.password,
      })

      login(session.user, session.token, session.refreshToken || null)
      navigate('/')
    } catch (err) {
      setError(err.message || 'Kayıt işlemi başarısız')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-dark-950">
      <div className="grid min-h-screen lg:grid-cols-[0.95fr_1.05fr]">
        <aside
          className="relative hidden overflow-hidden border-r border-gold-500/10 p-12 lg:flex lg:flex-col"
          style={{
            background:
              'radial-gradient(circle at top left, rgba(16,185,129,0.16), transparent 38%),' +
              'radial-gradient(circle at bottom right, rgba(5,150,105,0.13), transparent 33%),' +
              'linear-gradient(180deg, var(--bg-canvas) 0%, var(--bg-elevated) 100%)',
          }}
        >
          <div className="mb-12 flex items-center gap-3">
            <BrandMark size="lg" />
            <div>
              <div className="bg-gradient-to-r from-gold-300 to-gold-500 bg-clip-text text-3xl font-bold text-transparent">
                BORSA KRALI
              </div>
              <p className="text-sm text-gray-500">Canlı analiz platformu</p>
            </div>
          </div>

          <div className="max-w-lg space-y-6">
            <div className="space-y-3">
              <div className="inline-flex items-center gap-2 rounded-full border border-gold-500/20 bg-gold-500/10 px-3 py-1 text-xs text-gold-300">
                Yeni üye kaydı
              </div>
              <h1 className="text-4xl font-bold leading-tight text-white">
                Kaydol, analiz ekranlarını aç ve hesabını güvenli şekilde yönet.
              </h1>
              <p className="text-base leading-7 text-gray-400">
                Kayıt sonrası oturumun otomatik açılır. İstersen daha sonra Ayarlar bölümünden
                şifreni değiştirebilir, eski tüm oturumları tek hamlede kapatabilirsin.
              </p>
            </div>

            <div className="space-y-4">
              {BENEFITS.map(({ icon: Icon, title, description }) => (
                <div
                  key={title}
                  className="rounded-2xl border border-gold-500/15 bg-dark-900/60 p-4 backdrop-blur-sm"
                >
                  <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-gold-500/15">
                    <Icon className="h-5 w-5 text-gold-300" />
                  </div>
                  <div className="text-sm font-semibold text-white">{title}</div>
                  <p className="mt-1 text-sm text-gray-400">{description}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-auto text-xs text-gray-600">
            Yatırım tavsiyesi değildir. Yalnızca eğitim amaçlıdır.
          </div>
        </aside>

        <main className="flex items-center justify-center px-4 py-10 sm:px-6 lg:px-10">
          <div className="w-full max-w-xl">
            <div className="mb-8 text-center lg:hidden">
              <div className="mx-auto mb-4 flex justify-center">
                <BrandMark size="xl" />
              </div>
              <h1 className="bg-gradient-to-r from-gold-300 to-gold-500 bg-clip-text text-3xl font-bold text-transparent">
                BORSA KRALI
              </h1>
              <p className="mt-2 text-sm text-gray-400">Canlı analiz platformu</p>
            </div>

            <div className="rounded-3xl border border-gold-500/20 bg-surface-100 p-6 shadow-premium sm:p-8">
              <div className="mb-6">
                <h2 className="text-2xl font-bold text-white">Hesap oluştur</h2>
                <p className="mt-2 text-sm text-gray-400">
                  Bilgilerini eksiksiz gir, güçlü bir şifre seç ve hemen kullanmaya başla.
                </p>
              </div>

              {error ? (
                <div className="mb-5 flex items-center gap-2 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                  <AlertCircle className="h-4 w-4 flex-shrink-0" />
                  {error}
                </div>
              ) : null}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <InputField
                    label="Ad"
                    icon={User}
                    value={form.firstName}
                    onChange={(value) => updateField('firstName', value)}
                    placeholder="Ahmet"
                    autoComplete="given-name"
                  />
                  <InputField
                    label="Soyad"
                    icon={User}
                    value={form.lastName}
                    onChange={(value) => updateField('lastName', value)}
                    placeholder="Yılmaz"
                    autoComplete="family-name"
                  />
                </div>

                <InputField
                  label="Telefon"
                  icon={Phone}
                  value={form.phone}
                  onChange={handlePhoneChange}
                  placeholder="5XX XXX XX XX"
                  autoComplete="tel"
                  helperText="5 ile başlayan 10 haneli telefon numarası"
                />

                <InputField
                  label="E-posta"
                  icon={Mail}
                  value={form.email}
                  onChange={(value) => updateField('email', value)}
                  placeholder="ornek@email.com"
                  autoComplete="email"
                  type="email"
                />

                <PasswordField
                  label="Şifre"
                  value={form.password}
                  visible={showPassword}
                  onToggle={() => setShowPassword((prev) => !prev)}
                  onChange={(value) => updateField('password', value)}
                  placeholder="Güçlü bir şifre belirleyin"
                  autoComplete="new-password"
                />

                <PasswordChecklist password={form.password} />

                <PasswordField
                  label="Şifre tekrar"
                  value={form.confirmPassword}
                  visible={showConfirmPassword}
                  onToggle={() => setShowConfirmPassword((prev) => !prev)}
                  onChange={(value) => updateField('confirmPassword', value)}
                  placeholder="Şifrenizi tekrar girin"
                  autoComplete="new-password"
                  invalid={Boolean(form.confirmPassword) && !passwordsMatch}
                  helperText={
                    form.confirmPassword && !passwordsMatch
                      ? 'Şifre tekrar alanı aynı olmalı'
                      : ''
                  }
                />

                <div className="space-y-3 rounded-2xl border border-gold-500/15 bg-dark-900/60 p-4">
                  <label className="flex items-start gap-3 text-sm text-gray-300">
                    <input
                      type="checkbox"
                      checked={form.acceptTerms}
                      onChange={(event) => updateField('acceptTerms', event.target.checked)}
                      className="mt-1 h-4 w-4 rounded border-gold-500/30 bg-dark-950 text-gold-500 focus:ring-gold-500"
                    />
                    <span>
                      <Link to="/terms-of-use" className="text-gold-400 hover:text-gold-300">
                        Kullanım Koşulları
                      </Link>{' '}
                      metnini okudum ve onaylıyorum.
                    </span>
                  </label>

                  <label className="flex items-start gap-3 text-sm text-gray-300">
                    <input
                      type="checkbox"
                      checked={form.acceptPrivacy}
                      onChange={(event) => updateField('acceptPrivacy', event.target.checked)}
                      className="mt-1 h-4 w-4 rounded border-gold-500/30 bg-dark-950 text-gold-500 focus:ring-gold-500"
                    />
                    <span>
                      <Link to="/privacy-policy" className="text-gold-400 hover:text-gold-300">
                        Gizlilik Politikası
                      </Link>{' '}
                      metnini okudum ve verilerimin bu kapsamda işlenmesini kabul ediyorum.
                    </span>
                  </label>
                </div>

                <Button type="submit" variant="gold" size="lg" block loading={loading} iconRight={ArrowRight}>
                  {loading ? 'Hesap oluşturuluyor…' : 'Kayıt ol'}
                </Button>
              </form>

              {/* Divider + Google */}
              <div className="relative my-5">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full divider-gold" />
                </div>
                <div className="relative flex justify-center">
                  <span className="px-3 text-[10px] uppercase tracking-[0.22em] font-bold text-gold-400/70 bg-[var(--bg-card)]">
                    veya
                  </span>
                </div>
              </div>

              <GoogleSignInButton
                onError={(msg) => setError(msg)}
                redirectTo="/"
                label="Google ile kayıt ol"
              />

              <div className="mt-6 rounded-2xl border border-green-500/20 bg-green-500/10 p-4">
                <div className="flex items-start gap-3">
                  <Check className="mt-0.5 h-5 w-5 flex-shrink-0 text-green-400" />
                  <p className="text-sm text-gray-200">
                    Hesabınız oluştuktan sonra doğrudan giriş yapılır. Daha sonra Ayarlar ekranından
                    şifrenizi güvenli şekilde değiştirebilirsiniz.
                  </p>
                </div>
              </div>

              <p className="mt-6 text-center text-sm text-gray-400">
                Zaten hesabınız var mı?{' '}
                <Link to="/login" className="font-medium text-gold-400 hover:text-gold-300">
                  Giriş yap
                </Link>
              </p>
            </div>

            <p className="mt-6 text-center text-xs text-gray-600">
              Yatırım tavsiyesi değildir. Eğitim amaçlı platformdur.
            </p>

            <div className="mt-3 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[10px] text-gray-600">
              <Link to="/hakkimizda" className="hover:text-gold-400">Hakkımızda</Link>
              <span>·</span>
              <Link to="/iletisim" className="hover:text-gold-400">İletişim</Link>
              <span>·</span>
              <Link to="/privacy-policy" className="hover:text-gold-400">Gizlilik</Link>
              <span>·</span>
              <Link to="/terms-of-use" className="hover:text-gold-400">Kullanım Koşulları</Link>
              <span>·</span>
              <Link to="/account-deletion" className="hover:text-gold-400">Hesap Silme</Link>
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}

function InputField({
  label,
  icon: Icon,
  value,
  onChange,
  placeholder,
  autoComplete,
  helperText = '',
  type = 'text',
}) {
  return (
    <div>
      <label className="mb-2 block text-sm text-gray-400">{label}</label>
      <div className="relative">
        <Icon className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
        <input
          type={type}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          className="input-premium pl-11"
          required
        />
      </div>
      {helperText ? <p className="mt-2 text-xs" style={{ color: 'var(--text-faint)' }}>{helperText}</p> : null}
    </div>
  )
}

function PasswordField({
  label,
  value,
  visible,
  onToggle,
  onChange,
  placeholder,
  autoComplete,
  invalid = false,
  helperText = '',
}) {
  return (
    <div>
      <label className="mb-2 block text-sm text-gray-400">{label}</label>
      <div className="relative">
        <Lock className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
        <input
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          className="input-premium pl-11 pr-12"
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
      {helperText ? (
        <p className={`mt-2 text-xs ${invalid ? 'text-red-300' : 'text-gray-500'}`}>{helperText}</p>
      ) : null}
    </div>
  )
}
