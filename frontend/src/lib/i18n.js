/**
 * i18n (Faz 19) — Minimal string registry + TR/EN switch
 *
 * Tüm component'lerde hardcoded Türkçe string'leri silmek yerine küçük bir
 * hook + provider sağlar. Kullanım:
 *
 *   import { useI18n } from '../lib/i18n'
 *   const { t, lang, setLang } = useI18n()
 *   <span>{t('mtf.title')}</span>
 *
 * String'ler `dictionaries` içinde tutulur. Eksik anahtar TR fallback.
 * Lang preference: localStorage('bk-lang') → 'tr' | 'en'.
 */

import { createContext, useContext, useEffect, useMemo, useState } from 'react'

const LANG_KEY = 'bk-lang'
const DEFAULT_LANG = 'tr'

// Dictionary'ler — Borsa Krali için en sık kullanılan UI string'leri.
// Genişletmek için anahtar ekle; eksik anahtar TR fallback olarak gelir.
const dictionaries = {
  tr: {
    'common.refresh': 'Yenile',
    'common.loading': 'Yükleniyor…',
    'common.error': 'Bir şeyler ters gitti.',
    'common.close': 'Kapat',
    'common.detail': 'Detay',
    'common.all': 'Tümü',
    'common.long': 'Yükseliş',
    'common.short': 'Düşüş',

    'mtf.title': 'Kısa + Uzun Vade Sinyaller',
    'mtf.subtitle': 'Kısa, orta ve uzun vadeyi birleştirir. Tek bakışta yön ve güç görünür.',
    'mtf.tab.scanner': 'Tarayıcı',
    'mtf.tab.confluence': 'Birleşik Görüntü',
    'mtf.tab.calibration': 'Kalibrasyon',
    'mtf.tab.backtest': 'Geçmiş Test',
    'mtf.group.scalping': 'Kısa Vade (İlk 10)',
    'mtf.group.swing': 'Orta Vade (İlk 20)',
    'mtf.group.position': 'Uzun Vade (İlk 30)',

    'paper.title': 'Kağıt Üzerinde Dene',
    'paper.balance': 'Bakiye',
    'paper.equity': 'Toplam Değer',
    'paper.openPositions': 'Açık Pozisyonlar',
    'paper.history': 'Geçmiş',
    'paper.unrealizedPnl': 'Açık Kâr / Zarar',
    'paper.totalPnl': 'Toplam Kâr / Zarar',
    'paper.winRate': 'Kârlı işlem oranı',
    'paper.totalTrades': 'Toplam İşlem',
    'paper.openPosition': 'Pozisyon Aç',
    'paper.closePosition': 'Pozisyonu Kapat',
    'paper.reset': 'Sıfırla',
  },
  en: {
    'common.refresh': 'Refresh',
    'common.loading': 'Loading...',
    'common.error': 'Error',
    'common.close': 'Close',
    'common.detail': 'Detail',
    'common.all': 'All',
    'common.long': 'Long',
    'common.short': 'Short',

    'mtf.title': 'Multi-Timeframe Signals',
    'mtf.subtitle': '7 timeframes · Confluence engine · Pattern detection · RSI divergence · Volatility regime',
    'mtf.tab.scanner': 'Scanner',
    'mtf.tab.confluence': 'Confluence',
    'mtf.tab.calibration': 'Calibration',
    'mtf.tab.backtest': 'Backtest',
    'mtf.group.scalping': 'Scalping (Top 10)',
    'mtf.group.swing': 'Swing (Top 20)',
    'mtf.group.position': 'Position (Top 30)',

    'paper.title': 'Paper Trading',
    'paper.balance': 'Balance',
    'paper.equity': 'Total Equity',
    'paper.openPositions': 'Open Positions',
    'paper.history': 'History',
    'paper.unrealizedPnl': 'Unrealized PnL',
    'paper.totalPnl': 'Total PnL',
    'paper.winRate': 'Win Rate',
    'paper.totalTrades': 'Total Trades',
    'paper.openPosition': 'Open Position',
    'paper.closePosition': 'Close Position',
    'paper.reset': 'Reset',
  },
}

const I18nContext = createContext({
  lang: DEFAULT_LANG,
  setLang: () => {},
  t: (key) => key,
})

export function I18nProvider({ children }) {
  const [lang, setLangState] = useState(() => {
    try { return localStorage.getItem(LANG_KEY) || DEFAULT_LANG } catch { return DEFAULT_LANG }
  })

  useEffect(() => {
    try { localStorage.setItem(LANG_KEY, lang) } catch (_) {}
    if (typeof document !== 'undefined') {
      document.documentElement.lang = lang
    }
  }, [lang])

  const value = useMemo(() => {
    const dict = dictionaries[lang] || dictionaries[DEFAULT_LANG]
    const fallback = dictionaries[DEFAULT_LANG]
    const t = (key, vars) => {
      let str = dict[key] ?? fallback[key] ?? key
      if (vars) {
        for (const [k, v] of Object.entries(vars)) {
          str = str.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v))
        }
      }
      return str
    }
    return { lang, setLang: setLangState, t }
  }, [lang])

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n() {
  return useContext(I18nContext)
}

// Standalone t() — provider yoksa da çalışır (default lang)
export function t(key, langOverride) {
  let lang = langOverride
  if (!lang) {
    try { lang = localStorage.getItem(LANG_KEY) || DEFAULT_LANG } catch { lang = DEFAULT_LANG }
  }
  const dict = dictionaries[lang] || dictionaries[DEFAULT_LANG]
  return dict[key] ?? dictionaries[DEFAULT_LANG][key] ?? key
}

export { dictionaries, DEFAULT_LANG, LANG_KEY }
