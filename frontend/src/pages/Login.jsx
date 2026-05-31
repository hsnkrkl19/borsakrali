import { useNavigate, Link, Navigate } from 'react-router-dom'
import { useState, useEffect, useMemo, useRef } from 'react'
import { useAuthStore } from '../store/authStore'
import {
  Mail, Lock, ArrowRight, Loader, AlertCircle, PlayCircle, Sparkles,
  Eye, EyeOff, CandlestickChart, Cpu, Bot, Radar, Layers,
} from 'lucide-react'
import { loginWithPassword } from '../services/auth'
import BrandMark from '../components/BrandMark'
import GoogleSignInButton from '../components/GoogleSignInButton'
import { Button } from '../components/ui'
import { getApiBase } from '../config'
import { getStoredTheme } from '../utils/theme'
import XLogo from '../components/XLogo'

/**
 * Subscribe the component to the global theme so colors update when the
 * floating ThemeToggle flips light/dark. Returns 'dark' | 'light'.
 */
function useTheme() {
  const [theme, setTheme] = useState(() => {
    if (typeof window === 'undefined') return 'dark'
    return getStoredTheme()
  })
  useEffect(() => {
    const handler = (e) => {
      const next = e?.detail?.theme
      if (next === 'light' || next === 'dark') setTheme(next)
    }
    window.addEventListener('bk-theme-change', handler)
    return () => window.removeEventListener('bk-theme-change', handler)
  }, [])
  return theme
}

function formatTr(num, opts = {}) {
  if (num == null || Number.isNaN(num)) return '—'
  return new Intl.NumberFormat('tr-TR', {
    minimumFractionDigits: opts.frac ?? 2,
    maximumFractionDigits: opts.frac ?? 2,
  }).format(num)
}

/**
 * Public macro snapshot for the login hero.
 * Çağrılan iki endpoint:
 *   - /api/market/bist100   → BIST 100 endeksi
 *   - /api/market/commodities → USD/TRY ve gram altın (TL/gr)
 * İkisi paralel çekiliyor; biri sleep'te ise diğeri yine de güncel
 * değerleri gösterebiliyor. Fallback değerler 2026 makul aralıkları —
 * yalnızca backend tamamen ulaşılamazsa görünürler.
 */
function useMacroSnapshot() {
  const [data, setData] = useState({
    bist100: { value: 15040, change: 0.82 },
    usdtry: { value: 45.24, change: 0.08 },
    gold: { value: 6868, change: 0.66 },
    live: false,
  })

  useEffect(() => {
    let active = true
    const ac = new AbortController()
    const apiBase = getApiBase()

    const safeJson = (r) => (r.ok ? r.json() : Promise.reject(r))

    const bist = fetch(`${apiBase}/api/market/bist100`, { signal: ac.signal })
      .then(safeJson).catch(() => null)
    const commodities = fetch(`${apiBase}/api/market/commodities`, { signal: ac.signal })
      .then(safeJson).catch(() => null)

    Promise.all([bist, commodities]).then(([b, c]) => {
      if (!active) return
      setData((prev) => ({
        bist100: b
          ? { value: b.price ?? b.value, change: b.changePercent }
          : prev.bist100,
        usdtry: c?.usd_try
          ? { value: c.usd_try.price, change: c.usd_try.changePercent }
          : prev.usdtry,
        gold: c?.gold_try
          ? { value: c.gold_try.price, change: c.gold_try.changePercent }
          : prev.gold,
        live: true,
      }))
    })

    return () => { active = false; ac.abort() }
  }, [])

  return data
}

/* ────────────────────────────────────────────────────────────────────────────
   Animated chart backdrop — pure SVG, performant, theme-aware.
   Generates a candlestick + gradient sparkline that lives behind the form.
   ──────────────────────────────────────────────────────────────────────────── */
