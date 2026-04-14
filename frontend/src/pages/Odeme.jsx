import { useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft, CreditCard, Lock, ShieldCheck } from 'lucide-react'

export default function Odeme() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const planId = params.get('plan') || 'starter_monthly'

  const PLAN_NAMES = {
    starter_monthly: 'Baslangic',
    pro_monthly: 'Pro',
    elite_once: 'Elite Paket',
    premium_once: 'Premium Paket',
    lifetime: 'Omur Boyu',
  }

  return (
    <div className="max-w-md mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate('/abonelik')}
          className="w-9 h-9 bg-dark-800 rounded-xl flex items-center justify-center text-gray-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-xl font-bold text-white">Odeme</h1>
      </div>

      <div className="p-4 bg-gold-500/10 border border-gold-500/30 rounded-xl">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gold-500/20 rounded-xl flex items-center justify-center">
            <CreditCard className="w-5 h-5 text-gold-400" />
          </div>
          <div>
            <p className="text-xs text-gray-400">Secili Plan</p>
            <p className="font-semibold text-white">{PLAN_NAMES[planId] || planId}</p>
          </div>
        </div>
      </div>

      <div className="card text-center py-12">
        <div className="w-20 h-20 bg-yellow-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
          <Lock className="w-10 h-10 text-yellow-400" />
        </div>
        <h2 className="text-xl font-bold text-white mb-2">Odeme Sistemi</h2>
        <p className="text-gray-400 text-sm leading-relaxed mb-6">
          Ilk Play Store surumunde uygulama ucretsiz olarak sunulacaktir.
          Uygulama ici odeme yapisi daha sonra platform kurallarina uygun sekilde etkinlestirilecektir.
        </p>

        <div className="rounded-2xl border border-white/5 bg-dark-900/40 p-4 text-left">
          <div className="flex gap-3">
            <ShieldCheck className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-gray-300">
              Bu surumde kullanici uygulama disi odemeye yonlendirilmez. Dijital abonelik sunulursa Google Play faturalandirma akisi kullanilacaktir.
            </p>
          </div>
        </div>

        <button
          onClick={() => navigate('/abonelik')}
          className="btn-secondary w-full flex items-center justify-center gap-2 mt-6"
        >
          <ArrowLeft className="w-4 h-4" />
          Planlara Don
        </button>
      </div>
    </div>
  )
}
