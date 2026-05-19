import { Fragment } from 'react'
import { Star, CheckCircle, RefreshCw, Zap, ChevronUp, ChevronDown } from 'lucide-react'
import { getStrategyMeta, formatRelativeTime } from '../lib/strategyMeta'
import InfoTooltip from './InfoTooltip'
import TradePlanCard from './TradePlanCard'

/**
 * GunlukTespitler "Bugünün Sinyalleri / Akıllı Süzgeç" listesi için
 * paylaşılan sinyal satır bileşeni.
 *
 * Önceki yapıda aynı veri 2 kez render ediliyordu:
 *   - md:hidden mobile card view  (filteredSignals.map → div, ~80 satır)
 *   - hidden md:block desktop tbl (filteredSignals.map → tr, ~125 satır)
 * İkisi de aynı meta+actionStyle hesabını, aynı action'ları yapıyordu.
 *
 * Şimdi: useMediaQuery → isDesktop. Bileşen tek versiyon mount eder,
 * DOM yükü yaklaşık %50 azalır, kod tekrarı ortadan kalkar.
 */
export default function DailySignalRow({
  signal,
  idx,
  isDesktop,
  isExpanded,
  onToggleExpand,
  onAddWatchlist,
  addingToWatchlist,
  isInWatchlist,
}) {
  const meta = getStrategyMeta(signal.strategy)
  const actionStyle = meta.action === 'AL'
    ? { color: 'var(--jade)',  bg: 'rgba(0, 201, 138, 0.12)', border: 'rgba(0, 201, 138, 0.30)' }
    : meta.action === 'SAT'
      ? { color: 'var(--ember)', bg: 'rgba(255, 59, 70, 0.12)', border: 'rgba(255, 59, 70, 0.30)' }
      : { color: 'var(--gold-400)', bg: 'rgba(212, 175, 55, 0.12)', border: 'rgba(212, 175, 55, 0.30)' }
  const isAdding = addingToWatchlist === signal.stockSymbol
  const ts = signal.detectionDate || signal.detectedAt || signal.timestamp
  const price = signal.currentPrice?.toFixed(2) || signal.detectionPrice?.toFixed(2)
  const change = signal.changePercent

  const WatchlistBtn = (
    <button
      type="button"
      onClick={() => onAddWatchlist(signal.stockSymbol)}
      disabled={isAdding || isInWatchlist}
      title={isInWatchlist ? 'Takip listesinde' : 'Takip listesine ekle'}
      className="transition-colors"
      style={{ color: isInWatchlist ? 'var(--gold-400)' : 'var(--text-muted)' }}
    >
      {isAdding ? (
        <RefreshCw className="w-4 h-4 animate-spin" />
      ) : isInWatchlist ? (
        <CheckCircle className="w-4 h-4" />
      ) : (
        <Star className="w-4 h-4" />
      )}
    </button>
  )

  if (isDesktop) {
    return (
      <Fragment>
        <tr
          className="transition-colors"
          style={{ borderBottom: '1px solid var(--border-main)' }}
          onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-hover)'}
          onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
        >
          <td className="py-3 px-3">{WatchlistBtn}</td>
          <td className="py-3 px-3">
            <div className="flex items-center space-x-2">
              <div
                className="w-8 h-8 rounded flex items-center justify-center text-xs font-bold"
                style={{ background: 'rgba(212, 175, 55, 0.15)', color: 'var(--gold-400)', border: '1px solid var(--border-gold)' }}
              >
                {signal.stockSymbol?.slice(0, 2)}
              </div>
              <div>
                <span className="font-mono font-semibold" style={{ color: 'var(--text-primary)' }}>{signal.stockSymbol}</span>
                <p className="text-xs" style={{ color: 'var(--text-faint)' }}>{signal.stockName || signal.sector}</p>
              </div>
            </div>
          </td>
          <td className="py-3 px-3">
            <span
              className="text-[11px] font-bold px-2 py-0.5 rounded"
              style={{ background: actionStyle.bg, color: actionStyle.color, border: `1px solid ${actionStyle.border}` }}
            >
              {meta.action}
            </span>
          </td>
          <td className="py-3 px-3">
            <div className="flex items-center gap-1.5">
              <Zap className="w-3 h-3" style={{ color: 'var(--gold-400)' }} />
              <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>{meta.label}</span>
              <InfoTooltip
                size="sm"
                title={meta.label}
                description={meta.summary + ' ' + meta.explanation}
                formula={meta.formula}
              />
            </div>
            <div className="text-[10.5px] mt-0.5" style={{ color: 'var(--text-faint)' }}>
              Vade: {meta.validity}
            </div>
          </td>
          <td className="py-3 px-3">
            <span
              className="text-[10.5px] font-mono px-1.5 py-0.5 rounded"
              style={{ background: 'var(--bg-input)', color: 'var(--text-secondary)', border: '1px solid var(--border-main)' }}
            >
              {meta.timeframe}
            </span>
          </td>
          <td className="py-3 px-3 text-right">
            <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
              {price} ₺
            </span>
          </td>
          <td className="py-3 px-3 text-right">
            <span className="text-sm font-bold" style={{ color: change >= 0 ? 'var(--jade)' : 'var(--ember)' }}>
              {change >= 0 ? '+' : ''}{change?.toFixed(2)}%
            </span>
          </td>
          <td className="py-3 px-3">
            <div className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
              {formatRelativeTime(ts)}
            </div>
            <div className="text-[10px]" style={{ color: 'var(--text-faint)' }} title={new Date(ts || Date.now()).toLocaleString('tr-TR')}>
              {new Date(ts || Date.now()).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' })}
            </div>
          </td>
          <td className="py-3 px-3">
            <span
              className="text-[10.5px] font-medium px-2 py-1 rounded"
              style={
                signal.status === 'active'
                  ? { background: 'rgba(0, 201, 138, 0.12)', color: 'var(--jade)', border: '1px solid rgba(0, 201, 138, 0.28)' }
                  : { background: 'var(--bg-input)', color: 'var(--text-faint)', border: '1px solid var(--border-main)' }
              }
            >
              {signal.status === 'active' ? 'AKTİF' : 'KAPANDI'}
            </span>
          </td>
          <td className="py-2 px-2 text-center">
            <button
              type="button"
              onClick={onToggleExpand}
              title={isExpanded ? 'Planı gizle' : 'İşlem planını göster'}
              className="inline-flex items-center justify-center w-7 h-7 rounded-lg transition-all"
              style={{
                background: isExpanded ? 'rgba(212, 175, 55, 0.18)' : 'var(--bg-input)',
                color: 'var(--gold-400)',
                border: '1px solid var(--border-gold)',
              }}
            >
              {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          </td>
        </tr>
        {isExpanded && (
          <tr>
            <td colSpan={10} className="px-3 pb-4 pt-1">
              <TradePlanCard signal={signal} />
            </td>
          </tr>
        )}
      </Fragment>
    )
  }

  // Mobil kart
  return (
    <div
      className="rounded-xl p-3"
      style={{ background: 'var(--bg-card)', border: '1px solid var(--border-main)' }}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div
            className="w-8 h-8 rounded flex items-center justify-center text-xs font-bold"
            style={{ background: 'rgba(212, 175, 55, 0.15)', color: 'var(--gold-400)', border: '1px solid var(--border-gold)' }}
          >
            {signal.stockSymbol?.slice(0, 2)}
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-mono font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>{signal.stockSymbol}</span>
              <span
                className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                style={{ background: actionStyle.bg, color: actionStyle.color, border: `1px solid ${actionStyle.border}` }}
              >
                {meta.action}
              </span>
            </div>
            <p className="text-[10px]" style={{ color: 'var(--text-faint)' }}>
              {formatRelativeTime(ts)} · {meta.timeframe}
            </p>
          </div>
        </div>
        <div className="text-right">
          <span className="text-sm font-semibold block" style={{ color: 'var(--text-primary)' }}>
            {price} ₺
          </span>
          <span className="text-xs font-bold" style={{ color: change >= 0 ? 'var(--jade)' : 'var(--ember)' }}>
            {change >= 0 ? '+' : ''}{change?.toFixed(2)}%
          </span>
        </div>
      </div>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1.5 min-w-0">
          <Zap className="w-3 h-3 flex-shrink-0" style={{ color: 'var(--gold-400)' }} />
          <span className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>{meta.label}</span>
          <InfoTooltip
            size="sm"
            title={meta.label}
            description={meta.summary + ' ' + meta.explanation}
            formula={meta.formula}
          />
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onToggleExpand}
            className="text-[10px] font-semibold px-2 py-0.5 rounded inline-flex items-center gap-1"
            style={{ background: 'rgba(212, 175, 55, 0.12)', color: 'var(--gold-400)', border: '1px solid var(--border-gold)' }}
          >
            Plan {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
          {WatchlistBtn}
        </div>
      </div>
      {isExpanded && (
        <div className="mt-3">
          <TradePlanCard signal={signal} />
        </div>
      )}
    </div>
  )
}
