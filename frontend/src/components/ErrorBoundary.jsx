import { Component } from 'react'

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null, errorInfo: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    console.error('[ErrorBoundary]', error, errorInfo)
    this.setState({ errorInfo })
    // Mobile için de loglayalım
    try {
      if (window.localStorage) {
        const errorLog = JSON.parse(localStorage.getItem('bk-error-log') || '[]')
        errorLog.unshift({
          time: new Date().toISOString(),
          message: error?.message || String(error),
          stack: error?.stack?.slice(0, 1000),
        })
        localStorage.setItem('bk-error-log', JSON.stringify(errorLog.slice(0, 10)))
      }
    } catch (_) { /* noop */ }
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null })
  }

  handleReload = () => {
    window.location.href = '/'
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center p-6 bg-dark-950">
          <div className="max-w-md w-full bg-dark-900 border border-amber-500/30 rounded-2xl p-6 sm:p-8 text-center">
            <div className="text-5xl mb-4">⚠️</div>
            <h1 className="text-xl font-bold text-amber-400 mb-2">Beklenmeyen bir hata oluştu</h1>
            <p className="text-sm text-gray-400 mb-4">
              {this.state.error?.message || 'Bir şeyler yanlış gitti. Sayfayı yenilemeyi deneyin.'}
            </p>
            <p className="text-xs text-gray-600 mb-6">
              Sunucu yeni uyandıysa biraz beklemeniz gerekebilir.
            </p>
            <div className="flex flex-col sm:flex-row gap-2">
              <button
                onClick={this.handleReset}
                className="flex-1 bg-amber-500 hover:bg-amber-600 text-dark-950 font-semibold py-2.5 rounded-xl transition-colors"
              >
                Tekrar Dene
              </button>
              <button
                onClick={this.handleReload}
                className="flex-1 bg-dark-800 hover:bg-dark-700 text-white font-semibold py-2.5 rounded-xl border border-dark-700 transition-colors"
              >
                Ana Sayfa
              </button>
            </div>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
