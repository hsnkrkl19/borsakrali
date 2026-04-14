import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Crown, Check, Zap, Star, Infinity, Sparkles, ArrowRight, AlertCircle } from 'lucide-react'
import { useAuthStore } from '../store/authStore'
import { useUsageStore } from '../store/usageStore'
import api from '../services/api'

const PLAN_ICONS = {
  free: Zap,
  starter_monthly: Star,
  pro_monthly: Crown,
  elite_once: Sparkles,
  premium_once: Sparkles,
  lifetime: Infinity,
}

const PLAN_COLORS = {
  free: 'border-gray-600 bg-dark-800',
  starter_monthly: 'border-blue-500/50 bg-blue-500/5',
  pro_monthly: 'border-gold-500/60 bg-gold-500/5',
  elite_once: 'border-purple-500/50 bg-purple-500/5',
  premium_once: 'border-purple-500/50 bg-purple-500/5',
  lifetime: 'border-gold-400/80 bg-gradient-to-br from-gold-500/10 to-yellow-500/5',
}

export default function Abonelik() {
  const [plans, setPlans] = useState([])
  const [loading, setLoading] = useState(true)
  const [upgrading, setUpgrading] = useState(null)
  const [message, setMessage] = useState(null)
  const { user } = useAuthStore()
  const { plan: currentPlan, setPlan } = useUsageStore()
  const navigate = useNavigate()

  useEffect(() => {
    api.get('/subscription/plans')
      .then(r => setPlans(r.data.plans || []))
      .catch(() => setPlans([]))
      .finally(() => setLoading(false))
  }, [])

  const handleUpgrade = async (planId) => {
    if (planId === 'free') return
    setUpgrading(planId)
    setMessage(null)
    try {
      const r = await api.post('/subscription/upgrade', { planId })
      if (r.data.success) {
        setPlan(planId)
        setMessage({ type: 'success', text: r.data.message + ' ' + (r.data.note || '') })
      }
    } catch (err) {
      const msg = err.response?.data?.error || 'Bir hata oluştu'
      setMessage({ type: 'error', text: msg })
    } finally {
      setUpgrading(null)
    }
  }

  // TEST AŞAMASI — abonelik sistemi henüz aktif değil
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-6 px-4">
      <div className="w-20 h-20 rounded-full bg-gold-500/10 border border-gold-500/30 flex items-center justify-center">
        <Crown className="w-10 h-10 text-gold-400" />
      </div>
      <div className="text-center space-y-2">
        <h1 className="text-2xl font-bold text-white">Abonelik Sistemi</h1>
        <p className="text-gold-400 font-medium">Yakında Aktif Olacak</p>
        <p className="text-gray-400 text-sm max-w-md">
          Abonelik işlemleri şu an test aşamasındadır. Platform ücretsiz olarak kullanılmaya devam etmektedir.
          Abonelik sistemi yakında devreye girecektir.
        </p>
      </div>
      <div className="bg-surface-100 border border-gold-500/20 rounded-xl p-4 max-w-sm w-full text-center">
        <p className="text-sm text-gray-400">Tüm özellikler <span className="text-green-400 font-semibold">ücretsiz</span> olarak aktif</p>
        <p className="text-xs text-gray-500 mt-1">Abonelik sistemi devreye girdiğinde bildirim alacaksınız</p>
      </div>
    </div>
  )

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-gold-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  // eslint-disable-next-line no-unreachable
  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="text-center">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-gold-500/10 border border-gold-500/30 rounded-full mb-3">
          <Crown className="w-4 h-4 text-gold-400" />
          <span className="text-sm text-gold-400 font-medium">Abonelik Planları</span>
        </div>
        <h1 className="text-2xl font-bold text-white mb-2">Borsa Krali'yi Açın</h1>
        <p className="text-gray-400 text-sm">Profesyonel borsa analizi için en uygun planı seçin</p>
      </div>

      {/* Current Plan Banner */}
      <div className="p-4 bg-dark-800 border border-gold-500/20 rounded-xl flex items-center gap-3">
        <div className="w-10 h-10 bg-gold-500/20 rounded-xl flex items-center justify-center">
          <Crown className="w-5 h-5 text-gold-400" />
        </div>
        <div className="flex-1">
          <p className="text-sm text-gray-400">Mevcut Plan</p>
          <p className="font-semibold text-white capitalize">
            {plans.find(p => p.id === currentPlan)?.name || 'Ücretsiz'}
          </p>
        </div>
        {currentPlan !== 'free' && (
          <span className="px-3 py-1 bg-gold-500/20 text-gold-400 text-xs rounded-full font-medium">Aktif</span>
        )}
      </div>

      {/* Message */}
      {message && (
        <div className={`p-4 rounded-xl flex items-start gap-3 ${message.type === 'success' ? 'bg-green-500/10 border border-green-500/30 text-green-400' : 'bg-red-500/10 border border-red-500/30 text-red-400'}`}>
          <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <p className="text-sm">{message.text}</p>
        </div>
      )}

      {/* Monthly Plans */}
      <div>
        <h2 className="text-xs text-gray-500 uppercase tracking-wider mb-3 px-1">Aylık Abonelik</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {plans.filter(p => p.period === 'monthly' || p.period === null).map(plan => {
            const Icon = PLAN_ICONS[plan.id] || Zap
            const isActive = currentPlan === plan.id
            const isBest = plan.id === 'pro_monthly'
            return (
              <div key={plan.id} className={`relative rounded-2xl border-2 p-5 transition-all ${PLAN_COLORS[plan.id]} ${isActive ? 'ring-2 ring-gold-400' : ''}`}>
                {plan.badge && (
                  <div className="absolute -top-3 right-4">
                    <span className={`px-3 py-1 text-xs font-bold rounded-full ${isBest ? 'bg-gold-500 text-dark-950' : 'bg-blue-500 text-white'}`}>
                      {plan.badge}
                    </span>
                  </div>
                )}

                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isBest ? 'bg-gold-500/20' : 'bg-dark-700'}`}>
                      <Icon className={`w-5 h-5 ${isBest ? 'text-gold-400' : 'text-gray-400'}`} />
                    </div>
                    <div>
                      <p className="font-bold text-white">{plan.name}</p>
                      <p className="text-xs text-gray-500">{plan.period === 'monthly' ? 'Aylık' : 'Ücretsiz'}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-2xl font-bold text-white">{plan.price > 0 ? `₺${plan.price}` : 'Ücretsiz'}</span>
                    {plan.period === 'monthly' && <span className="text-xs text-gray-500">/ay</span>}
                  </div>
                </div>

                <ul className="space-y-2 mb-5">
                  {plan.features.map((f, i) => (
                    <li key={i} className="flex items-center gap-2 text-sm text-gray-300">
                      <Check className="w-4 h-4 text-green-400 flex-shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>

                <button
                  onClick={() => !isActive && plan.price > 0 && handleUpgrade(plan.id)}
                  disabled={isActive || upgrading === plan.id || plan.id === 'free'}
                  className={`w-full py-3 rounded-xl font-medium text-sm flex items-center justify-center gap-2 transition-all ${
                    isActive
                      ? 'bg-gold-500/20 text-gold-400 cursor-default border border-gold-500/40'
                      : plan.id === 'free'
                      ? 'bg-dark-700 text-gray-500 cursor-default'
                      : isBest
                      ? 'bg-gradient-to-r from-gold-500 to-gold-600 text-dark-950 font-bold hover:from-gold-400 hover:to-gold-500 active:scale-95'
                      : 'bg-blue-600 text-white hover:bg-blue-500 active:scale-95'
                  }`}
                >
                  {upgrading === plan.id ? (
                    <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  ) : isActive ? (
                    <>
                      <Check className="w-4 h-4" /> Aktif Plan
                    </>
                  ) : plan.id === 'free' ? (
                    'Mevcut Plan'
                  ) : (
                    <>
                      Seç <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </div>
            )
          })}
        </div>
      </div>

      {/* One-Time Plans */}
      <div>
        <h2 className="text-xs text-gray-500 uppercase tracking-wider mb-3 px-1">Tek Seferlik Ödeme</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {plans.filter(p => p.period === 'once' || p.period === 'lifetime').map(plan => {
            const Icon = PLAN_ICONS[plan.id] || Sparkles
            const isActive = currentPlan === plan.id
            const isLifetime = plan.id === 'lifetime'
            return (
              <div key={plan.id} className={`relative rounded-2xl border-2 p-5 transition-all ${PLAN_COLORS[plan.id]} ${isActive ? 'ring-2 ring-gold-400' : ''}`}>
                {plan.badge && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className={`px-3 py-1 text-xs font-bold rounded-full whitespace-nowrap ${isLifetime ? 'bg-gradient-to-r from-gold-500 to-yellow-400 text-dark-950' : 'bg-purple-500 text-white'}`}>
                      {plan.badge}
                    </span>
                  </div>
                )}

                <div className="text-center mb-4 pt-2">
                  <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-3 ${isLifetime ? 'bg-gold-500/20' : 'bg-purple-500/20'}`}>
                    <Icon className={`w-6 h-6 ${isLifetime ? 'text-gold-400' : 'text-purple-400'}`} />
                  </div>
                  <p className="font-bold text-white">{plan.name}</p>
                  <div className="mt-1">
                    <span className="text-3xl font-bold text-white">₺{plan.price}</span>
                    <span className="text-xs text-gray-500 ml-1">tek ödeme</span>
                  </div>
                </div>

                <ul className="space-y-1.5 mb-4">
                  {plan.features.map((f, i) => (
                    <li key={i} className="flex items-center gap-2 text-xs text-gray-300">
                      <Check className={`w-3.5 h-3.5 flex-shrink-0 ${isLifetime ? 'text-gold-400' : 'text-purple-400'}`} />
                      {f}
                    </li>
                  ))}
                </ul>

                <button
                  onClick={() => !isActive && handleUpgrade(plan.id)}
                  disabled={isActive || upgrading === plan.id}
                  className={`w-full py-2.5 rounded-xl font-medium text-sm flex items-center justify-center gap-2 transition-all ${
                    isActive
                      ? 'bg-gold-500/20 text-gold-400 cursor-default border border-gold-500/40'
                      : isLifetime
                      ? 'bg-gradient-to-r from-gold-500 to-yellow-400 text-dark-950 font-bold hover:opacity-90 active:scale-95'
                      : 'bg-purple-600 text-white hover:bg-purple-500 active:scale-95'
                  }`}
                >
                  {upgrading === plan.id ? (
                    <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  ) : isActive ? (
                    <>
                      <Check className="w-4 h-4" /> Aktif
                    </>
                  ) : (
                    <>
                      Satın Al <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </div>
            )
          })}
        </div>
      </div>

      {/* Payment Notice */}
      <div className="p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-xl flex items-start gap-3">
        <AlertCircle className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-medium text-yellow-300">Ödeme Sistemi Yakında</p>
          <p className="text-xs text-gray-400 mt-1">
            Ödeme altyapısı kurulum aşamasındadır. Şu an planları test amaçlı deneyebilirsiniz.
            Gerçek ödeme için destek ekibiyle iletişime geçin.
          </p>
        </div>
      </div>
    </div>
  )
}
