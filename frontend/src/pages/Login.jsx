import { useNavigate, Link, Navigate } from 'react-router-dom'
import { useState } from 'react'
import { useAuthStore } from '../store/authStore'
import { Crown, Mail, Lock, ArrowRight, TrendingUp, Shield, Zap, BarChart3, Loader, AlertCircle, PlayCircle } from 'lucide-react'
import { loginWithPassword } from '../services/auth'

export default function Login() {
  const navigate = useNavigate()
  const { login, isAuthenticated } = useAuthStore()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  if (isAuthenticated) {
    return <Navigate to="/" replace />
  }

  const handleLogin = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const data = await loginWithPassword({ email, password })

      if (data.user && data.token) {
        login(data.user, data.token)
        navigate('/')
        return
      }

      setError(data.error || 'Giriş başarısız')
    } catch (err) {
      setError(err.message || 'Sunucu bağlantı hatası')
    } finally {
      setLoading(false)
    }
  }

  const handleDemoLogin = () => {
    login({
      firstName: 'Demo',
      lastName: 'Kullanıcı',
      email: 'demo@borsakrali.com',
      isDemo: true,
      plan: 'pro',
      role: 'demo',
    }, 'demo-token-full-access')
    navigate('/')
  }

  return (
    <div className="min-h-screen flex bg-dark-950">
      {/* Left Side - Features */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-dark-900 via-dark-950 to-dark-900 p-12 flex-col justify-between relative overflow-hidden">
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

        <div className="relative z-10 space-y-8">
          <h2 className="text-4xl font-bold text-white leading-tight">
            Profesyonel Borsa<br />
            <span className="bg-gradient-to-r from-gold-400 to-gold-600 bg-clip-text text-transparent">Analiz Araçları</span>
          </h2>

          <div className="space-y-6">
            <div className="flex items-start space-x-4">
              <div className="w-12 h-12 bg-gold-500/20 rounded-xl flex items-center justify-center flex-shrink-0">
                <TrendingUp className="w-6 h-6 text-gold-400" />
              </div>
              <div>
                <h3 className="text-white font-semibold mb-1">Gerçek Zamanlı Veri</h3>
                <p className="text-gray-400 text-sm">300+ BIST hissesi ile her dakika güncellenen veriler</p>
              </div>
            </div>
            <div className="flex items-start space-x-4">
              <div className="w-12 h-12 bg-gold-500/20 rounded-xl flex items-center justify-center flex-shrink-0">
                <BarChart3 className="w-6 h-6 text-gold-400" />
              </div>
              <div>
                <h3 className="text-white font-semibold mb-1">Gelişmiş Teknik Analiz</h3>
                <p className="text-gray-400 text-sm">RSI, MACD, Bollinger, EMA ve daha fazlası</p>
              </div>
            </div>
            <div className="flex items-start space-x-4">
              <div className="w-12 h-12 bg-gold-500/20 rounded-xl flex items-center justify-center flex-shrink-0">
                <Zap className="w-6 h-6 text-gold-400" />
              </div>
              <div>
                <h3 className="text-white font-semibold mb-1">AI Destekli Skorlama</h3>
                <p className="text-gray-400 text-sm">Yapay zeka ile hisse değerlendirme</p>
              </div>
            </div>
            <div className="flex items-start space-x-4">
              <div className="w-12 h-12 bg-gold-500/20 rounded-xl flex items-center justify-center flex-shrink-0">
                <Shield className="w-6 h-6 text-gold-400" />
              </div>
              <div>
                <h3 className="text-white font-semibold mb-1">Güvenli Giriş</h3>
                <p className="text-gray-400 text-sm">Şifreli veritabanı ve güvenli kimlik doğrulama</p>
              </div>
            </div>
          </div>
        </div>

        <div className="relative z-10">
          <p className="text-gray-500 text-sm">
            Tüm hakları saklıdır.
          </p>
          <p className="text-gray-600 text-xs mt-1">
            Tüm hakları saklıdır. Yalnızca eğitim maksadıyla kullanılacaktır.
          </p>
        </div>
      </div>

      {/* Right Side - Login Form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-8">
        <div className="max-w-md w-full">
          {/* Mobile Logo */}
          <div className="text-center mb-8 lg:hidden">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-gold-400 to-gold-600 rounded-2xl mb-4 shadow-glow-gold">
              <Crown className="w-8 h-8 text-dark-950" />
            </div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-gold-400 to-gold-600 bg-clip-text text-transparent">BORSA KRALI</h1>
            <p className="text-gray-400 mt-2">Premium Analiz Platformu</p>
          </div>

          <div className="bg-surface-100 rounded-2xl p-8 border border-gold-500/20 shadow-premium">
            <h2 className="text-2xl font-bold text-white mb-2 text-center">Hoş Geldiniz</h2>
            <p className="text-gray-400 text-center mb-8">Hesabınıza giriş yapın</p>

            {error && (
              <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-sm flex items-center gap-2">
                <AlertCircle className="w-5 h-5" />
                {error}
              </div>
            )}

            <form onSubmit={handleLogin} className="space-y-5">
              <div>
                <label className="block text-sm text-gray-400 mb-2">E-posta</label>
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                  <input
                    type="email"
                    placeholder="ornek@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full bg-surface-200 border border-gold-500/20 rounded-xl pl-12 pr-4 py-3.5 text-gray-200 placeholder-gray-500 focus:outline-none focus:border-gold-500 focus:ring-1 focus:ring-gold-500 transition-all"
                    autoComplete="email"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-2">Şifre</label>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                  <input
                    type="password"
                    placeholder="Şifrenizi girin"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full bg-surface-200 border border-gold-500/20 rounded-xl pl-12 pr-4 py-3.5 text-gray-200 placeholder-gray-500 focus:outline-none focus:border-gold-500 focus:ring-1 focus:ring-gold-500 transition-all"
                    autoComplete="current-password"
                    required
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading || !email.trim() || !password}
                className="w-full bg-gradient-to-r from-gold-500 to-gold-600 text-dark-950 font-semibold py-3.5 rounded-xl hover:from-gold-400 hover:to-gold-500 transition-all flex items-center justify-center gap-2 shadow-glow-gold disabled:opacity-70 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <><Loader className="w-5 h-5 animate-spin" /> Giriş yapılıyor...</>
                ) : (
                  <>Giriş Yap <ArrowRight className="w-5 h-5" /></>
                )}
              </button>
            </form>

            {/* Google Giriş - Yakında */}
            <div className="mt-5 mb-4">
              <button
                disabled
                className="w-full border border-dark-600 bg-dark-800/50 rounded-xl py-3 flex items-center justify-center gap-2.5 text-gray-500 cursor-not-allowed relative"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                Google ile Giriş
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] bg-dark-700 text-gray-500 px-2 py-0.5 rounded-full">Yakında</span>
              </button>
            </div>

            <div className="relative my-5">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gold-500/20"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-4 bg-surface-100 text-gray-500">veya e-posta ile</span>
              </div>
            </div>

            {/* Demo Butonu */}
            <div className="space-y-2">
              <button
                onClick={handleDemoLogin}
                className="w-full bg-gradient-to-r from-blue-600/80 to-blue-700/80 border border-blue-500/40 text-white font-semibold py-3.5 rounded-xl hover:from-blue-500/80 hover:to-blue-600/80 transition-all flex items-center justify-center gap-2.5 group"
              >
                <PlayCircle className="w-5 h-5 text-blue-300 group-hover:text-white transition-colors" />
                Demo ile Giriş
                <span className="text-xs font-normal text-blue-300 bg-blue-900/50 px-2 py-0.5 rounded-full ml-1">Tam Erişim</span>
              </button>
              <p className="text-xs text-gray-600 text-center">
                Demo modda tüm analiz araçlarına gerçek verilerle erişebilirsiniz
              </p>
            </div>

            <div className="mt-6 text-center">
              <p className="text-gray-400 text-sm">
                Hesabınız yok mu?{' '}
                <Link to="/register" className="text-gold-400 hover:text-gold-300 font-medium">
                  Kayıt Ol
                </Link>
              </p>
            </div>
          </div>

          <p className="text-center text-xs text-gray-600 mt-6">
            Yatırım tavsiyesi değildir. Eğitim amaçlı platformdur.
          </p>
        </div>
      </div>
    </div>
  )
}
