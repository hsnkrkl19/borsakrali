/**
 * Decision Detail Modal — Anasayfa "Bugünün Güçlü Hissesi / Riskli Bölge / Takip Et"
 * kartlarındaki Detay butonuna açılan açıklama paneli.
 *
 * Görev: kullanıcıya "bu hisse neden bu kartta?" sorusunu net cevaplamak.
 *   • Hangi taramalar yapıldı (Trend Takip / Reversion stratejisi koşulları)
 *   • Hangi koşullar geçti / geçmedi (gruplandırılmış)
 *   • Skor + grade + geçmiş backtest güven oranı
 *   • SNR zone / Harmonik / Combo / Haber kaynak detayları
 *   • Giriş / Stop / Hedef / R/R kutusu
 *   • "Tam analiz" linki → /teknik-analiz-ai
 *
 * Sinyal yapısı backend/services/dailySignalsService.js + universalScorer.js'ten gelir.
 */

import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  X, CheckCircle2, Circle, TrendingUp, RotateCcw, ChevronRight,
  Target, AlertTriangle, Award, BarChart3, Sparkles, Newspaper,
} from 'lucide-react'

// ── Koşul grupları (universalScorer.CONDITION_GROUPS ile aynı) ────────────
const GROUP_LABELS = {
  trend: 'Trend',
  pa:    'Fiyat Hareketi',
  ind:   'İndikatörler',
  combo: 'Combo Strateji',
  harm:  'Harmonik Patern',
  sust:  'Zone Geçerliliği',
  news:  'Haber Akışı',
}

const GRADE_STYLES = {
  MUKEMMEL: { label: 'Mükemmel', rgb: '0, 201, 138' },
  GUCLU:    { label: 'Güçlü',    rgb: '56, 189, 248' },
  ORTA:     { label: 'Orta',     rgb: '212, 175, 55' },
  ZAYIF:    { label: 'Zayıf',    rgb: '148, 163, 184' },
}

const CONFIDENCE_STYLES = {
  high:    { label: 'Yüksek geçmiş başarı', icon: '✓', rgb: '0, 201, 138' },
  mid:     { label: 'Orta geçmiş başarı',   icon: '~', rgb: '212, 175, 55' },
  low:     { label: 'Düşük geçmiş başarı',  icon: '!', rgb: '255, 59, 70' },
  unknown: { label: 'Veri toplanıyor',      icon: '?', rgb: '148, 163, 184' },
}

const STRATEGY_META = {
  trend: {
    label: 'Trend Takip',
    icon: TrendingUp,
    description: 'Combo + EMA + indikatör momentumu yön veriyor. Tetik ANINDA — şu anki piyasa fiyatından.',
  },
  reversion: {
    label: 'Reversion (Pullback)',
    icon: RotateCcw,
    description: 'SNR destek/direnç bölgesine geri çekilme bekleniyor. Tetik fiyat zone\'a değdiğinde.',
  },
}

const DIRECTION_LABEL = {
  long:  { label: 'AL yönü',  rgb: '0, 201, 138' },
  short: { label: 'SAT yönü', rgb: '255, 59, 70' },
}

// ── ESC ile kapat ─────────────────────────────────────────────────────────
function useEscClose(onClose) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [onClose])
}

// ── Tek koşul satırı ──────────────────────────────────────────────────────
function ConditionRow({ cond }) {
  return (
    <div
      className="flex items-start gap-2 text-[12px] leading-snug"
      title={cond.why}
    >
      {cond.met ? (
        <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" style={{ color: 'var(--jade)' }} />
      ) : (
        <Circle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" style={{ color: 'var(--text-faint)' }} />
      )}
      <span style={{ color: cond.met ? 'var(--text-primary)' : 'var(--text-faint)' }}>
        {cond.label}
        {cond.required && (
          <span className="ml-1 text-[10px]" style={{ color: 'var(--gold-400)' }} title="Zorunlu koşul">*</span>
        )}
      </span>
    </div>
  )
}

