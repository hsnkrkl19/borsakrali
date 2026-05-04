import { useNavigate, Link, Navigate } from 'react-router-dom'
import { useState, useEffect, useMemo, useRef } from 'react'
import { useAuthStore } from '../store/authStore'
import {
  Crown, Mail, Lock, ArrowRight, TrendingUp, Shield, Zap, BarChart3,
  Loader, AlertCircle, PlayCircle, Sparkles, Eye, EyeOff, Activity,
  CandlestickChart, Cpu, Lightbulb,
} from 'lucide-react'
import { loginWithPassword } from '../services/auth'
import BrandMark from '../components/BrandMark'

/* ────────────────────────────────────────────────────────────────────────────
   Animated chart backdrop — pure SVG, performant, theme-aware.
   Generates a candlestick + gradient sparkline that lives behind the form.
   ──────────────────────────────────────────────────────────────────────────── */
function CinematicChartBackdrop() {
  const [tick, setTick] = useState(0)
  const points = useMemo(() => {
    // Deterministic pseudo-data so SSR/hydration doesn't flicker
    const seed = 137
    const out = []
    let v = 50
    for (let i = 0; i < 64; i++) {
      const noise = Math.sin(seed + i * 1.7) * 8 + Math.sin(i * 0.34) * 6
      v = Math.max(15, Math.min(85, v + noise * 0.18 + (i % 9 === 0 ? 4 : -1.5)))
      out.push(v)
    }
    return out
  }, [])

  useEffect(() => {
    // Slower tick + fully drawn after first cycle (no infinite redraw — perf friendly)
    const id = setInterval(() => setTick(t => Math.min(60, t + 1)), 80)
    return () => clearInterval(id)
  }, [])

  // animated draw progress 0..1 (one-time draw on mount)
  const progress = Math.min(1, tick / 60)
  const visibleCount = Math.max(8, Math.floor(points.length * progress))

  const W = 800
  const H = 320
  const pad = 8
  const stepX = (W - pad * 2) / (points.length - 1)
  const path = points
    .slice(0, visibleCount)
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${pad + i * stepX} ${H - pad - (p / 100) * (H - pad * 2)}`)
    .join(' ')
  const areaPath = `${path} L ${pad + (visibleCount - 1) * stepX} ${H - pad} L ${pad} ${H - pad} Z`

  // Candles (every 4th point as OHLC group)
  const candles = []
  for (let i = 4; i < points.length; i += 4) {
    const o = points[i - 4]
    const c = points[i]
    const h = Math.max(o, c) + 6
    const l = Math.min(o, c) - 6
    const x = pad + i * stepX
    const yO = H - pad - (o / 100) * (H - pad * 2)
    const yC = H - pad - (c / 100) * (H - pad * 2)
    const yH = H - pad - (h / 100) * (H - pad * 2)
    const yL = H - pad - (l / 100) * (H - pad * 2)
    candles.push({ x, yO, yC, yH, yL, up: c >= o })
  }

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="xMidYMid slice"
      className="absolute inset-0 w-full h-full pointer-events-none opacity-[0.55]"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="bk-line" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#d4af37" stopOpacity="0.15" />
          <stop offset="50%" stopColor="#f0c75a" stopOpacity="0.85" />
          <stop offset="100%" stopColor="#fef3c7" stopOpacity="1" />
        </linearGradient>
        <linearGradient id="bk-area" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#d4af37" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#d4af37" stopOpacity="0" />
        </linearGradient>
        <pattern id="bk-grid" width="40" height="40" patternUnits="userSpaceOnUse">
          <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(212,175,55,0.06)" strokeWidth="1" />
        </pattern>
      </defs>

      <rect width={W} height={H} fill="url(#bk-grid)" />

      {/* Area */}
      <path d={areaPath} fill="url(#bk-area)" />

      {/* Candles */}
      {candles.slice(0, Math.floor(candles.length * progress)).map((c, i) => (
        <g key={i} opacity="0.35">
          <line x1={c.x} y1={c.yH} x2={c.x} y2={c.yL} stroke={c.up ? '#00c98a' : '#ff3b46'} strokeWidth="1" />
          <rect
            x={c.x - 3}
            y={Math.min(c.yO, c.yC)}
            width="6"
            height={Math.max(2, Math.abs(c.yC - c.yO))}
            fill={c.up ? '#00c98a' : '#ff3b46'}
            rx="0.5"
          />
        </g>
      ))}

      {/* Main line */}
      <path d={path} fill="none" stroke="url(#bk-line)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />

      {/* End cap dot */}
      {visibleCount > 1 && (
        <circle
          cx={pad + (visibleCount - 1) * stepX}
          cy={H - pad - (points[visibleCount - 1] / 100) * (H - pad * 2)}
          r="4"
          fill="#fef3c7"
          stroke="#d4af37"
          strokeWidth="1.5"
        >
          <animate attributeName="r" values="4;7;4" dur="1.2s" repeatCount="indefinite" />
        </circle>
      )}
    </svg>
  )
}

/* ────────────────────────────────────────────────────────────────────────────
   Live ticker chip (animated mock indices for hero)
   ──────────────────────────────────────────────────────────────────────────── */
function HeroTickerChip({ label, value, change }) {
  const up = change >= 0
  return (
    <div
      className="flex items-center gap-2.5 px-3 py-2 rounded-xl"
      style={{
        background: 'rgba(255, 255, 255, 0.04)',
        border: `1px solid ${up ? 'rgba(0, 201, 138, 0.25)' : 'rgba(255, 59, 70, 0.25)'}`,
        backdropFilter: 'blur(6px)',
      }}
    >
      <span className="text-[10px] uppercase tracking-[0.14em] font-semibold text-amber-300/80">{label}</span>
      <span className="text-white font-bold text-sm num-tabular">{value}</span>
      <span className={`text-[11px] font-bold num-tabular ${up ? 'text-emerald-400' : 'text-red-400'}`}>
        {up ? '▲' : '▼'} {Math.abs(change).toFixed(2)}%
      </span>
    </div>
  )
}

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

  const features = [
    { icon: CandlestickChart, title: 'Gerçek Zamanlı BIST', stat: '510+', subtitle: 'hisse · dakikalık güncelleme' },
    { icon: Cpu, title: 'AI Hisse Skoru', stat: '14', subtitle: 'gösterge · derin analiz motoru' },
    { icon: Activity, title: 'Premium İndikatörler', stat: 'RSI · MACD · SNR', subtitle: 'EMA · Bollinger · Stoch · ATR' },
    { icon: Lightbulb, title: 'Akıllı Sinyal Motoru', stat: 'Live', subtitle: 'günlük tespitler · al-sat alarmı' },
  ]

  return (
    <div className="min-h-screen flex auth-backdrop" style={{ backgroundColor: 'var(--bg-base)' }}>
      {/* ═════════════════════════════════════════════════════════════════════
          LEFT — CINEMATIC HERO
          ═════════════════════════════════════════════════════════════════════ */}
      <div
        className="hidden lg:flex lg:w-[58%] relative overflow-hidden flex-col"
        style={{
          background: 'linear-gradient(135deg, #060a14 0%, #0a1020 35%, #0f172a 70%, #060a14 100%)',
        }}
      >
        {/* Animated chart backdrop */}
        <div className="absolute inset-0">
          <CinematicChartBackdrop />
        </div>

        {/* Vignette */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              'radial-gradient(ellipse 80% 60% at 50% 40%, transparent 30%, rgba(3,6,13,0.65) 100%)',
          }}
        />

        {/* Floating gold particles */}
        <div className="absolute top-[18%] left-[12%] w-1.5 h-1.5 rounded-full bg-amber-300/50 float-slow" />
        <div className="absolute top-[35%] right-[18%] w-1 h-1 rounded-full bg-amber-200/60 float-slow" style={{ animationDelay: '1s' }} />
        <div className="absolute bottom-[28%] left-[22%] w-2 h-2 rounded-full bg-amber-400/40 float-slow" style={{ animationDelay: '2s' }} />
        <div className="absolute bottom-[18%] right-[10%] w-1 h-1 rounded-full bg-amber-200/50 float-slow" style={{ animationDelay: '3s' }} />

        {/* Top bar — brand + ticker chips */}
        <div className="relative z-10 flex items-center justify-between p-8">
          <div className="flex items-center gap-3">
            <BrandMark size="lg" />
            <div>
              <h1 className="text-xl font-bold text-gold-shimmer tracking-wider leading-none">BORSA KRALI</h1>
              <p className="text-amber-300/70 text-[10px] uppercase tracking-[0.22em] font-bold mt-1">Obsidian Edition</p>
            </div>
          </div>

          <div className="hidden xl:flex items-center gap-2">
            <HeroTickerChip label="BIST 100" value="14.485" change={-0.71} />
            <HeroTickerChip label="USD/TRY" value="32.41" change={0.12} />
            <HeroTickerChip label="GRAM" value="2.847" change={0.84} />
          </div>
        </div>

        {/* Big hero copy */}
        <div className="relative z-10 flex-1 flex flex-col justify-center px-12 pb-16">
          <div className="max-w-xl">
            <div className="inline-flex items-center gap-2 mb-6 pill pill-gold">
              <span className="status-dot status-dot-gold" />
              Premium Analiz Platformu
            </div>

            <h2 className="text-[3.25rem] leading-[1.05] font-black tracking-tight text-white mb-6">
              Borsanın
              <br />
              <span className="text-gold-shimmer">Kralı Olmak</span>
              <br />
              Bir Tıklama Uzakta.
            </h2>

            <p className="text-slate-300 text-base leading-relaxed mb-10 max-w-md">
              Profesyonel BIST analizi · Gerçek zamanlı veri · AI destekli sinyaller.
              Tüm araçlar, tek bir cebinizde.
            </p>

            {/* Feature grid */}
            <div className="grid grid-cols-2 gap-3 max-w-lg">
              {features.map((f, i) => {
                const Icon = f.icon
                return (
                  <div
                    key={i}
                    className="group relative overflow-hidden rounded-2xl p-4 transition-all hover:translate-y-[-2px]"
                    style={{
                      background: 'rgba(255, 255, 255, 0.03)',
                      border: '1px solid rgba(212, 175, 55, 0.12)',
                      backdropFilter: 'blur(8px)',
                    }}
                  >
                    {/* Hover gold sweep */}
                    <div
                      className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
                      style={{
                        background:
                          'linear-gradient(135deg, rgba(212, 175, 55, 0.08), transparent 60%)',
                      }}
                    />
                    <Icon className="w-5 h-5 text-amber-300 mb-2.5" strokeWidth={2.2} />
                    <div className="text-amber-300 text-[11px] font-bold uppercase tracking-wider">{f.stat}</div>
                    <div className="text-white text-sm font-semibold leading-tight mt-0.5">{f.title}</div>
                    <div className="text-slate-400 text-[11px] mt-1 leading-snug">{f.subtitle}</div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* Bottom legal */}
        <div className="relative z-10 px-12 pb-8">
          <div className="divider-gold mb-4 max-w-xl" />
          <div className="flex items-center justify-between max-w-xl">
            <p className="text-slate-500 text-[11px]">
              © {new Date().getFullYear()} Borsa Kralı · Tüm hakları saklıdır.
            </p>
            <p className="text-slate-600 text-[10px] uppercase tracking-wider">v3.0 · Obsidian</p>
          </div>
        </div>
      </div>

      {/* ═════════════════════════════════════════════════════════════════════
          RIGHT — LOGIN FORM
          ═════════════════════════════════════════════════════════════════════ */}
      <div className="w-full lg:w-[42%] flex items-center justify-center p-6 sm:p-10 relative z-10">
        <div className="max-w-[400px] w-full">
          {/* Mobile brand */}
          <div className="text-center mb-8 lg:hidden">
            <div className="inline-flex mb-4">
              <BrandMark size="xl" />
            </div>
            <h1 className="text-2xl font-bold text-gold-shimmer tracking-wider">BORSA KRALI</h1>
            <p className="text-amber-400/80 text-[10px] uppercase tracking-[0.22em] font-bold mt-1">Obsidian Edition</p>
          </div>

          {/* Form card */}
          <div className="surface-card-gold p-7 sm:p-8 relative overflow-hidden">
            <div
              className="absolute top-0 left-0 right-0 h-[2px]"
              style={{ background: 'linear-gradient(90deg, transparent, var(--gold-300), transparent)' }}
            />

            <div className="mb-6">
              <h2 className="text-2xl font-bold text-white tracking-tight mb-1.5">Tekrar Hoş Geldiniz</h2>
              <p className="text-slate-400 text-[13px]">Premium hesabınıza giriş yapın</p>
            </div>

            {error && (
              <div className="mb-5 p-3.5 rounded-xl flex items-start gap-2.5 text-[13px]"
                style={{
                  background: 'rgba(255, 59, 70, 0.08)',
                  border: '1px solid rgba(255, 59, 70, 0.25)',
                  color: '#fca5a5',
                }}
              >
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span className="leading-relaxed">{error}</span>
              </div>
            )}

            {waking && !error && (
              <div className="mb-5 p-3.5 rounded-xl flex items-center gap-2.5 text-[13px]"
                style={{
                  background: 'rgba(212, 175, 55, 0.08)',
                  border: '1px solid rgba(212, 175, 55, 0.25)',
                  color: '#fcd34d',
                }}
              >
                <Loader className="w-4 h-4 flex-shrink-0 animate-spin" />
                <span>Sunucu uyandırılıyor… ilk açılışta ~30 saniye sürebilir.</span>
              </div>
            )}

            <form onSubmit={handleLogin} className="space-y-4">
              {/* Email */}
              <label className="block">
                <div className="text-[10px] uppercase tracking-[0.16em] text-amber-400/80 font-bold mb-2 flex items-center gap-1.5">
                  <span className="status-dot bg-amber-400/70" />
                  E-posta
                </div>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-amber-400/70 pointer-events-none" />
                  <input
                    type="email"
                    placeholder="ornek@borsakrali.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="input-premium pl-11"
                    autoComplete="email"
                    required
                  />
                </div>
              </label>

              {/* Password */}
              <label className="block">
                <div className="text-[10px] uppercase tracking-[0.16em] text-amber-400/80 font-bold mb-2 flex items-center gap-1.5">
                  <span className="status-dot bg-amber-400/70" />
                  Şifre
                </div>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-amber-400/70 pointer-events-none" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    placeholder="••••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="input-premium pl-11 pr-11"
                    autoComplete="current-password"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(v => !v)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-amber-400 transition-colors"
                    aria-label={showPassword ? 'Şifreyi gizle' : 'Şifreyi göster'}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </label>

              <button
                type="submit"
                disabled={loading || !email.trim() || !password}
                className="btn-gold w-full text-[13.5px] py-3 mt-1.5"
              >
                {loading ? (
                  <><Loader className="w-4 h-4 animate-spin" /> Giriş yapılıyor…</>
                ) : (
                  <>Krallığa Gir <ArrowRight className="w-4 h-4" /></>
                )}
              </button>
            </form>

            {/* Divider */}
            <div className="relative my-5">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full divider-gold" />
              </div>
              <div className="relative flex justify-center">
                <span className="px-3 text-[10px] uppercase tracking-[0.22em] font-bold text-amber-400/70 bg-[var(--bg-card)]">
                  veya
                </span>
              </div>
            </div>

            {/* Demo */}
            <button
              onClick={handleDemoLogin}
              className="w-full relative overflow-hidden rounded-xl py-3 px-4 flex items-center justify-center gap-2.5 font-semibold text-[13px] transition-all group"
              style={{
                background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.12), rgba(99, 102, 241, 0.06))',
                border: '1px solid rgba(59, 130, 246, 0.30)',
                color: '#bfdbfe',
              }}
            >
              <PlayCircle className="w-4 h-4 text-blue-400 group-hover:text-blue-300" />
              Demo Hesapla Keşfet
              <span className="pill pill-azure ml-1 !text-[9px]">Tam Erişim</span>
            </button>
            <p className="text-[11px] text-slate-500 text-center mt-2">
              Demo modunda tüm analiz araçlarına gerçek verilerle erişin
            </p>

            <div className="mt-6 text-center">
              <p className="text-slate-400 text-[13px]">
                Henüz üye değil misiniz?{' '}
                <Link to="/register" className="text-amber-400 hover:text-amber-300 font-bold transition-colors">
                  Krallığa Katılın →
                </Link>
              </p>
            </div>
          </div>

          <p className="text-center text-[10px] text-slate-600 mt-5 leading-relaxed">
            Yatırım tavsiyesi değildir · Eğitim amaçlı platform
          </p>
        </div>
      </div>
    </div>
  )
}
