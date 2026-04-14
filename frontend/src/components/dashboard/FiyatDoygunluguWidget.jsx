export default function FiyatDoygunluguWidget() {
  const doygunluk = 87 // 0-100 arası
  const rotation = (doygunluk / 100) * 180 - 90

  return (
    <div className="card">
      <h3 className="text-sm font-semibold text-white mb-4">⚡ FİYAT DOYGUNLUĞU</h3>
      
      {/* Gauge Chart */}
      <div className="relative w-full aspect-square max-w-[200px] mx-auto">
        <svg viewBox="0 0 200 120" className="w-full">
          {/* Background Arc */}
          <path
            d="M 20 100 A 80 80 0 0 1 180 100"
            fill="none"
            stroke="#1e293b"
            strokeWidth="20"
            strokeLinecap="round"
          />
          
          {/* Colored Arc (based on value) */}
          <path
            d="M 20 100 A 80 80 0 0 1 180 100"
            fill="none"
            stroke="url(#gradient)"
            strokeWidth="20"
            strokeLinecap="round"
            strokeDasharray={`${(doygunluk / 100) * 251} 251`}
          />
          
          {/* Gradient Definition */}
          <defs>
            <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#ef4444" />
              <stop offset="50%" stopColor="#f59e0b" />
              <stop offset="100%" stopColor="#22c55e" />
            </linearGradient>
          </defs>
          
          {/* Needle */}
          <line
            x1="100"
            y1="100"
            x2="100"
            y2="30"
            stroke="white"
            strokeWidth="3"
            strokeLinecap="round"
            transform={`rotate(${rotation} 100 100)`}
          />
          <circle cx="100" cy="100" r="6" fill="white" />
        </svg>
        
        {/* Value Display */}
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 text-center">
          <div className="text-4xl font-bold text-white">{doygunluk}</div>
          <div className="text-xs text-success-500 font-semibold mt-1">ÜST BÖLGE (80+)</div>
        </div>
      </div>

      {/* Legend */}
      <div className="mt-4 space-y-2 text-xs">
        <div className="flex items-center justify-between">
          <span className="text-gray-500">ALT BÖLGE</span>
          <span className="text-gray-400">0-1 BÖLGE</span>
        </div>
      </div>
    </div>
  )
}
