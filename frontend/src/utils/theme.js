export function getStoredTheme() {
  try {
    const explicitTheme =
      document.documentElement.getAttribute('data-theme') ||
      localStorage.getItem('bk-theme') ||
      'light'

    return explicitTheme === 'dark' ? 'dark' : 'light'
  } catch {
    return 'light'
  }
}

export function applyTheme(theme) {
  const resolvedTheme = theme === 'dark' ? 'dark' : 'light'

  try {
    localStorage.setItem('bk-theme', resolvedTheme)
  } catch {
    // noop
  }

  document.documentElement.setAttribute('data-theme', resolvedTheme)
  window.dispatchEvent(new CustomEvent('bk-theme-change', { detail: { theme: resolvedTheme } }))

  return resolvedTheme
}

export function getChartTheme(theme = getStoredTheme()) {
  if (theme === 'dark') {
    return {
      background: '#0f172a',
      textColor: '#94a3b8',
      gridColor: 'rgba(255,255,255,0.06)',
      borderColor: 'rgba(255,255,255,0.10)',
      volumeUp: '#22c55e40',
      volumeDown: '#ef444440',
      headerClass: 'bg-dark-800/80 border-dark-700',
      subHeaderClass: 'bg-dark-900/50 border-dark-700',
      footerClass: 'bg-dark-800/50 border-dark-700',
      buttonClass: 'bg-dark-700 text-gray-400 hover:text-white',
      refreshButtonClass: 'bg-dark-700 hover:bg-dark-600',
      errorClass: 'bg-red-900/80 text-red-300 border-red-500/30',
      panelClass: 'bg-surface-100',
      emptyTextClass: 'text-gray-500',
    }
  }

  return {
    background: '#ffffff',
    textColor: '#475569',
    gridColor: 'rgba(148,163,184,0.20)',
    borderColor: 'rgba(148,163,184,0.28)',
    volumeUp: '#22c55e26',
    volumeDown: '#ef444426',
    headerClass: 'bg-white/95 border-surface-300',
    subHeaderClass: 'bg-slate-50/95 border-surface-300',
    footerClass: 'bg-slate-50/90 border-surface-300',
    buttonClass: 'bg-slate-100 text-slate-600 hover:text-slate-900',
    refreshButtonClass: 'bg-slate-100 hover:bg-slate-200',
    errorClass: 'bg-red-50 text-red-600 border-red-200',
    panelClass: 'bg-surface-100',
    emptyTextClass: 'text-gray-500',
  }
}

export function getTradingViewTheme(theme = getStoredTheme()) {
  return theme === 'dark' ? 'dark' : 'light'
}
