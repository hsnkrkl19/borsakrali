import { TrendingUp, TrendingDown, Minus } from 'lucide-react'

export default function PiyasaGenelWidget() {
  const marketData = {
    rising: 457,
    falling: 124,
    unchanged: 45,
    volume: {
      total: '20 Günlük Ort',
      percentage: 82
    }
  }

  const totalStocks = marketData.rising + marketData.falling + marketData.unchanged

  return (
    <div className="card">
      <h3 className="text-sm font-semibold text-white mb-4">📈 PİYASA GENELİ</h3>

      {/* Yükselen/Düşen Bar */}
      <div className="mb-6">
        <div className="flex items-center justify-between text-xs text-gray-400 mb-2">
          <span>YÜKSELEN</span>
          <span className="text-success-500 font-bold">{marketData.rising}</span>
        </div>
        
        <div className="h-3 bg-dark-800 rounded-full overflow-hidden flex">
          <div 
            className="bg-success-500 h-full transition-all duration-500"
            style={{ width: `${(marketData.rising / totalStocks) * 100}%` }}
          />
          <div 
            className="bg-danger-500 h-full transition-all duration-500"
            style={{ width: `${(marketData.falling / totalStocks) * 100}%` }}
          />
        </div>
        
        <div className="flex items-center justify-between text-xs text-gray-400 mt-2">
          <span>DÜŞEN</span>
          <span className="text-danger-500 font-bold">{marketData.falling}</span>
        </div>
      </div>

      {/* Hacim Dengesi */}
      <div className="bg-dark-800 rounded-lg p-3 border border-dark-700">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-gray-500">⚖️ HACİM DENGESİ</span>
          <span className="text-xs text-gray-400">{marketData.volume.percentage}%</span>
        </div>
        
        <div className="flex items-center space-x-2">
          <div className="flex-1 h-2 bg-dark-900 rounded-full overflow-hidden">
            <div 
              className="h-full bg-gradient-to-r from-success-500 to-primary-500 transition-all duration-500"
              style={{ width: `${marketData.volume.percentage}%` }}
            />
          </div>
        </div>
        
        <p className="text-[10px] text-gray-500 mt-2">{marketData.volume.total}</p>
      </div>

      {/* İstatistikler */}
      <div className="mt-4 grid grid-cols-3 gap-2">
        <StatCard icon={<TrendingUp className="w-4 h-4" />} label="Yükselen" value={marketData.rising} color="success" />
        <StatCard icon={<TrendingDown className="w-4 h-4" />} label="Düşen" value={marketData.falling} color="danger" />
        <StatCard icon={<Minus className="w-4 h-4" />} label="Değişmeyen" value={marketData.unchanged} color="gray" />
      </div>
    </div>
  )
}

function StatCard({ icon, label, value, color }) {
  const colorClasses = {
    success: 'bg-success-500/20 text-success-500',
    danger: 'bg-danger-500/20 text-danger-500',
    gray: 'bg-gray-500/20 text-gray-500'
  }

  return (
    <div className="bg-dark-800 rounded p-2 text-center">
      <div className={`inline-flex items-center justify-center w-8 h-8 rounded ${colorClasses[color]} mb-1`}>
        {icon}
      </div>
      <p className="text-[10px] text-gray-500">{label}</p>
      <p className={`text-sm font-bold ${colorClasses[color].split(' ')[1]}`}>{value}</p>
    </div>
  )
}
