import { TrendingUp, TrendingDown } from 'lucide-react'

export default function Bist100Widget({ data }) {
  if (!data) return null

  const isPositive = data.changePercent >= 0

  return (
    <div className="card h-full">
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="flex items-center space-x-2 mb-2">
            <h2 className="text-sm font-medium text-gray-400">BIST 100</h2>
            <span className={`flex items-center space-x-1 text-xs px-2 py-1 rounded ${
              isPositive ? 'bg-success-500/20 text-success-500' : 'bg-danger-500/20 text-danger-500'
            }`}>
              {isPositive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
              <span>%{Math.abs(data.changePercent)}</span>
            </span>
          </div>
          
          <div className="flex items-baseline space-x-3">
            <span className="text-5xl font-bold text-white">{data.value.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</span>
            <span className={`text-2xl font-semibold ${isPositive ? 'text-success-500' : 'text-danger-500'}`}>
              {isPositive ? '+' : ''}{data.change.toFixed(2)}
            </span>
          </div>
        </div>

        {/* Trend Göstergeleri */}
        <div className="flex items-center space-x-2">
          <TrendBadge period="1S" status="up" label="YÜKSELİŞ" />
          <TrendBadge period="GÜN" status="up" label="YÜKSELİŞ" />
          <TrendBadge period="HFT" status="up" label="YÜKSELİŞ" />
          <TrendBadge period="AY" status="up" label="YÜKSELİŞ" />
        </div>
      </div>

      {/* Trend: Boğa Yelpazesi */}
      <div className="bg-dark-800 rounded-lg p-4 border border-dark-700">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-gray-500 mb-1">TREND: BOĞA YELPAZESİ</p>
            <p className="text-sm text-gray-300">Yükselen trendde güçlü hareket</p>
          </div>
          <div className="flex space-x-2">
            <div className="w-3 h-8 bg-success-500 rounded"></div>
            <div className="w-3 h-10 bg-success-500 rounded"></div>
            <div className="w-3 h-12 bg-success-500 rounded"></div>
            <div className="w-3 h-14 bg-success-500 rounded"></div>
          </div>
        </div>
      </div>

      {/* Alt Metrikler */}
      <div className="grid grid-cols-3 gap-4 mt-4">
        <MetricBox label="ADX" value="0.0" />
        <MetricBox label="ADX" value="0.0" />
        <MetricBox label="MACD" value="500.06" badge="POZİTİF AZALAN" badgeColor="warning" />
      </div>
    </div>
  )
}

function TrendBadge({ period, status, label }) {
  const isUp = status === 'up'
  
  return (
    <div className="text-center">
      <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${
        isUp ? 'bg-success-500/20' : 'bg-danger-500/20'
      }`}>
        <span className={`text-xs font-bold ${isUp ? 'text-success-500' : 'text-danger-500'}`}>
          {period}
        </span>
      </div>
      <p className={`text-[10px] font-medium mt-1 ${isUp ? 'text-success-500' : 'text-danger-500'}`}>
        {label}
      </p>
    </div>
  )
}

function MetricBox({ label, value, badge, badgeColor = 'primary' }) {
  const colorClass = {
    primary: 'bg-primary-500/20 text-primary-500',
    warning: 'bg-warning-500/20 text-warning-500',
    success: 'bg-success-500/20 text-success-500',
    danger: 'bg-danger-500/20 text-danger-500'
  }[badgeColor]

  return (
    <div className="bg-dark-800 rounded-lg p-3 border border-dark-700">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className="text-lg font-bold text-white">{value}</p>
      {badge && (
        <span className={`text-[10px] px-2 py-0.5 rounded mt-1 inline-block ${colorClass}`}>
          {badge}
        </span>
      )}
    </div>
  )
}