// ── Skor halkası ──────────────────────────────────────────────────────────
function ScoreRing({ score, max, grade }) {
  const r = (score || 0) / (max || 1)
  const palette = GRADE_STYLES[grade] || GRADE_STYLES.ZAYIF
  const pct = Math.round(r * 100)
  return (
    <div className="flex items-center gap-3">
      <div
        className="relative w-16 h-16 rounded-full flex items-center justify-center flex-shrink-0"
        style={{
          background: `conic-gradient(rgba(${palette.rgb},0.9) ${pct}%, rgba(${palette.rgb},0.15) 0)`,
        }}
      >
        <div
          className="absolute inset-1.5 rounded-full flex flex-col items-center justify-center"
          style={{ background: 'var(--bg-card)' }}
        >
          <span className="text-lg font-bold leading-none" style={{ color: 'var(--text-primary)' }}>{score}</span>
          <span className="text-[9px] leading-none mt-0.5" style={{ color: 'var(--text-faint)' }}>/ {max}</span>
        </div>
      </div>
      <div className="min-w-0">
        <div
          className="inline-block text-[11px] px-2 py-0.5 rounded-full border font-bold uppercase tracking-wider"
          style={{
            background: `rgba(${palette.rgb}, 0.12)`,
            borderColor: `rgba(${palette.rgb}, 0.4)`,
            color: `rgba(${palette.rgb}, 1)`,
          }}
        >
          {palette.label}
        </div>
        <p className="text-[11px] mt-1.5" style={{ color: 'var(--text-muted)' }}>
          Taranan koşulların <strong style={{ color: 'var(--text-primary)' }}>%{pct}</strong>'i geçti
        </p>
      </div>
    </div>
  )
}

// ── Kaynak kartları (SNR / Harmonik / Combo) ──────────────────────────────
function SourceCard({ icon: Icon, title, lines }) {
  return (
    <div
      className="rounded-xl p-3 border"
      style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-main)' }}
    >
      <div className="flex items-center gap-1.5 mb-1.5">
        <Icon className="w-3.5 h-3.5" style={{ color: 'var(--gold-400)' }} />
        <span
          className="text-[10px] uppercase tracking-[0.14em] font-semibold"
          style={{ color: 'var(--text-faint)' }}
        >
          {title}
        </span>
      </div>
      <div className="space-y-0.5">
        {lines.map((ln, i) => (
          <p key={i} className="text-[12px]" style={{ color: i === 0 ? 'var(--text-primary)' : 'var(--text-muted)' }}>
            {ln}
          </p>
        ))}
      </div>
    </div>
  )
}

