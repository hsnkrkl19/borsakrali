import { useNavigate, Link, Navigate } from 'react-router-dom'
import { useState } from 'react'
import { useAuthStore } from '../store/authStore'
import { Crown, Mail, Lock, ArrowRight, TrendingUp, Shield, Zap, BarChart3, Loader, AlertCircle, PlayCircle, Sparkles, Eye, EyeOff } from 'lucide-react'
import { loginWithPassword } from '../services/auth'

export default function Login() {
  const navigate = useNavigate()
  const { login, isAuthenticated } = useAuthStore()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [waking, setWaking] = useState(false)

  if (isAuthenticated) {
    return <Navigate to="/" replace />
  }

  const handleLogin = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    setWaking(false)

    // 5 saniye sonra hâlâ yükleniyorsa, server uyanıyor mesajı göster
    const wakingTimer = setTimeout(() => setWaking(true), 5000)

    try {
      const data = await loginWithPassword({ email, password })

      if (data.user && data.token) {
        login(data.user, data.token)
        navigate('/')
        return
      }

      setError(data.error || 'Giriş başarısız')
    } catch (err) {
      // Network hatası mı, gerçek bir login hatası mı?
      if (err.message?.includes('Network') || err.code === 'ERR_NETWORK' || err.message?.includes('timeout')) {
        setError('Sunucuya ulaşılamıyor. İnternet bağlantınızı kontrol edip tekrar deneyin (sunucu uyanıyor olabilir, ~30sn sürer).')
      } else if (err.response?.status >= 500) {
        setError('Sunucu geçici olarak meşgul. Birkaç saniye sonra tekrar deneyin.')
      } else {
        setError(err.message || 'Giriş başarısız')
      }
    } finally {
      clearTimeout(wakingTimer)
      setLoading(false)
      setWaking(false)
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
    <div className="min-h-screen flex auth-bg" style={{ backgroundColor: 'var(--bg-base)' }}>
      {/* Left Side - Features (hero) */}
      <div className="hidden lg:flex lg:w-1/2 p-12 flex-col justify-between relative overflow-hidden"
        style={{
          background: 'linear-gradient(135deg, var(--bg-card) 0%, var(--bg-base) 60%, var(--bg-card) 100%)',
        }}
      >
        {/* Decorative backdrop - candlestick/chart grid */}
        <div className="absolute inset-0 opacity-[0.03] grid-pattern pointer-events-none" />

        {/* Floating orbs */}
        <div className="absolute top-[-15%] left-[-10%] w-[500px] h-[500px] rounded-full bg-gradient-radial from-amber-500/25 to-transparent blur-3xl float-slow" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[550px] h-[550px] rounded-full bg-gradient-radial from-amber-600/20 to-transparent blur-3xl float-slow" style={{ animationDelay: '2s' }} />

        {/* Logo + Title */}
        <div className="relative z-10">
          <div className="flex items-center space-x-3">
            <div className="relative">
              <div className="w-16 h-16 bg-gradient-to-br from-amber-300 via-amber-400 to-amber-600 rounded-2xl flex items-center justify-center shadow-[0_8px_32px_rgba(245,158,11,0.45)]">
                <Crown className="w-9 h-9 text-slate-950" strokeWidth={2.5} />
              </div>
              <Sparkles className="absolute -top-1 -right-1 w-4 h-4 text-amber-300 animate-pulse" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-gold-shimmer leading-tight tracking-wide">BORSA KRALI</h1>
              <p className="text-amber-400/80 text-xs uppercase tracking-[0.15em] font-semibold mt-0.5">Premium Analiz Platformu</p>
            </div>
          </div>
        </div>

        {/* Hero Content */}
        <div className="relative z-10 space-y-8">
          <h2 className="text-[2.75rem] leading-[1.1] font-bold text-white tracking-tight">
            Profesyonel<br />
            Borsa Analizi<br />
            <span className="text-gold-gradient">Parmak Ucunuzda</span>
          </h2>

          <div className="grid gap-4">
            {[
              { icon: TrendingUp, title: 'Canlı BIST Verisi', desc: '510+ hissede dakikalık güncelleme, gerçek zamanlı fiyat akışı' },
              { icon: BarChart3, title: 'İleri Teknik Analiz', desc: 'RSI, MACD, Bollinger, EMA, Stoch, Williams %R ve fazlası' },
              { icon: Zap, title: 'AI Destekli Skorlama', desc: 'Yapay zeka destekli hisse skoru, temel & teknik kombine analiz' },
              { icon: Shield, title: 'Malaysian SNR', desc: 'Destek/direnç bölgesi tespiti, likidite sweep ve engulfing sinyalleri' },
            ].map((f, i) => {
              const Icon = f.icon
              return (
                <div
                  key={i}
                  className="flex items-start gap-3.5 p-3.5 rounded-xl transition-all hover:translate-x-1"
                  style={{
                    background: 'rgba(245, 158, 11, 0.04)',
                    border: '1px solid rgba(245, 158, 11, 0.12)',
                  }}
                >
                  <div className="w-10 h-10 bg-gradient-to-br from-amber-500/25 to-amber-600/15 rounded-lg flex items-center justify-center flex-shrink-0 border border-amber-500/25">
                    <Icon className="w-5 h-5 text-amber-400" strokeWidth={2.2} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-white font-semibold mb-0.5 text-sm">{f.title}</h3>
                    <p className="text-gray-400 text-xs leading-relaxed">{f.desc}</p>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Footer disclaimer */}
        <div className="relative z-10">
          <div className="divider-gold mb-3" />
          <p className="text-gray-500 text-xs">
            © {new Date().getFullYear()} Borsa Kralı — Tüm hakları saklıdır.
          </p>
          <p className="text-gray-600 text-[10px] mt-1">
            Yatırım tavsiyesi değildir. Yalnızca eğitim maksatlı kullanım içindir.
          </p>
        </div>
      </div>

      {/* Right Side - Login Form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-6 sm:p-8 relative z-10">
        <div className="max-w-md w-full">
          {/* Mobile Logo */}
          <div className="text-center mb-8 lg:hidden">
            <div className="relative inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-amber-300 via-amber-400 to-amber-600 rounded-2xl mb-4 shadow-[0_8px_32px_rgba(245,158,11,0.5)]">
              <Crown className="w-9 h-9 text-slate-950" strokeWidth={2.5} />
              <Sparkles className="absolute -top-1 -right-1 w-4 h-4 text-amber-300 animate-pulse" />
            </div>
            <h1 className="text-3xl font-bold text-gold-shimmer tracking-wide">BORSA KRALI</h1>
            <p className="text-amber-400/80 text-xs uppercase tracking-[0.15em] font-semibold mt-1">Premium Analiz Platformu</p>
          </div>

          <div
            className="rounded-2xl p-7 sm:p-8 glass shadow-premium relative overflow-hidden"
            style={{ border: '1px solid rgba(245, 158, 11, 0.2)' }}
          >
            {/* Subtle top accent */}
            <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-amber-500/60 to-transparent" />

            <div className="text-center mb-7">
              <h2 className="text-2xl font-bold text-white mb-1.5">Hoş Geldiniz</h2>
              <p className="text-gray-400 text-sm">Premium hesabınıza giriş yapın</p>
            </div>

            {error && (
              <div className="mb-5 p-3.5 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-sm flex items-center gap-2.5">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-[11px] uppercase tracking-wider text-amber-400/80 font-semibold mb-2">E-posta</label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-amber-400/70" />
                  <input
                    type="email"
                    placeholder="ornek@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full rounded-xl pl-11 pr-4 py-3 text-sm focus:outline-none transition-all focus-gold"
                    style={{
                      background: 'rgba(var(--bg-input-rgb), 0.6)',
                      border: '1px solid var(--border-main)',
                      color: 'var(--text-primary)',
                    }}
                    autoComplete="email"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] uppercase tracking-wider text-amber-400/80 font-semibold mb-2">Şifre</label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-amber-400/70" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Şifrenizi girin"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full rounded-xl pl-11 pr-11 py-3 text-sm focus:outline-none transition-all focus-gold"
                    style={{
                      background: 'rgba(var(--bg-input-rgb), 0.6)',
                      border: '1px solid var(--border-main)',
                      color: 'var(--text-primary)',
                    }}
                    autoComplete="current-password"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(v => !v)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-500 hover:text-amber-400 transition-colors"
                    aria-label={showPassword ? 'Şifreyi gizle' : 'Şifreyi göster'}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading || !email.trim() || !password}
                className="btn-gold w-full flex items-center justify-center gap-2 text-[14px] py-3 mt-2"
              >
                {loading ? (
                  <><Loader className="w-4 h-4 animate-spin" /> {waking ? 'Sunucu uyanıyor (~30sn)...' : 'Giriş yapılıyor...'}</>
                ) : (
                  <>Giriş Yap <ArrowRight className="w-4 h-4" /></>
                )}
              </button>

              {waking && (
                <div className="mt-2 p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-[11px] text-amber-400 text-center">
                  ⏳ Sunucu yeni uyandığı için ilk giriş ~30 saniye sürebilir. Lütfen bekleyin, otomatik tekrar deniyoruz...
                </div>
              )}
            </form>

            <div className="relative my-5">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full divider-gold"></div>
              </div>
              <div className="relative flex justify-center text-[11px]">
                <span className="px-3 bg-[var(--bg-card)] text-amber-400/70 uppercase tracking-wider font-semibold">veya</span>
              </div>
            </div>

            <div className="space-y-2">
              <button
                onClick={handleDemoLogin}
                className="w-full relative overflow-hidden rounded-xl py-3 flex items-center justify-center gap-2.5 font-semibold text-sm transition-all group"
                style={{
                  background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.15), rgba(99, 102, 241, 0.10))',
                  border: '1px solid rgba(59, 130, 246, 0.35)',
                  color: 'var(--text-primary)',
                }}
              >
                <PlayCircle className="w-4 h-4 text-blue-400 group-hover:text-blue-300 transition-colors" />
                Demo Hesapla Dene
                <span className="text-[10px] font-semibold text-blue-300 bg-blue-500/20 px-2 py-0.5 rounded-full ml-1 uppercase tracking-wider">Tam Erişim</span>
              </button>
              <p className="text-[11px] text-gray-500 text-center">
                Demo modda tüm analiz araçlarına gerçek verilerle erişin
              </p>
            </div>

            <div className="mt-6 text-center">
              <p className="text-gray-400 text-sm">
                Hesabınız yok mu?{' '}
                <Link to="/register" className="text-amber-400 hover:text-amber-300 font-semibold transition-colors">
                  Ücretsiz Kayıt Olun
                </Link>
              </p>
            </div>
          </div>

          <p className="text-center text-[11px] text-gray-500 mt-6">
            Yatırım tavsiyesi değildir. Eğitim amaçlı platformdur.
          </p>
        </div>
      </div>
    </div>
  )
}
