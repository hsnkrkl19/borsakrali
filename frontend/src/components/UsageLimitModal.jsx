import { Crown, Play, X, Zap } from 'lucide-react'
import { useUsageStore, DAILY_LIMIT, AD_REWARD } from '../store/usageStore'
import { showRewardedAd } from '../utils/adManager'

export default function UsageLimitModal({ onClose }) {
  const { addBonus, getRemaining } = useUsageStore()

  const handleWatchAd = async () => {
    try {
      const rewarded = await showRewardedAd()
      if (rewarded) {
        addBonus(AD_REWARD)
        onClose(true) // true = bonus eklendi, işleme devam et
      }
    } catch (e) {
      console.error('Reklam hatası:', e)
      // Reklam yüklenmediyse yine de bonus ver (geliştirme modunda)
      if (import.meta.env.DEV) {
        addBonus(AD_REWARD)
        onClose(true)
      }
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-sm bg-dark-900 border border-gold-500/30 rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-gold-500/20 to-gold-600/10 p-5 text-center border-b border-gold-500/20">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-gold-500/20 rounded-full mb-3">
            <Zap className="w-7 h-7 text-gold-400" />
          </div>
          <h2 className="text-xl font-bold text-white">Günlük Limit Doldu</h2>
          <p className="text-sm text-gray-400 mt-1">
            Bugünkü {DAILY_LIMIT} ücretsiz analiz hakkınızı kullandınız.
          </p>
        </div>

        {/* Options */}
        <div className="p-5 space-y-3">
          {/* Watch Ad */}
          <button
            onClick={handleWatchAd}
            className="w-full flex items-center gap-4 p-4 bg-primary-500/10 border border-primary-500/30 rounded-xl hover:bg-primary-500/20 transition-all text-left"
          >
            <div className="w-10 h-10 bg-primary-500/20 rounded-full flex items-center justify-center flex-shrink-0">
              <Play className="w-5 h-5 text-primary-400 ml-0.5" />
            </div>
            <div className="flex-1">
              <p className="text-white font-semibold text-sm">Reklam İzle</p>
              <p className="text-gray-400 text-xs">+{AD_REWARD} kullanım hakkı kazan — ücretsiz</p>
            </div>
            <span className="text-primary-400 font-bold text-sm">ÜCRETSİZ</span>
          </button>

          {/* Premium */}
          <button
            onClick={() => onClose('premium')}
            className="w-full flex items-center gap-4 p-4 bg-gold-500/10 border border-gold-500/30 rounded-xl hover:bg-gold-500/20 transition-all text-left"
          >
            <div className="w-10 h-10 bg-gold-500/20 rounded-full flex items-center justify-center flex-shrink-0">
              <Crown className="w-5 h-5 text-gold-400" />
            </div>
            <div className="flex-1">
              <p className="text-white font-semibold text-sm">Premium'a Geç</p>
              <p className="text-gray-400 text-xs">Sınırsız analiz + öncelikli erişim</p>
            </div>
            <span className="text-gold-400 font-bold text-sm">PREMIUM</span>
          </button>
        </div>

        {/* Close */}
        <div className="px-5 pb-5">
          <button
            onClick={() => onClose(false)}
            className="w-full py-2.5 text-gray-500 hover:text-gray-300 text-sm transition-colors"
          >
            Daha sonra
          </button>
        </div>
      </div>
    </div>
  )
}
