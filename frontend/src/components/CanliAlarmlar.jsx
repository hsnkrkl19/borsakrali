import { Bell, BellRing, Clock, TrendingUp, TrendingDown } from 'lucide-react'

/**
 * Canlı Alarmlar — GunlukTespitler "araclar/alarmlar" sub-tab içeriği.
 * Önceden 70+ satır inline JSX'di; bilgi şeridi + alarm listesi.
 *
 * Props:
 *   - liveAlerts: Socket.IO ile gelen alarm objesi listesi
 *   - onMarkAsRead(alertId): okunmamış alarm'a tıklanınca tetiklenir
 */
export default function CanliAlarmlar({ liveAlerts = [], onMarkAsRead }) {
  return (
    <div className="space-y-4">
      {/* Alarm Bilgisi */}
      <div className="bg-primary-500/10 border border-primary-500/30 rounded-xl p-4">
        <div className="flex items-center gap-3">
          <BellRing className="w-5 h-5 text-primary-500" />
          <div>
            <h3 className="text-white font-semibold">Canlı Alarm Sistemi</h3>
            <p className="text-sm text-gray-400">
              Yeni sinyaller tespit edildiğinde burada anlık bildirim alırsınız.
            </p>
          </div>
        </div>
      </div>

      {/* Alarm Listesi */}
      {liveAlerts.length === 0 ? (
        <div className="card text-center py-12">
          <Bell className="w-12 h-12 text-gray-600 mx-auto mb-4" />
          <h3 className="text-white font-semibold mb-2">Henüz Alarm Yok</h3>
          <p className="text-gray-400 text-sm">Yeni sinyaller tespit edildiğinde burada görünecek</p>
        </div>
      ) : (
        <div className="space-y-3">
          {liveAlerts.map((alert) => (
            <div
              key={alert.id}
              className={`card transition-all cursor-pointer hover:border-primary-500 ${
                alert.read ? 'border-dark-700' : 'border-green-500 bg-green-500/5'
              }`}
              onClick={() => !alert.read && onMarkAsRead?.(alert.id)}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3">
                  <div
                    className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                      alert.type === 'BUY'
                        ? 'bg-green-500/20 text-green-500'
                        : alert.type === 'SELL'
                          ? 'bg-red-500/20 text-red-500'
                          : 'bg-yellow-500/20 text-yellow-500'
                    }`}
                  >
                    {alert.type === 'BUY' ? <TrendingUp className="w-5 h-5" /> : <TrendingDown className="w-5 h-5" />}
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-bold text-white text-lg">{alert.symbol}</span>
                      <span className="text-xs bg-primary-500/20 text-primary-400 px-2 py-0.5 rounded">
                        {alert.strategy}
                      </span>
                      {!alert.read && (
                        <span className="text-xs bg-green-500 text-white px-2 py-0.5 rounded animate-pulse">
                          YENİ
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-400">{alert.description}</p>
                    <p className="text-xs text-gray-500 mt-1">{alert.name} - {alert.sector}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold text-white">{alert.price?.toFixed(2)} TL</p>
                  <p
                    className={`text-sm font-semibold ${
                      alert.changePercent >= 0 ? 'text-green-500' : 'text-red-500'
                    }`}
                  >
                    {alert.changePercent >= 0 ? '+' : ''}{alert.changePercent?.toFixed(2)}%
                  </p>
                  <p className="text-xs text-gray-500 flex items-center justify-end gap-1 mt-1">
                    <Clock className="w-3 h-3" />
                    {new Date(alert.timestamp).toLocaleString('tr-TR')}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