function CinematicChartBackdrop({ theme = 'dark' }) {
  const [tick, setTick] = useState(0)
  const isLight = theme === 'light'
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
      className={'absolute inset-0 w-full h-full pointer-events-none ' + (isLight ? 'opacity-[0.35]' : 'opacity-[0.55]')}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="bk-line" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={isLight ? '#b45309' : '#10b981'} stopOpacity={isLight ? '0.2' : '0.15'} />
          <stop offset="50%" stopColor={isLight ? '#10b981' : '#f0c75a'} stopOpacity={isLight ? '0.65' : '0.85'} />
          <stop offset="100%" stopColor={isLight ? '#92400e' : '#fef3c7'} stopOpacity={isLight ? '0.85' : '1'} />
        </linearGradient>
        <linearGradient id="bk-area" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#10b981" stopOpacity={isLight ? '0.20' : '0.35'} />
          <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
        </linearGradient>
        <pattern id="bk-grid" width="40" height="40" patternUnits="userSpaceOnUse">
          <path
            d="M 40 0 L 0 0 0 40"
            fill="none"
            stroke={isLight ? 'rgba(146, 64, 14, 0.05)' : 'rgba(16,185,129,0.06)'}
            strokeWidth="1"
          />
        </pattern>
      </defs>

      <rect width={W} height={H} fill="url(#bk-grid)" />

      {/* Area */}
      <path d={areaPath} fill="url(#bk-area)" />

      {/* Candles */}
      {candles.slice(0, Math.floor(candles.length * progress)).map((c, i) => (
        <g key={i} opacity="0.35">
          <line x1={c.x} y1={c.yH} x2={c.x} y2={c.yL} stroke={c.up ? '#10b981' : '#e11d48'} strokeWidth="1" />
          <rect
            x={c.x - 3}
            y={Math.min(c.yO, c.yC)}
            width="6"
            height={Math.max(2, Math.abs(c.yC - c.yO))}
            fill={c.up ? '#10b981' : '#e11d48'}
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
          stroke="#10b981"
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
function HeroTickerChip({ label, value, change, theme = 'dark' }) {
  const up = change >= 0
  const isLight = theme === 'light'
  return (
    <div
      className="flex items-center gap-2.5 px-3 py-2 rounded-xl"
      style={{
        background: isLight ? 'rgba(255, 255, 255, 0.85)' : 'rgba(255, 255, 255, 0.04)',
        border: `1px solid ${up ? 'rgba(16, 185, 129, 0.30)' : 'rgba(225, 29, 72, 0.30)'}`,
        backdropFilter: 'blur(6px)',
        boxShadow: isLight ? '0 1px 3px rgba(15, 23, 42, 0.06)' : 'none',
      }}
    >
      <span
        className="text-[10px] uppercase tracking-[0.14em] font-semibold"
        style={{ color: isLight ? '#92400e' : 'rgba(252, 211, 77, 0.85)' }}
      >
        {label}
      </span>
      <span
        className="font-bold text-sm num-tabular"
        style={{ color: isLight ? '#0f172a' : '#ffffff' }}
      >
        {value}
      </span>
      <span
        className="text-[11px] font-bold num-tabular"
        style={{ color: up ? (isLight ? '#059669' : '#34d399') : (isLight ? '#dc2626' : '#f87171') }}
      >
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
  const macro = useMacroSnapshot()
  const theme = useTheme()
  const isLight = theme === 'light'

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
        login(data.user, data.token, data.refreshToken || null)
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

  // Hero özellik vitrini — her kart kendi vurgu rengini taşır.
  // accent = koyu tema RGB'si · accentLight = açık temada okunur koyu varyant.
  const features = [
    {
      icon: CandlestickChart,
      title: 'Gerçek Zamanlı BIST',
      stat: '510+ Hisse',
      subtitle: 'canlı fiyat akışı · heatmap',
      accent: '16, 185, 129',
      accentLight: '180, 83, 9',
    },
    {
      icon: Cpu,
      title: 'AI Hisse Skoru',
      stat: '14 Gösterge',
      subtitle: 'RSI · MACD · SNR derin motor',
      accent: '245, 158, 11',
      accentLight: '180, 83, 9',
    },
    {
      icon: Bot,
      title: 'Otomatik Trading Bot',
      stat: 'Backtest + Canlı',
      subtitle: 'strateji motoru · sanal portföy',
      accent: '16, 185, 129',
      accentLight: '4, 120, 87',
      isNew: true,
    },
    {
      icon: XLogo,
      title: 'X Gündem Taraması',
      stat: '549 Sembol',
      subtitle: 'canlı sosyal duygu radarı',
      accent: '56, 189, 248',
      accentLight: '2, 132, 199',
      isNew: true,
    },
    {
      icon: Layers,
      title: 'Kripto + MTF Sinyal',
      stat: '7 Zaman Dilimi',
      subtitle: 'top 100 coin · Bayesian skor',
      accent: '139, 92, 246',
      accentLight: '109, 40, 217',
      isNew: true,
    },
    {
      icon: Radar,
      title: 'Akıllı Sinyal Motoru',
      stat: 'Canlı',
      subtitle: 'günlük tespit · al-sat alarmı',
      accent: '244, 63, 94',
      accentLight: '190, 18, 60',
    },
  ]

  // ═══════════════════════════════════════════════════════════════════════
  // Login form panel — hem cinematic hem welcome layout tarafından kullanılır.
  // Tüm form state'i closure üzerinden gelir, ekstra prop geçmeye gerek yok.
  // ═══════════════════════════════════════════════════════════════════════
  const loginPanel = (
    <div className="max-w-[400px] w-full relative z-10">
      {/* Mobile brand */}
      <div className="text-center mb-8 lg:hidden">
        <div className="inline-flex mb-4">
          <BrandMark size="xl" />
        </div>
        <h1 className="text-2xl font-bold text-gold-shimmer tracking-wider">BORSA KRALI</h1>
        <p className="text-amber-400/80 text-[10px] uppercase tracking-[0.22em] font-bold mt-1">Obsidian Edition</p>
        <Link
          to="/yenilikler"
          className="group relative inline-flex items-center gap-2 mt-5 px-5 py-2.5 rounded-xl text-[13px] font-bold overflow-hidden transition-transform hover:scale-[1.04]"
          style={{
            background: 'linear-gradient(135deg, var(--gold-300) 0%, var(--gold-500) 100%)',
            color: '#1a1208',
            boxShadow: '0 8px 24px -6px rgba(16, 185, 129, 0.55), inset 0 1px 0 rgba(255, 255, 255, 0.45)',
          }}
        >
          <span
            aria-hidden="true"
            className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-[1100ms] ease-out"
            style={{ background: 'linear-gradient(120deg, transparent 30%, rgba(255, 255, 255, 0.6) 50%, transparent 70%)' }}
          />
          <Sparkles className="w-4 h-4 relative" />
          <span className="relative">Platformu Tanı</span>
          <ArrowRight className="w-4 h-4 relative transition-transform group-hover:translate-x-0.5" />
        </Link>
      </div>

      {/* Form card */}
      <div className="surface-card-gold p-7 sm:p-8 relative overflow-hidden">
        <div
          className="absolute top-0 left-0 right-0 h-[2px]"
          style={{ background: 'linear-gradient(90deg, transparent, var(--gold-300), transparent)' }}
        />

        <div className="mb-6">
          <h2
            className="text-2xl font-bold tracking-tight mb-1.5"
            style={{ color: isLight ? '#0f172a' : '#ffffff' }}
          >
            Tekrar Hoş Geldiniz
          </h2>
          <p
            className="text-[13px]"
            style={{ color: isLight ? '#64748b' : '#94a3b8' }}
          >
            Premium hesabınıza giriş yapın
          </p>
        </div>

        {error && (
          <div className="mb-5 p-3.5 rounded-xl flex items-start gap-2.5 text-[13px]"
            style={{
              background: 'rgba(225, 29, 72, 0.08)',
              border: '1px solid rgba(225, 29, 72, 0.25)',
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
              background: 'rgba(16, 185, 129, 0.08)',
              border: '1px solid rgba(16, 185, 129, 0.25)',
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

          <Button
            type="submit"
            variant="gold"
            size="lg"
            block
            loading={loading}
            iconRight={ArrowRight}
            disabled={!email.trim() || !password}
            className="mt-1.5"
          >
            {loading ? 'Giriş yapılıyor…' : 'Krallığa Gir'}
          </Button>
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

        {/* Google Sign-In */}
        <GoogleSignInButton
          onError={(msg) => setError(msg)}
          redirectTo="/"
          label="Google ile giriş yap"
        />

        <div className="my-3" />

        {/* Demo */}
        <button
          onClick={handleDemoLogin}
          className="w-full relative overflow-hidden rounded-xl py-3 px-4 flex items-center justify-center gap-2.5 font-semibold text-[13px] transition-all group"
          style={{
            background: isLight
              ? 'linear-gradient(135deg, rgba(59, 130, 246, 0.10), rgba(99, 102, 241, 0.05))'
              : 'linear-gradient(135deg, rgba(59, 130, 246, 0.12), rgba(99, 102, 241, 0.06))',
            border: '1px solid rgba(59, 130, 246, 0.30)',
            color: isLight ? '#1e40af' : '#bfdbfe',
          }}
        >
          <PlayCircle className="w-4 h-4 text-blue-400 group-hover:text-blue-300" />
          Demo Hesapla Keşfet
          <span className="pill pill-azure ml-1 !text-[9px]">Tam Erişim</span>
        </button>
        <p
          className="text-[11px] text-center mt-2"
          style={{ color: isLight ? '#64748b' : '#64748b' }}
        >
          Demo modunda tüm analiz araçlarına gerçek verilerle erişin
        </p>

        <div className="mt-6 text-center">
          <p
            className="text-[13px]"
            style={{ color: isLight ? '#475569' : '#94a3b8' }}
          >
            Henüz üye değil misiniz?{' '}
            <Link to="/register" className="text-amber-400 hover:text-amber-300 font-bold transition-colors">
              Krallığa Katılın →
            </Link>
          </p>
        </div>
      </div>

      <p
        className="text-center text-[10px] mt-5 leading-relaxed"
        style={{ color: isLight ? '#94a3b8' : '#475569' }}
      >
        Yatırım tavsiyesi değildir · Eğitim amaçlı platform
      </p>

      <div
        className="mt-3 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[10px]"
        style={{ color: isLight ? '#94a3b8' : '#64748b' }}
      >
        <Link to="/hakkimizda" className="hover:text-amber-400">Hakkımızda</Link>
        <span>·</span>
        <Link to="/iletisim" className="hover:text-amber-400">İletişim</Link>
        <span>·</span>
        <Link to="/privacy-policy" className="hover:text-amber-400">Gizlilik</Link>
        <span>·</span>
        <Link to="/terms-of-use" className="hover:text-amber-400">Kullanım Koşulları</Link>
        <span>·</span>
        <Link to="/account-deletion" className="hover:text-amber-400">Hesap Silme</Link>
      </div>
    </div>
  )

  // ═══════════════════════════════════════════════════════════════════════
  // CINEMATIC LAYOUT — tek sayfa: sol kolon hero, sağ kolon login.
  // Tanıtım / yenilikler /yenilikler route'unda standalone duruyor.
  // ═══════════════════════════════════════════════════════════════════════
  return (
    <div className="min-h-screen flex auth-backdrop" style={{ backgroundColor: 'var(--bg-base)' }}>
      {/* ═════════════════════════════════════════════════════════════════════
          LEFT — CINEMATIC HERO
          ═════════════════════════════════════════════════════════════════════ */}
      <div
        className="hidden lg:flex lg:w-[58%] relative overflow-hidden flex-col"
        style={{
          background: isLight
            ? 'linear-gradient(135deg, #fef9f0 0%, #fdf3df 35%, #fff 70%, #fef9f0 100%)'
            : 'linear-gradient(135deg, #060a14 0%, #0a1020 35%, #0f172a 70%, #060a14 100%)',
        }}
      >
        {/* Animated chart backdrop */}
        <div className="absolute inset-0">
          <CinematicChartBackdrop theme={theme} />
        </div>

        {/* Vignette */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: isLight
              ? 'radial-gradient(ellipse 80% 60% at 50% 40%, transparent 30%, rgba(254, 243, 199, 0.55) 100%)'
              : 'radial-gradient(ellipse 80% 60% at 50% 40%, transparent 30%, rgba(3,6,13,0.65) 100%)',
          }}
        />

        {/* Floating gold particles — sadece koyu temada görünür (açık zeminde
             zaten görünmüyorlar, isteğe bağlı dekoratif) */}
        {!isLight && (
          <>
            <div className="absolute top-[18%] left-[12%] w-1.5 h-1.5 rounded-full bg-amber-300/50 float-slow" />
            <div className="absolute top-[35%] right-[18%] w-1 h-1 rounded-full bg-amber-200/60 float-slow" style={{ animationDelay: '1s' }} />
            <div className="absolute bottom-[28%] left-[22%] w-2 h-2 rounded-full bg-amber-400/40 float-slow" style={{ animationDelay: '2s' }} />
            <div className="absolute bottom-[18%] right-[10%] w-1 h-1 rounded-full bg-amber-200/50 float-slow" style={{ animationDelay: '3s' }} />
          </>
        )}

        {/* Top bar — brand + ticker chips */}
        <div className="relative z-10 flex items-center justify-between p-8 gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <BrandMark size="lg" />
            <div>
              <h1 className="text-xl font-bold text-gold-shimmer tracking-wider leading-none">BORSA KRALI</h1>
              <p
                className="text-[10px] uppercase tracking-[0.22em] font-bold mt-1"
                style={{ color: isLight ? '#92400e' : 'rgba(252, 211, 77, 0.70)' }}
              >
                Obsidian Edition
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <Link
              to="/yenilikler"
              className="group relative inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-[13.5px] font-bold overflow-hidden transition-transform hover:scale-[1.04]"
              style={{
                background: 'linear-gradient(135deg, var(--gold-300) 0%, var(--gold-500) 100%)',
                color: '#1a1208',
                boxShadow: '0 8px 26px -6px rgba(16, 185, 129, 0.55), inset 0 1px 0 rgba(255, 255, 255, 0.45)',
              }}
            >
              <span
                aria-hidden="true"
                className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-[1100ms] ease-out"
                style={{ background: 'linear-gradient(120deg, transparent 30%, rgba(255, 255, 255, 0.6) 50%, transparent 70%)' }}
              />
              <Sparkles className="w-4 h-4 relative" />
              <span className="relative">Platformu Tanı</span>
              <ArrowRight className="w-4 h-4 relative transition-transform group-hover:translate-x-0.5" />
            </Link>
            <div className="hidden xl:flex items-center gap-2">
              {macro.bist100 && (
                <HeroTickerChip
                  label="BIST 100"
                  value={formatTr(macro.bist100.value, { frac: 2 })}
                  change={macro.bist100.change ?? 0}
                  theme={theme}
                />
              )}
              {macro.usdtry && (
                <HeroTickerChip
                  label="USD/TRY"
                  value={formatTr(macro.usdtry.value, { frac: 2 })}
                  change={macro.usdtry.change ?? 0}
                  theme={theme}
                />
              )}
              {macro.gold && (
                <HeroTickerChip
                  label="GRAM"
                  value={formatTr(macro.gold.value, { frac: 0 })}
                  change={macro.gold.change ?? 0}
                  theme={theme}
                />
              )}
            </div>
          </div>
        </div>

        {/* Big hero copy */}
        <div className="relative z-10 flex-1 flex flex-col justify-center px-12 pb-12">
          <div className="max-w-xl">
            <div className="inline-flex items-center gap-2 mb-5 pill pill-gold">
              <span className="status-dot status-dot-gold" />
              Premium Analiz Platformu
            </div>

            <h2
              className="text-[3.25rem] leading-[1.05] font-black tracking-tight mb-5"
              style={{ color: isLight ? '#0f172a' : '#ffffff' }}
            >
              Borsanın
              <br />
              <span className="text-gold-shimmer">Kralı Olmak</span>
              <br />
              Bir Tıklama Uzakta.
            </h2>

            <p
              className="text-base leading-relaxed mb-7 max-w-md"
              style={{ color: isLight ? '#475569' : '#cbd5e1' }}
            >
              Profesyonel BIST ve kripto analizi · otomatik trading botları · AI
              destekli sinyaller. Tüm araçlar, tek bir cebinizde.
            </p>

            {/* Feature grid — 6 kart, her biri kendi vurgu rengiyle */}
            <div className="grid grid-cols-2 gap-2.5 max-w-lg">
              {features.map((f, i) => {
                const Icon = f.icon
                const ac = isLight ? f.accentLight : f.accent
                return (
                  <div
                    key={i}
                    className="group relative overflow-hidden rounded-2xl p-3.5 transition-all duration-300 hover:translate-y-[-3px]"
                    style={{
                      background: isLight ? 'rgba(255, 255, 255, 0.88)' : 'rgba(255, 255, 255, 0.03)',
                      border: `1px solid rgba(${f.accent}, ${isLight ? 0.32 : 0.18})`,
                      backdropFilter: 'blur(8px)',
                      boxShadow: isLight ? '0 1px 4px rgba(15, 23, 42, 0.06)' : 'none',
                    }}
                  >
                    {/* Vurgu üst çizgisi */}
                    <span
                      aria-hidden="true"
                      className="absolute inset-x-0 top-0 h-px"
                      style={{ background: `linear-gradient(90deg, transparent, rgba(${f.accent}, 0.7), transparent)` }}
                    />
                    {/* Hover'da vurgu parıltısı */}
                    <div
                      className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
                      style={{ background: `radial-gradient(140px 90px at 24% 0%, rgba(${f.accent}, 0.18), transparent 70%)` }}
                    />

                    {/* "Yeni" rozeti */}
                    {f.isNew && (
                      <span
                        className="absolute top-2.5 right-2.5 text-[8px] font-black uppercase tracking-[0.14em] px-1.5 py-0.5 rounded-md"
                        style={{
                          background: `rgba(${f.accent}, 0.16)`,
                          color: `rgb(${ac})`,
                          border: `1px solid rgba(${f.accent}, 0.5)`,
                        }}
                      >
                        Yeni
                      </span>
                    )}

                    {/* İkon kutucuğu */}
                    <div
                      className="w-9 h-9 rounded-xl flex items-center justify-center mb-2.5 transition-transform duration-300 group-hover:scale-110"
                      style={{
                        background: `linear-gradient(135deg, rgba(${f.accent}, 0.20), rgba(${f.accent}, 0.05))`,
                        border: `1px solid rgba(${f.accent}, 0.38)`,
                      }}
                    >
                      <Icon className="w-[18px] h-[18px]" strokeWidth={2.2} style={{ color: `rgb(${ac})` }} />
                    </div>

                    <div
                      className="text-[10px] font-bold uppercase tracking-[0.1em]"
                      style={{ color: `rgb(${ac})` }}
                    >
                      {f.stat}
                    </div>
                    <div
                      className="text-[13.5px] font-semibold leading-tight mt-0.5"
                      style={{ color: isLight ? '#0f172a' : '#ffffff' }}
                    >
                      {f.title}
                    </div>
                    <div
                      className="text-[10.5px] mt-1 leading-snug"
                      style={{ color: isLight ? '#64748b' : '#94a3b8' }}
                    >
                      {f.subtitle}
                    </div>
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
            <p
              className="text-[11px]"
              style={{ color: isLight ? '#64748b' : '#64748b' }}
            >
              © {new Date().getFullYear()} Borsa Kralı · Tüm hakları saklıdır.
            </p>
            <p
              className="text-[10px] uppercase tracking-wider"
              style={{ color: isLight ? '#94a3b8' : '#475569' }}
            >
              v4.4 · Obsidian
            </p>
          </div>
        </div>

        {/* Sağ kenarda yumuşak alpha fade — sol panelin sağ formla buluştuğu
             yerdeki keskin sınırı eritir. */}
        <div
          aria-hidden="true"
          className="absolute top-0 right-0 bottom-0 w-32 pointer-events-none z-20"
          style={{
            background: isLight
              ? 'linear-gradient(90deg, transparent 0%, rgba(255, 255, 255, 0.35) 60%, rgba(255, 255, 255, 0.85) 100%)'
              : 'linear-gradient(90deg, transparent 0%, rgba(3, 6, 13, 0.45) 60%, rgba(3, 6, 13, 0.85) 100%)',
          }}
        />

        {/* Hairline gold accent — iki panel arasındaki ortak çizgi. */}
        <div
          aria-hidden="true"
          className="absolute top-[12%] right-0 bottom-[12%] w-px pointer-events-none z-30"
          style={{
            background: isLight
              ? 'linear-gradient(180deg, transparent 0%, rgba(16, 185, 129, 0.55) 30%, rgba(16, 185, 129, 0.55) 70%, transparent 100%)'
              : 'linear-gradient(180deg, transparent 0%, rgba(16, 185, 129, 0.45) 30%, rgba(16, 185, 129, 0.45) 70%, transparent 100%)',
            boxShadow: isLight
              ? '0 0 24px rgba(16, 185, 129, 0.20)'
              : '0 0 32px rgba(16, 185, 129, 0.25)',
          }}
        />
      </div>

      {/* ═════════════════════════════════════════════════════════════════════
          RIGHT — LOGIN FORM
          ═════════════════════════════════════════════════════════════════════ */}
      <div className="w-full lg:w-[42%] flex items-center justify-center p-6 sm:p-10 relative z-10">
        {/* Sol panelden taşan ışık huzmesi — geçişin "okunmasını" sağlar */}
        <div
          aria-hidden="true"
          className="hidden lg:block absolute inset-y-0 left-0 w-[55%] pointer-events-none"
          style={{
            background: isLight
              ? 'radial-gradient(ellipse 80% 60% at 0% 50%, rgba(254, 243, 199, 0.55) 0%, rgba(254, 243, 199, 0.18) 35%, transparent 70%)'
              : 'radial-gradient(ellipse 80% 60% at 0% 50%, rgba(16, 185, 129, 0.10) 0%, rgba(16, 185, 129, 0.04) 35%, transparent 70%)',
          }}
        />

        {loginPanel}
      </div>
    </div>
  )
}
