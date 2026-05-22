import { useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft, CreditCard, Lock, ShieldCheck } from 'lucide-react'
import { Button } from '../components/ui'

export default function Odeme() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const planId = params.get('plan') || 'starter_monthly'

  const PLAN_NAMES = {
    starter_monthly: 'Başlangıç',
    pro_monthly: 'Pro',
    elite_once: 'Elite Paket',
    premium_once: 'Premium Paket',
    lifetime: 'Ömür Boyu',
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
        <h1 className="text-xl font-bold text-white">Ödeme</h1>
      </div>

      <div className="p-4 bg-gold-500/10 border border-gold-500/30 rounded-xl">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gold-500/20 rounded-xl flex items-center justify-center">
            <CreditCard className="w-5 h-5 text-gold-400" />
          </div>
          <div>
            <p className="text-xs text-gray-400">Seçili Plan</p>
            <p className="font-semibold text-white">{PLAN_NAMES[planId] || planId}</p>
          </div>
        </div>
      </div>

      <div className="card text-center py-12">
        <div className="w-20 h-20 bg-yellow-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
          <Lock className="w-10 h-10 text-yellow-400" />
        </div>
        <h2 className="text-xl font-bold text-white mb-2">Ödeme Sistemi</h2>
        <p className="text-gray-400 text-sm leading-relaxed mb-6">
          İlk Play Store sürümünde uygulama ücretsiz olarak sunulacaktır.
          Uygulama içi ödeme yapısı daha sonra platform kurallarına uygun şekilde etkinleştirilecektir.
        </p>

        <div className="rounded-2xl border border-white/5 bg-dark-900/40 p-4 text-left">
          <div className="flex gap-3">
            <ShieldCheck className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-gray-300">
              Bu sürümde kullanıcı uygulama dışı ödemeye yönlendirilmez. Dijital abonelik sunulursa Google Play faturalandırma akışı kullanılacaktır.
            </p>
          </div>
        </div>

        <Button variant="ghost" icon={ArrowLeft} className="w-full mt-6" onClick={() => navigate('/abonelik')}>Planlara Dön</Button>
      </div>
    </div>
  )
}
