import { Lock, MessageSquare, ShieldCheck } from 'lucide-react'

export default function IstekPaneli() {
  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="card text-center py-12">
        <div className="w-20 h-20 rounded-full bg-gold-500/10 border border-gold-500/20 flex items-center justify-center mx-auto mb-5">
          <Lock className="w-10 h-10 text-gold-400" />
        </div>
        <h1 className="text-2xl font-bold text-white mb-3">İstek Paneli</h1>
        <p className="text-gray-400 max-w-lg mx-auto leading-7">
          Bu özellik yayın güvenliği ve içerik moderasyonu iyileştirmeleri tamamlanana kadar geçici olarak pasifleştirildi.
          İlk Play Store sürümünde kullanıcı üretimli içerikler sınırlı tutulacaktır.
        </p>

        <div className="mt-8 grid gap-3 text-left">
          <div className="rounded-2xl border border-white/5 bg-dark-900/40 p-4 flex gap-3">
            <ShieldCheck className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-gray-300">
              Bu sayfa tekrar açıldığında bildirim, moderasyon ve kullanıcı kontrol yüzeyleriyle birlikte yayına alınacak.
            </p>
          </div>
          <div className="rounded-2xl border border-white/5 bg-dark-900/40 p-4 flex gap-3">
            <MessageSquare className="w-5 h-5 text-gold-400 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-gray-300">
              Destek ve geri bildirim için şu anda <span className="text-white font-medium">destek@borsakrali.com</span> adresi kullanılabilir.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
