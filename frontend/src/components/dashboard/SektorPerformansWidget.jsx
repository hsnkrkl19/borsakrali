import { TrendingUp, TrendingDown } from 'lucide-react'

export default function SektorPerformansWidget() {
  const topSectors = [
    { name: 'Telekomünikasyon', change: 7.73, stocks: 'Türk Telekom +8.2%' },
    { name: 'Ana Metal Sanayi', change: 7.73, stocks: 'Kardemir +12.5%' },
    { name: 'İnşaat Sağlığa', change: 6.64, stocks: 'Enka İnşaat +8.1%' },
    { name: 'Telekomünikasyon', change: 6.48, stocks: 'Türkcell +6.9%' },
    { name: 'Taş ve Toprağa Dayalı', change: 6.14, stocks: 'Çimsa +10.2%' }
  ]

  const bottomSectors = [
    { name: 'Bankalar', change: -0.17, stocks: 'Akbank -2.1%' },
    { name: 'İnşaat ve Bayan', change: -0.61, stocks: 'Enka -1.8%' },
    { name: 'Gayrimenkul Yatırım', change: -1.37, stocks: 'Emlak Konut -2.5%' },
    { name: 'Toptan Ticaret', change: -1.77, stocks: 'BİM -3.2%' },
    { name: 'Ulaştırma ve Depolama', change: -2.52, stocks: 'THY -3.8%' }
  ]

  return (
    <div className="card h-full flex flex-col">
      <h3 className="text-sm font-semibold text-white mb-4">📊 SEKTÖR PERFORMANSI</h3>

      <div className="flex-1 flex flex-col space-y-4">
        {/* En Çok Yükselenler */}
        <div className="flex-1">
          <div className="flex items-center space-x-2 mb-3">
            <TrendingUp className="w-4 h-4 text-success-500" />
            <h4 className="text-xs font-semibold text-success-500">EN ÇOK YÜKSELENLER</h4>
          </div>
          
          <div className="space-y-2">
            {topSectors.map((sector, index) => (
              <SectorRow 
                key={index}
                rank={index + 1}
                name={sector.name}
                change={sector.change}
                stocks={sector.stocks}
                isPositive={true}
              />
            ))}
          </div>
        </div>

        {/* En Çok Düşenler */}
        <div className="flex-1">
          <div className="flex items-center space-x-2 mb-3">
            <TrendingDown className="w-4 h-4 text-danger-500" />
            <h4 className="text-xs font-semibold text-danger-500">EN ÇOK DÜŞENLER</h4>
          </div>
          
          <div className="space-y-2">
            {bottomSectors.map((sector, index) => (
              <SectorRow 
                key={index}
                rank={index + 1}
                name={sector.name}
                change={sector.change}
                stocks={sector.stocks}
                isPositive={false}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function SectorRow({ rank, name, change, stocks, isPositive }) {
  return (
    <div className="bg-dark-800 rounded-lg p-2 border border-dark-700 hover:border-primary-600 transition-colors cursor-pointer">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center space-x-2 flex-1 min-w-0">
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
            isPositive ? 'bg-success-500/20 text-success-500' : 'bg-danger-500/20 text-danger-500'
          }`}>
            {rank}
          </span>
          <span className="text-xs text-gray-300 truncate">{name}</span>
        </div>
        <span className={`text-sm font-bold ${isPositive ? 'text-success-500' : 'text-danger-500'}`}>
          {isPositive ? '+' : ''}{change}%
        </span>
      </div>
      <p className="text-[10px] text-gray-500 truncate">{stocks}</p>
    </div>
  )
}
