import { useNavigate, Link, Navigate } from 'react-router-dom'
import { useState } from 'react'
import { useAuthStore } from '../store/authStore'
import { Crown, User, Phone, Mail, Lock, Eye, EyeOff, ArrowRight, Check, AlertCircle, Loader, TrendingUp, BarChart3, Zap, Shield } from 'lucide-react'
import { loginWithPassword, registerWithPassword } from '../services/auth'

function formatPhone(digits) {
  if (digits.length <= 3) return digits
  if (digits.length <= 6) return `${digits.slice(0, 3)} ${digits.slice(3)}`
  if (digits.length <= 8) return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`
  return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6, 8)} ${digits.slice(8)}`
}

export default function Register() {
  const navigate = useNavigate()
  const { login, isAuthenticated } = useAuthStore()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)

  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    phone: '',
    email: '',
    password: '',
    confirmPassword: '',
  })

  if (isAuthenticated) {
    return <Navigate to="/" replace />
  }

  const update = (field, value) => {
    setForm(prev => ({ ...prev, [field]: value }))
    setError('')
  }

  const handlePhoneChange = (e) => {
    const raw = e.target.value.replace(/\D/g, '')
    if (raw && raw[0] !== '5') return
    const digits = raw.slice(0, 10)
    update('phone', formatPhone(digits))
  }

  const validate = () => {
    if (!form.firstName.trim()) return 'Ad gerekli'
    if (!form.lastName.trim()) return 'Soyad gerekli'

    const phoneDigits = form.phone.replace(/\D/g, '')
    if (phoneDigits.length !== 10) {
      return 'Telefon numarası 10 haneli olmalı (5XX XXX XX XX)'
    }

    if (!form.email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
      return 'Geçerli bir e-posta adresi girin'
    }

    if (form.password.length < 8) {
      return 'Şifre en az 8 karakter olmalı'
    }

    if (form.password !== form.confirmPassword) {
      return 'Şifreler eşleşmiyor'
    }

    return null
  }

  const handleSubmit = async (e) => {
    e.preventDefault()

    const validationError = validate()
    if (validationError) {
      setError(validationError)
      return
    }

    setLoading(true)
    setError('')
    setSuccessMessage('')

    try {
      const registration = await registerWithPassword({
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        phone: form.phone,
        email: form.email,
        password: form.password,
      })

      try {
        const session = await loginWithPassword({
          email: form.email,
          password: form.password,
        })

        login(session.user, session.token)
        navigate('/')
        return
      } catch {
        setSuccessMessage(
          registration.message
            || 'Hesabınız oluşturuldu. Otomatik giriş başarısız olursa aşağıdaki butonla devam edin.',
        )
      }
    } catch (err) {
      setError(err.message || 'Sunucu bağlantı hatası')
    } finally {
      setLoading(false)
    }
  }

  if (successMessage) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-dark-950 p-4">
        <div className="max-w-md w-full bg-surface-100 rounded-2xl p-8 border border-gold-500/20 text-center">
          <div className="w-20 h-20 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
            <Check className="w-10 h-10 text-green-400" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-3">Kayıt Başarılı!</h1>
          <p className="text-gray-400 mb-3">Hesabınız başarıyla oluşturuldu.</p>
          <div className="bg-gold-500/10 border border-gold-500/20 rounded-xl p-4 mb-6">
            <p className="text-sm text-gold-400">{successMessage}</p>
          </div>
          <button
            onClick={() => navigate('/login')}
            className="w-full bg-gradient-to-r from-gold-500 to-gold-600 text-dark-950 font-semibold py-3.5 rounded-xl hover:from-gold-400 hover:to-gold-500 transition-all"
          >
            Giriş Yap
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex bg-dark-950">
      {/* Left Side */}
      <div className="hidden lg:flex lg:w-5/12 bg-gradient-to-br from-dark-900 via-dark-950 to-dark-900 p-12 flex-col justify-between relative overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-0 left-0 w-96 h-96 bg-gold-500 rounded-full filter blur-3xl"></div>
          <div className="absolute bottom-0 right-0 w-96 h-96 bg-gold-600 rounded-full filter blur-3xl"></div>
        </div>

        <div className="relative z-10">
          <div className="flex items-center space-x-3">
            <div className="w-14 h-14 bg-gradient-to-br from-gold-400 to-gold-600 rounded-2xl flex items-center justify-center shadow-glow-gold">
              <Crown className="w-8 h-8 text-dark-950" />
            </div>
            <div>
              <h1 className="text-3xl font-bold bg-gradient-to-r from-gold-400 to-gold-600 bg-clip-text text-transparent">BORSA KRALI</h1>
              <p className="text-gray-500 text-sm">Premium Analiz Platformu</p>
            </div>
          </div>
        </div>

        <div className="relative z-10 space-y-6">
          <h2 className="text-3xl font-bold text-white leading-tight">
            Ücretsiz Hesap<br />
            <span className="bg-gradient-to-r from-gold-400 to-gold-600 bg-clip-text text-transparent">Oluştur</span>
          </h2>
          {[
            { icon: TrendingUp, title: 'Gerçek Zamanlı Veri', desc: '300+ BIST hissesi canlı takip' },
            { icon: BarChart3, title: 'Teknik Analiz', desc: 'RSI, MACD, Bollinger ve daha fazlası' },
            { icon: Zap, title: 'AI Skorlama', desc: 'Yapay zeka destekli hisse değerlendirme' },
            { icon: Shield, title: 'Güvenli Kayıt', desc: 'Verileriniz şifreli olarak saklanır' },
          ].map(({ icon: Icon, title, desc }) => (
            <div key={title} className="flex items-start space-x-4">
              <div className="w-10 h-10 bg-gold-500/20 rounded-xl flex items-center justify-center flex-shrink-0">
                <Icon className="w-5 h-5 text-gold-400" />
              </div>
              <div>
                <h3 className="text-white font-semibold text-sm mb-0.5">{title}</h3>
                <p className="text-gray-400 text-xs">{desc}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="relative z-10">
          <p className="text-gray-600 text-xs">Yalnızca eğitim amaçlıdır. Yatırım tavsiyesi değildir.</p>
        </div>
      </div>

      {/* Right Side - Form */}
      <div className="w-full lg:w-7/12 flex items-center justify-center p-6 overflow-y-auto">
        <div className="max-w-md w-full py-6">
          {/* Mobile Logo */}
          <div className="text-center mb-6 lg:hidden">
            <div className="inline-flex items-center justify-center w-14 h-14 bg-gradient-to-br from-gold-400 to-gold-600 rounded-2xl mb-3 shadow-glow-gold">
              <Crown className="w-7 h-7 text-dark-950" />
            </div>
            <h1 className="text-2xl font-bold bg-gradient-to-r from-gold-400 to-gold-600 bg-clip-text text-transparent">BORSA KRALI</h1>
          </div>

          <div className="bg-surface-100 rounded-2xl p-6 border border-gold-500/20 shadow-premium">
            <h2 className="text-xl font-bold text-white mb-1 text-center">Hesap Oluştur</h2>
            <p className="text-gray-400 text-sm text-center mb-5">Bilgilerinizi eksiksiz doldurun</p>

            {/* Google Kayıt - Yakında */}
            <button
              disabled
              className="w-full border border-dark-600 bg-dark-800/50 rounded-xl py-3 flex items-center justify-center gap-2.5 text-gray-500 cursor-not-allowed mb-4 relative"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Google ile Kayıt
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] bg-dark-700 text-gray-500 px-2 py-0.5 rounded-full">Yakında</span>
            </button>

            <div className="relative my-4">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gold-500/10"></div>
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="px-3 bg-surface-100 text-gray-500">veya e-posta ile</span>
              </div>
            </div>

            {error && (
              <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-sm flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-3.5">
              {/* Ad + Soyad */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-400 mb-1.5">
                    Ad <span className="text-gray-600">örn: Ahmet</span>
                  </label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                    <input
                      type="text"
                      placeholder="Ahmet"
                      value={form.firstName}
                      onChange={e => update('firstName', e.target.value)}
                      className="w-full bg-surface-200 border border-gold-500/20 rounded-xl pl-9 pr-3 py-3 text-gray-200 placeholder-gray-600 text-sm focus:outline-none focus:border-gold-500 focus:ring-1 focus:ring-gold-500 transition-all"
                      autoComplete="given-name"
                      required
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1.5">
                    Soyad <span className="text-gray-600">örn: Yılmaz</span>
                  </label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                    <input
                      type="text"
                      placeholder="Yılmaz"
                      value={form.lastName}
                      onChange={e => update('lastName', e.target.value)}
                      className="w-full bg-surface-200 border border-gold-500/20 rounded-xl pl-9 pr-3 py-3 text-gray-200 placeholder-gray-600 text-sm focus:outline-none focus:border-gold-500 focus:ring-1 focus:ring-gold-500 transition-all"
                      autoComplete="family-name"
                      required
                    />
                  </div>
                </div>
              </div>

              {/* Telefon */}
              <div>
                <label className="block text-xs text-gray-400 mb-1.5">
                  Telefon <span className="text-gray-600">5XX XXX XX XX (10 hane)</span>
                </label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                  <input
                    type="tel"
                    placeholder="5XX XXX XX XX"
                    value={form.phone}
                    onChange={handlePhoneChange}
                    className="w-full bg-surface-200 border border-gold-500/20 rounded-xl pl-9 pr-3 py-3 text-gray-200 placeholder-gray-600 text-sm focus:outline-none focus:border-gold-500 focus:ring-1 focus:ring-gold-500 transition-all"
                    autoComplete="tel"
                    required
                  />
                </div>
              </div>

              {/* E-posta */}
              <div>
                <label className="block text-xs text-gray-400 mb-1.5">
                  E-posta <span className="text-gray-600">örn: ahmet.yilmaz@gmail.com</span>
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                  <input
                    type="email"
                    placeholder="ahmet.yilmaz@gmail.com"
                    value={form.email}
                    onChange={e => update('email', e.target.value)}
                    className="w-full bg-surface-200 border border-gold-500/20 rounded-xl pl-9 pr-3 py-3 text-gray-200 placeholder-gray-600 text-sm focus:outline-none focus:border-gold-500 focus:ring-1 focus:ring-gold-500 transition-all"
                    autoComplete="email"
                    required
                  />
                </div>
              </div>

              {/* Şifre */}
              <div>
                <label className="block text-xs text-gray-400 mb-1.5">
                  Şifre <span className="text-gray-600">en az 8 karakter</span>
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    placeholder="En az 8 karakter"
                    value={form.password}
                    onChange={e => update('password', e.target.value)}
                    className="w-full bg-surface-200 border border-gold-500/20 rounded-xl pl-9 pr-10 py-3 text-gray-200 placeholder-gray-600 text-sm focus:outline-none focus:border-gold-500 focus:ring-1 focus:ring-gold-500 transition-all"
                    autoComplete="new-password"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Şifre Tekrar */}
              <div>
                <label className="block text-xs text-gray-400 mb-1.5">Şifre Tekrar</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                  <input
                    type={showConfirm ? 'text' : 'password'}
                    placeholder="Şifrenizi tekrar girin"
                    value={form.confirmPassword}
                    onChange={e => update('confirmPassword', e.target.value)}
                    className={`w-full bg-surface-200 border rounded-xl pl-9 pr-10 py-3 text-gray-200 placeholder-gray-600 text-sm focus:outline-none focus:ring-1 transition-all ${
                      form.confirmPassword && form.password !== form.confirmPassword
                        ? 'border-red-500/50 focus:border-red-500 focus:ring-red-500'
                        : 'border-gold-500/20 focus:border-gold-500 focus:ring-gold-500'
                    }`}
                    autoComplete="new-password"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirm(!showConfirm)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
                  >
                    {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {form.confirmPassword && form.password !== form.confirmPassword && (
                  <p className="text-red-400 text-xs mt-1">Şifreler eşleşmiyor</p>
                )}
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-gradient-to-r from-gold-500 to-gold-600 text-dark-950 font-semibold py-3.5 rounded-xl hover:from-gold-400 hover:to-gold-500 transition-all flex items-center justify-center gap-2 shadow-glow-gold mt-2 disabled:opacity-70 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <><Loader className="w-4 h-4 animate-spin" /> Kaydediliyor...</>
                ) : (
                  <>Kayıt Ol <ArrowRight className="w-4 h-4" /></>
                )}
              </button>
            </form>

            <div className="mt-5 text-center">
              <p className="text-gray-400 text-sm">
                Zaten hesabınız var mı?{' '}
                <Link to="/login" className="text-gold-400 hover:text-gold-300 font-medium">
                  Giriş Yap
                </Link>
              </p>
            </div>
          </div>

          <p className="text-center text-xs text-gray-600 mt-4">
            Yatırım tavsiyesi değildir. Eğitim amaçlı platformdur.
          </p>
        </div>
      </div>
    </div>
  )
}
