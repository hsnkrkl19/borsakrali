export default function EMAMerdivenWidget() {
  const emaData = [
    { period: 'EMA 5', value: 13904.35, color: 'text-success-500', bgColor: 'bg-success-500/20' },
    { period: 'EMA 9', value: 13804.56, color: 'text-success-500', bgColor: 'bg-success-500/20' },
    { period: 'EMA 21', value: 12595.89, color: 'text-warning-500', bgColor: 'bg-warning-500/20' },
    { period: 'EMA 50', value: 11957.33, color: 'text-primary-500', bgColor: 'bg-primary-500/20' },
    { period: 'EMA 200', value: 10858.05, color: 'text-purple-500', bgColor: 'bg-purple-500/20' },
  ]

  return (
    <div className="card h-full">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-white">📊 FİYAT & ORTALAMALAR</h3>
      </div>

      <div className="space-y-3">
        {/* Güncel Fiyat */}
        <div className="bg-primary-600 rounded-lg p-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-white">FİYAT</span>
            <span className="text-lg font-bold text-white">13637.76</span>
          </div>
        </div>

        {/* EMA Values */}
        {emaData.map((ema, index) => (
          <div key={index} className={`${ema.bgColor} rounded-lg p-3 border border-transparent hover:border-current transition-colors`}>
            <div className="flex items-center justify-between">
              <span className={`text-xs font-medium ${ema.color}`}>{ema.period}</span>
              <span className={`text-base font-bold ${ema.color}`}>{ema.value.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
