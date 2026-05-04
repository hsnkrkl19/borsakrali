import { useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import {
  AlertCircle,
  ArrowRight,
  Check,
  Eye,
  EyeOff,
  Loader,
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
import { loginWithPassword, registerWithPassword } from '../services/auth'
import { useAuthStore } from '../store/authStore'
import { isPasswordValid } from '../utils/passwordPolicy'

function formatPhone(digits) {
  if (digits.length <= 3) return digits
  if (digits.length <= 6) return `${digits.slice(0, 3)} ${digits.slice(3)}`
  if (digits.length <= 8) return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`
  return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6, 8)} ${digits.slice(8, 10)}`
}

const BENEFITS = [
  {
    icon: TrendingUp,
    title: 'Canli BIST verisi',
    description: 'BIST hisselerini tek panelde hizli ve temiz sekilde takip edin.',
  },
  {
    icon: Zap,
    title: 'AI destekli analiz',
    description: 'Tarama ve yorum ekranlarinda yapay zeka destekli karar katmani.',
  },
  {
    icon: Shield,
    title: 'Guvenli auth altyapisi',
    description: 'Sifre degisiminde eski oturumlar otomatik olarak gecersiz olur.',
  },
]

export default function Register() {
  const navigate = useNavigate()
  const { login, isAuthenticated } = useAuthStore()
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

  if (isAuthenticated) {
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
    if (phoneDigits.length !== 10) return 'Telefon numarasi 10 haneli olmali'
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) return 'Gecerli bir e-posta adresi girin'
    if (!isPasswordValid(form.password)) return 'Sifre guvenlik kurallarini karsilamiyor'
    if (!passwordsMatch) return 'Sifre tekrar alani ayni olmali'
    if (!form.acceptTerms || !form.acceptPrivacy) return 'Devam etmek icin sozlesmeleri onaylamalisiniz'
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

      login(session.user, session.token)
      navigate('/')
    } catch (err) {
      setError(err.message || 'Kayit islemi basarisiz')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-dark-950">
      <div className="grid min-h-screen lg:grid-cols-[0.95fr_1.05fr]">
        <aside className="relative hidden overflow-hidden border-r border-gold-500/10 bg-[radial-gradient(circle_at_top_left,rgba(234,179,8,0.18),transparent_35%),radial-gradient(circle_at_bottom_right,rgba(245,158,11,0.16),transparent_30%),linear-gradient(180deg,#09090b_0%,#111217_100%)] p-12 lg:flex lg:flex-col">
          <div className="mb-12 flex items-center gap-3">
            <BrandMark size="lg" />
            <div>
              <div className="bg-gradient-to-r from-gold-300 to-gold-500 bg-clip-text text-3xl font-bold text-transparent">
                BORSA KRALI
              </div>
              <p className="text-sm text-gray-500">Canli analiz platformu</p>
            </div>
          </div>

          <div className="max-w-lg space-y-6">
            <div className="space-y-3">
              <div className="inline-flex items-center gap-2 rounded-full border border-gold-500/20 bg-gold-500/10 px-3 py-1 text-xs text-gold-300">
                Yeni uye kaydi
              </div>
              <h1 className="text-4xl font-bold leading-tight text-white">
                Kaydol, analiz ekranlarini ac ve hesabini guvenli sekilde yonet.
              </h1>
              <p className="text-base leading-7 text-gray-400">
                Kayit sonrasi oturumun otomatik acilir. Istersen daha sonra Ayarlar bolumunden
                sifreni degistirebilir, eski tum oturumlari tek hamlede kapatabilirsin.
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
            Yatirim tavsiyesi degildir. Yalnizca egitim amaclidir.
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
              <p className="mt-2 text-sm text-gray-400">Canli analiz platformu</p>
            </div>

            <div className="rounded-3xl border border-gold-500/20 bg-surface-100 p-6 shadow-premium sm:p-8">
              <div className="mb-6">
                <h2 className="text-2xl font-bold text-white">Hesap olustur</h2>
                <p className="mt-2 text-sm text-gray-400">
                  Bilgilerini eksiksiz gir, guclu bir sifre sec ve hemen kullanmaya basla.
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
                    placeholder="Yilmaz"
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
                  helperText="5 ile baslayan 10 haneli telefon numarasi"
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
                  label="Sifre"
                  value={form.password}
                  visible={showPassword}
                  onToggle={() => setShowPassword((prev) => !prev)}
                  onChange={(value) => updateField('password', value)}
                  placeholder="Guclu bir sifre belirleyin"
                  autoComplete="new-password"
                />

                <PasswordChecklist password={form.password} />

                <PasswordField
                  label="Sifre tekrar"
                  value={form.confirmPassword}
                  visible={showConfirmPassword}
                  onToggle={() => setShowConfirmPassword((prev) => !prev)}
                  onChange={(value) => updateField('confirmPassword', value)}
                  placeholder="Sifrenizi tekrar girin"
                  autoComplete="new-password"
                  invalid={Boolean(form.confirmPassword) && !passwordsMatch}
                  helperText={
                    form.confirmPassword && !passwordsMatch
                      ? 'Sifre tekrar alani ayni olmali'
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
                        Kullanim Kosullari
                      </Link>{' '}
                      metnini okudum ve onayliyorum.
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
                        Gizlilik Politikasi
                      </Link>{' '}
                      metnini okudum ve verilerimin bu kapsamda islenmesini kabul ediyorum.
                    </span>
                  </label>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-gold-500 to-gold-600 px-4 py-3.5 font-semibold text-dark-950 shadow-glow-gold transition-all hover:from-gold-400 hover:to-gold-500 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loading ? (
                    <>
                      <Loader className="h-4 w-4 animate-spin" />
                      Hesap olusturuluyor...
                    </>
                  ) : (
                    <>
                      Kayit ol
                      <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </button>
              </form>

              <div className="mt-6 rounded-2xl border border-green-500/20 bg-green-500/10 p-4">
                <div className="flex items-start gap-3">
                  <Check className="mt-0.5 h-5 w-5 flex-shrink-0 text-green-400" />
                  <p className="text-sm text-gray-200">
                    Hesabiniz olustuktan sonra dogrudan giris yapilir. Daha sonra Ayarlar ekranindan
                    sifrenizi guvenli sekilde degistirebilirsiniz.
                  </p>
                </div>
              </div>

              <p className="mt-6 text-center text-sm text-gray-400">
                Zaten hesabiniz var mi?{' '}
                <Link to="/login" className="font-medium text-gold-400 hover:text-gold-300">
                  Giris yap
                </Link>
              </p>
            </div>

            <p className="mt-6 text-center text-xs text-gray-600">
              Yatirim tavsiyesi degildir. Egitim amacli platformdur.
            </p>
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
          className="w-full rounded-2xl border border-gold-500/20 bg-dark-900/70 py-3 pl-11 pr-4 text-gray-100 placeholder:text-gray-500 focus:border-gold-500 focus:outline-none focus:ring-1 focus:ring-gold-500"
          required
        />
      </div>
      {helperText ? <p className="mt-2 text-xs text-gray-500">{helperText}</p> : null}
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
          className={`w-full rounded-2xl border bg-dark-900/70 py-3 pl-11 pr-12 text-gray-100 placeholder:text-gray-500 focus:outline-none focus:ring-1 ${
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
      {helperText ? (
        <p className={`mt-2 text-xs ${invalid ? 'text-red-300' : 'text-gray-500'}`}>{helperText}</p>
      ) : null}
    </div>
  )
}
