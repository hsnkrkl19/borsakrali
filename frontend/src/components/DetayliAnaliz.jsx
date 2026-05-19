import { Target, Activity } from 'lucide-react'

/**
 * Detaylı Analiz — GunlukTespitler "araclar/detay" sub-tab içeriği.
 * Strateji başına sinyal sayımı + sektör dağılımı kartları.
 */
export default function DetayliAnaliz({ signals = [] }) {
  const strategyStats = [
    { name: 'RSI Asiri Satim', count: signals.filter(s => s.strategy?.includes('RSI')).length, color: 'bg-green-500' },
    { name: 'MACD Kesisim', count: signals.filter(s => s.strategy?.includes('MACD')).length, color: 'bg-blue-500' },
    { name: 'EMA Kesisim', count: signals.filter(s => s.strategy?.includes('EMA')).length, color: 'bg-gold-400' },
    { name: 'Bollinger', count: signals.filter(s => s.strategy?.includes('Bollinger')).length, color: 'bg-yellow-500' },
  ]

  const sectorStats = Object.entries(
    signals.reduce((acc, s) => {
      const sector = s.sector || 'Diger'
      acc[sector] = (acc[sector] || 0) + 1
      return acc
    }, {})
  ).slice(0, 5)

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
      {/* Strateji Istatistikleri */}
      <div className="card">
        <h3 className="text-white font-semibold text-sm md:text-base mb-3 md:mb-4 flex items-center gap-2">
          <Target className="w-4 h-4 md:w-5 md:h-5 text-primary-500" />
          Strateji Istatistikleri
        </h3>
        <div className="space-y-2 md:space-y-3">
          {strategyStats.map((stat, idx) => (
            <div key={idx} className="flex items-center justify-between bg-dark-800 rounded-lg p-2.5 md:p-3">
              <div className="flex items-center gap-2">
                <div className={`w-2.5 h-2.5 md:w-3 md:h-3 rounded-full ${stat.color}`}></div>
                <span className="text-gray-300 text-sm md:text-base">{stat.name}</span>
              </div>
              <span className="text-white font-semibold text-sm md:text-base">{stat.count}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Sektor Dagilimi */}
      <div className="card">
        <h3 className="text-white font-semibold text-sm md:text-base mb-3 md:mb-4 flex items-center gap-2">
          <Activity className="w-4 h-4 md:w-5 md:h-5 text-primary-500" />
          Sektor Dagilimi
        </h3>
        <div className="space-y-2 md:space-y-3">
          {sectorStats.map(([sector, count], idx) => (
            <div key={idx} className="flex items-center justify-between bg-dark-800 rounded-lg p-2.5 md:p-3">
              <span className="text-gray-300 text-sm md:text-base truncate max-w-[150px]">{sector}</span>
              <span className="text-white font-semibold text-sm md:text-base">{count} sinyal</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