// ── Ana modal ─────────────────────────────────────────────────────────────
export default function DecisionDetailModal({ signal, tone = 'long', cardTitle, onClose }) {
  const navigate = useNavigate()
  useEscClose(onClose)

  if (!signal) return null

  const sig = signal
  const strategy = STRATEGY_META[sig.strategy] || STRATEGY_META.trend
  const StrategyIcon = strategy.icon
  const dir = DIRECTION_LABEL[sig.direction] || DIRECTION_LABEL.long
  const conf = CONFIDENCE_STYLES[sig.confidence] || CONFIDENCE_STYLES.unknown
  const palette = tone === 'long'
    ? { rgb: '0, 201, 138' }
    : tone === 'short'
      ? { rgb: '255, 59, 70' }
      : { rgb: '212, 175, 55' }

  // Koşulları grup grup ayır
  const conditionsByGroup = {}
  for (const c of (sig.conditions || [])) {
    if (!c.applicable) continue
    conditionsByGroup[c.group] = conditionsByGroup[c.group] || []
    conditionsByGroup[c.group].push(c)
  }

  // "Neden seçildi" — geçen ilk 4 koşulun label'ı
  const topReasons = (sig.conditions || []).filter(c => c.met && c.applicable).slice(0, 4)

  // SNR Zone kaynak satırları
  const snrLines = sig.bestZone ? [
    `${sig.bestZone.type === 'support' ? 'Destek' : 'Direnç'} bölgesi · Skor ${sig.bestZone.score ?? '–'}/100`,
    sig.bestZone.pivotDate
      ? `Pivot: ${sig.bestZone.pivotDate}${sig.bestZone.daysAgo != null ? ` (${sig.bestZone.daysAgo} gün önce)` : ''}`
      : null,
    sig.bestZone.priceDistancePct != null ? `Fiyat zone'a %${sig.bestZone.priceDistancePct} uzakta` : null,
    sig.bestZone.freshness ? `Taze: ${sig.bestZone.freshness === 'fresh' ? 'evet (hiç test edilmedi)' : 'hayır'}` : null,
  ].filter(Boolean) : null

  // Harmonik satırları
  const harmLines = sig.harmonic ? [
    `${sig.harmonic.pattern} · ${sig.harmonic.direction === 'Bullish' ? 'Boğa' : 'Ayı'}`,
    sig.harmonic.completion != null ? `Tamamlanma: %${sig.harmonic.completion}` : null,
    sig.harmonic.detectedDate ? `Tespit: ${sig.harmonic.detectedDate}` : null,
  ].filter(Boolean) : null

  // Combo satırları
  const comboLines = sig.combo ? [
    `${sig.combo.name} · Tier ${sig.combo.tier}`,
    `Yön: ${sig.combo.side === 'boga' ? 'Boğa' : sig.combo.side === 'ayi' ? 'Ayı' : 'Nötr'}`,
    sig.combo.score != null ? `Combo skor: ${sig.combo.score}` : null,
  ].filter(Boolean) : null

  // İndikatör satırları
  const indLines = sig.indicators ? [
    sig.indicators.rsi != null ? `RSI: ${sig.indicators.rsi?.toFixed(1)}` : null,
    sig.indicators.macdHist != null ? `MACD Hist: ${sig.indicators.macdHist?.toFixed(3)}` : null,
    sig.indicators.adx != null ? `ADX: ${sig.indicators.adx?.toFixed(1)}` : null,
  ].filter(Boolean) : null

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ background: 'rgba(0,0,0,0.62)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full sm:max-w-2xl max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl border"
        style={{
          background: 'var(--bg-card)',
          borderColor: `rgba(${palette.rgb}, 0.35)`,
          boxShadow: `var(--shadow-card), 0 0 0 1px rgba(${palette.rgb}, 0.18) inset`,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Gradient bar */}
        <div
          aria-hidden="true"
          className="h-[3px] w-full"
          style={{ background: `linear-gradient(90deg, transparent, rgba(${palette.rgb}, 0.85) 50%, transparent)` }}
        />

        {/* Header */}
        <div className="p-4 sm:p-5 flex items-start justify-between gap-3 border-b" style={{ borderColor: 'var(--border-main)' }}>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-xl sm:text-2xl font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>
                {sig.symbol}
              </h2>
              <span
                className="text-[11px] px-2 py-0.5 rounded-full font-bold border"
                style={{
                  background: `rgba(${dir.rgb}, 0.12)`,
                  borderColor: `rgba(${dir.rgb}, 0.4)`,
                  color: `rgba(${dir.rgb}, 1)`,
                }}
              >
                {dir.label}
              </span>
            </div>
            {sig.name && sig.name !== sig.symbol && (
              <p className="text-[12px] mt-0.5" style={{ color: 'var(--text-muted)' }}>{sig.name}</p>
            )}
            <p className="text-[11px] uppercase tracking-[0.14em] font-semibold mt-1.5" style={{ color: 'var(--text-faint)' }}>
              {cardTitle || 'Karar Detayı'}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Kapat"
            className="p-1.5 rounded-lg transition-colors flex-shrink-0"
            style={{ color: 'var(--text-muted)' }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-elevated)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 sm:p-5 space-y-5">
          {/* 1. Strateji + Skor + Güven satırı */}
          <div
            className="rounded-xl p-3.5 border flex items-center gap-4 flex-wrap"
            style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-main)' }}
          >
            <ScoreRing score={sig.totalScore} max={sig.applicableMax} grade={sig.grade} />
            <div className="flex-1 min-w-[180px]">
              <div className="flex items-center gap-1.5 mb-1">
                <StrategyIcon className="w-3.5 h-3.5" style={{ color: 'var(--gold-400)' }} />
                <span className="text-[12px] font-semibold" style={{ color: 'var(--text-primary)' }}>
                  {strategy.label}
                </span>
              </div>
              <p className="text-[11px] leading-snug" style={{ color: 'var(--text-muted)' }}>
                {strategy.description}
              </p>
            </div>
            <div
              className="text-[10px] px-2 py-1.5 rounded-lg border flex items-center gap-1.5 flex-shrink-0"
              style={{
                background: `rgba(${conf.rgb}, 0.10)`,
                borderColor: `rgba(${conf.rgb}, 0.35)`,
                color: `rgba(${conf.rgb}, 1)`,
              }}
              title={
                sig.historicalWinRate != null
                  ? `Bu strateji geçmişte ${sig.sampleSize ?? 0} örnekte %${sig.historicalWinRate} hedef tutturdu.`
                  : 'Backtest verisi henüz yetersiz.'
              }
            >
              <span>{conf.icon}</span>
              <span className="font-semibold">
                {sig.historicalWinRate != null
                  ? `Geçmiş: %${sig.historicalWinRate}`
                  : conf.label}
              </span>
            </div>
          </div>

          {/* 2. Neden seçildi — özet bullet */}
          {topReasons.length > 0 && (
            <div>
              <h3
                className="text-[11px] uppercase tracking-[0.14em] font-semibold mb-2 flex items-center gap-1.5"
                style={{ color: 'var(--gold-400)' }}
              >
                <Sparkles className="w-3.5 h-3.5" />
                Neden bu hisse seçildi?
              </h3>
              <ul className="space-y-1.5">
                {topReasons.map((c) => (
                  <li key={c.id} className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: 'var(--jade)' }} />
                    <div className="min-w-0">
                      <p className="text-[13px] font-semibold" style={{ color: 'var(--text-primary)' }}>
                        {c.label}
                      </p>
                      <p className="text-[11px] leading-snug" style={{ color: 'var(--text-muted)' }}>
                        {c.why}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* 3. Yapılan taramalar — tüm koşullar grup grup */}
          <div>
            <h3
              className="text-[11px] uppercase tracking-[0.14em] font-semibold mb-2 flex items-center gap-1.5"
              style={{ color: 'var(--text-faint)' }}
            >
              <BarChart3 className="w-3.5 h-3.5" />
              Yapılan taramalar ({sig.totalScore} / {sig.applicableMax} geçti)
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {Object.entries(conditionsByGroup).map(([group, conds]) => {
                const passed = conds.filter(c => c.met).length
                return (
                  <div
                    key={group}
                    className="rounded-xl p-2.5 border"
                    style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-main)' }}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <span
                        className="text-[10px] uppercase tracking-[0.12em] font-semibold"
                        style={{ color: 'var(--text-faint)' }}
                      >
                        {GROUP_LABELS[group] || group}
                      </span>
                      <span
                        className="text-[10px] font-mono"
                        style={{ color: passed === conds.length ? 'var(--jade)' : 'var(--text-muted)' }}
                      >
                        {passed}/{conds.length}
                      </span>
                    </div>
                    <div className="space-y-1">
                      {conds.map((c) => <ConditionRow key={c.id} cond={c} />)}
                    </div>
                  </div>
                )
              })}
            </div>
            <p className="text-[10px] mt-2" style={{ color: 'var(--text-faint)' }}>
              <span style={{ color: 'var(--gold-400)' }}>*</span> ile işaretli koşullar zorunlu — geçmezse sinyal listeye girmez.
            </p>
          </div>

          {/* 4. Kaynak kartları (SNR / Combo / Harmonik / İndikatör) */}
          {(snrLines || comboLines || harmLines || indLines) && (
            <div>
              <h3
                className="text-[11px] uppercase tracking-[0.14em] font-semibold mb-2"
                style={{ color: 'var(--text-faint)' }}
              >
                Veri kaynakları
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {snrLines && <SourceCard icon={Target} title="SNR Zone" lines={snrLines} />}
                {comboLines && <SourceCard icon={Award} title="Combo Strateji" lines={comboLines} />}
                {harmLines && <SourceCard icon={Sparkles} title="Harmonik Patern" lines={harmLines} />}
                {indLines && <SourceCard icon={BarChart3} title="İndikatörler" lines={indLines} />}
              </div>
            </div>
          )}

          {/* 5. Giriş / Stop / Hedef / R-R */}
          {(sig.entry != null || sig.stop != null || sig.target != null) && (
            <div>
              <h3
                className="text-[11px] uppercase tracking-[0.14em] font-semibold mb-2 flex items-center gap-1.5"
                style={{ color: 'var(--text-faint)' }}
              >
                <Target className="w-3.5 h-3.5" />
                Plan
                {sig.fillMode === 'market' ? (
                  <span className="text-[10px] font-semibold normal-case tracking-normal" style={{ color: 'var(--jade)' }}>
                    · Anında tetik
                  </span>
                ) : (
                  <span className="text-[10px] font-semibold normal-case tracking-normal" style={{ color: 'var(--gold-400)' }}>
                    · Zone bekleniyor
                  </span>
                )}
              </h3>
              <div className="grid grid-cols-4 gap-2">
                <div
                  className="rounded-xl p-2.5 text-center border"
                  style={{
                    background: 'rgba(56, 189, 248, 0.08)',
                    borderColor: 'rgba(56, 189, 248, 0.25)',
                  }}
                >
                  <p className="text-[9px] uppercase tracking-wider" style={{ color: 'var(--text-faint)' }}>Giriş</p>
                  <p className="text-[13px] sm:text-[15px] font-bold font-mono mt-0.5" style={{ color: '#7dd3fc' }}>
                    {sig.entry?.toFixed(2) ?? '—'}
                  </p>
                </div>
                <div
                  className="rounded-xl p-2.5 text-center border"
                  style={{
                    background: 'rgba(255, 59, 70, 0.08)',
                    borderColor: 'rgba(255, 59, 70, 0.25)',
                  }}
                >
                  <p className="text-[9px] uppercase tracking-wider" style={{ color: 'var(--text-faint)' }}>Stop</p>
                  <p className="text-[13px] sm:text-[15px] font-bold font-mono mt-0.5" style={{ color: 'var(--ember)' }}>
                    {sig.stop?.toFixed(2) ?? '—'}
                  </p>
                </div>
                <div
                  className="rounded-xl p-2.5 text-center border"
                  style={{
                    background: 'rgba(0, 201, 138, 0.08)',
                    borderColor: 'rgba(0, 201, 138, 0.25)',
                  }}
                >
                  <p className="text-[9px] uppercase tracking-wider" style={{ color: 'var(--text-faint)' }}>Hedef</p>
                  <p className="text-[13px] sm:text-[15px] font-bold font-mono mt-0.5" style={{ color: 'var(--jade)' }}>
                    {sig.target?.toFixed(2) ?? '—'}
                  </p>
                </div>
                <div
                  className="rounded-xl p-2.5 text-center border"
                  style={{
                    background: 'rgba(212, 175, 55, 0.08)',
                    borderColor: 'rgba(212, 175, 55, 0.25)',
                  }}
                  title="Reward / Risk — kazanç potansiyeli stop riskinin kaç katı"
                >
                  <p className="text-[9px] uppercase tracking-wider" style={{ color: 'var(--text-faint)' }}>R / R</p>
                  <p className="text-[13px] sm:text-[15px] font-bold font-mono mt-0.5" style={{ color: 'var(--gold-400)' }}>
                    {sig.riskReward?.toFixed(2) ?? '—'}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* 6. Haber */}
          {sig.news?.latest && (
            <div
              className="rounded-xl p-3 border"
              style={{
                background: 'rgba(212, 175, 55, 0.06)',
                borderColor: 'var(--border-gold)',
              }}
            >
              <div className="flex items-center gap-1.5 mb-1">
                <Newspaper className="w-3.5 h-3.5" style={{ color: 'var(--gold-400)' }} />
                <span
                  className="text-[10px] uppercase tracking-[0.14em] font-semibold"
                  style={{ color: 'var(--gold-400)' }}
                >
                  Son haber
                </span>
              </div>
              <p className="text-[12px] leading-snug" style={{ color: 'var(--text-primary)' }}>
                {sig.news.latest.title}
              </p>
              {sig.news.latest.publishedAt && (
                <div className="flex items-center gap-3 mt-1.5 text-[10px]" style={{ color: 'var(--text-faint)' }}>
                  <span>
                    {new Date(sig.news.latest.publishedAt).toLocaleString('tr-TR', {
                      day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
                    })}
                  </span>
                  {sig.news.positive24h > 0 && (
                    <span style={{ color: 'var(--jade)' }}>{sig.news.positive24h} pozitif (24s)</span>
                  )}
                  {sig.news.negative24h > 0 && (
                    <span style={{ color: 'var(--ember)' }}>{sig.news.negative24h} negatif (24s)</span>
                  )}
                </div>
              )}
            </div>
          )}

          {/* 7. Uyarı */}
          <div
            className="rounded-xl p-3 border flex gap-2 items-start"
            style={{
              background: 'rgba(255, 59, 70, 0.05)',
              borderColor: 'rgba(255, 59, 70, 0.18)',
            }}
          >
            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" style={{ color: 'var(--ember)' }} />
            <p className="text-[11px] leading-snug" style={{ color: 'var(--text-muted)' }}>
              Bu içerik yatırım tavsiyesi değildir. Sinyal teknik analiz sonuçlarını derler — kararı her zaman kendi araştırmanla destekle.
            </p>
          </div>

          {/* 8. CTA — tam analiz */}
          <button
            onClick={() => { onClose(); navigate(`/teknik-analiz-ai?symbol=${sig.symbol}`) }}
            className="w-full rounded-xl py-3 px-4 flex items-center justify-center gap-2 font-semibold text-[13px] transition-all"
            style={{
              background: `linear-gradient(135deg, rgba(${palette.rgb}, 0.18) 0%, rgba(${palette.rgb}, 0.10) 100%)`,
              border: `1px solid rgba(${palette.rgb}, 0.45)`,
              color: `rgba(${palette.rgb}, 1)`,
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = `linear-gradient(135deg, rgba(${palette.rgb}, 0.28) 0%, rgba(${palette.rgb}, 0.16) 100%)`)}
            onMouseLeave={(e) => (e.currentTarget.style.background = `linear-gradient(135deg, rgba(${palette.rgb}, 0.18) 0%, rgba(${palette.rgb}, 0.10) 100%)`)}
          >
            Tam teknik analiz ve grafik
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
