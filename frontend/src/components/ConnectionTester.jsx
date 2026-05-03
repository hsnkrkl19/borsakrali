import { useState, useEffect } from 'react'
import { CheckCircle2, XCircle, Loader, Wifi, AlertTriangle, Copy } from 'lucide-react'
import { getApiBase } from '../config'

export default function ConnectionTester() {
  const [tests, setTests] = useState([])
  const [running, setRunning] = useState(false)
  const [info, setInfo] = useState({})

  useEffect(() => {
    setInfo({
      apiBase: getApiBase(),
      origin: typeof window !== 'undefined' ? window.location.origin : '?',
      hostname: typeof window !== 'undefined' ? window.location.hostname : '?',
      isNative: typeof window?.Capacitor?.isNativePlatform === 'function' && window.Capacitor.isNativePlatform(),
      platform: window?.Capacitor?.getPlatform?.() || 'web',
      online: typeof navigator !== 'undefined' ? navigator.onLine : 'bilinmiyor',
      userAgent: (navigator?.userAgent || '').slice(0, 100),
    })
  }, [])

  const runTests = async () => {
    setRunning(true)
    setTests([])
    const results = []
    const apiBase = getApiBase()
    const fullBase = apiBase || (typeof window !== 'undefined' ? window.location.origin : '')

    const endpoints = [
      { name: 'Sunucu Sağlığı (/health)',  url: `${fullBase}/health` },
      { name: 'BIST 30 (/api/market/bist30)', url: `${fullBase}/api/market/bist30` },
      { name: 'BIST 100 (/api/market/bist100)', url: `${fullBase}/api/market/bist100` },
    ]

    for (const ep of endpoints) {
      const start = Date.now()
      try {
        const r = await fetch(ep.url, {
          method: 'GET',
          headers: { 'Accept': 'application/json' },
          signal: AbortSignal.timeout(60000),
        })
        const ms = Date.now() - start
        const text = await r.text()
        let preview = text.slice(0, 80)
        try { preview = JSON.stringify(JSON.parse(text)).slice(0, 100) } catch (_) {}
        results.push({
          ok: r.ok,
          name: ep.name,
          url: ep.url,
          status: r.status,
          ms,
          preview,
        })
      } catch (e) {
        results.push({
          ok: false,
          name: ep.name,
          url: ep.url,
          status: 0,
          ms: Date.now() - start,
          preview: e?.message || String(e),
        })
      }
      setTests([...results])
    }
    setRunning(false)
  }

  const copyDiag = () => {
    const lines = [
      `=== Borsa Krali Tanı Bilgisi ===`,
      `Time: ${new Date().toISOString()}`,
      `API Base: ${info.apiBase}`,
      `Origin: ${info.origin}`,
      `Hostname: ${info.hostname}`,
      `Native: ${info.isNative}`,
      `Platform: ${info.platform}`,
      `Online: ${info.online}`,
      `UserAgent: ${info.userAgent}`,
      ``,
      `=== Test Sonuçları ===`,
      ...tests.map(t => `${t.ok ? '✓' : '✗'} ${t.name} → ${t.status} (${t.ms}ms) ${t.preview?.slice(0, 60)}`),
    ].join('\n')
    try {
      navigator.clipboard.writeText(lines)
      alert('Tanı bilgisi panoya kopyalandı')
    } catch (_) {
      alert(lines)
    }
  }

  return (
    <div className="rounded-2xl border border-amber-500/30 bg-dark-900 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Wifi className="w-5 h-5 text-amber-400" />
        <div className="font-semibold text-white">Bağlantı Tanılama</div>
      </div>

      {/* Info */}
      <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
        <Row k="API Base"  v={info.apiBase || '(boş)'} />
        <Row k="Origin"    v={info.origin} />
        <Row k="Hostname"  v={info.hostname} />
        <Row k="Platform"  v={info.platform} />
        <Row k="Native"    v={String(info.isNative)} />
        <Row k="Online"    v={String(info.online)} />
      </div>

      <div className="flex gap-2">
        <button
          onClick={runTests}
          disabled={running}
          className="flex items-center gap-2 px-3 py-2 bg-amber-500 hover:bg-amber-600 text-dark-950 font-semibold rounded-xl text-sm disabled:opacity-50"
        >
          {running ? <Loader className="w-4 h-4 animate-spin" /> : <Wifi className="w-4 h-4" />}
          {running ? 'Test ediliyor...' : 'Sunucu Bağlantısını Test Et'}
        </button>
        {tests.length > 0 && (
          <button
            onClick={copyDiag}
            className="flex items-center gap-2 px-3 py-2 bg-dark-800 hover:bg-dark-700 border border-dark-700 text-gray-300 rounded-xl text-sm"
          >
            <Copy className="w-4 h-4" />
            Kopyala
          </button>
        )}
      </div>

      {/* Test results */}
      {tests.length > 0 && (
        <div className="space-y-2">
          {tests.map((t, i) => (
            <div
              key={i}
              className={`rounded-xl p-2.5 text-xs border ${
                t.ok ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-red-500/10 border-red-500/30'
              }`}
            >
              <div className="flex items-center gap-2">
                {t.ok ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                ) : (
                  <XCircle className="w-4 h-4 text-red-400" />
                )}
                <span className="font-semibold text-white">{t.name}</span>
                <span className="text-gray-500 ml-auto">{t.ms}ms · {t.status || 'NET'}</span>
              </div>
              <div className="mt-1 text-[10px] text-gray-500 break-all font-mono">{t.url}</div>
              <div className="mt-1 text-[10px] text-gray-400 break-all font-mono">→ {t.preview}</div>
            </div>
          ))}
        </div>
      )}

      {!info.isNative && info.hostname !== 'borsakrali.com' && (
        <div className="flex items-start gap-2 rounded-xl bg-amber-500/10 border border-amber-500/30 p-2.5 text-[11px] text-amber-300">
          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>Web tarayıcıdasınız. APK'da test ederken çıkacak farklı sonuçlar normaldir.</span>
        </div>
      )}
    </div>
  )
}

function Row({ k, v }) {
  return (
    <div className="bg-dark-800 px-2 py-1.5 rounded-lg">
      <div className="text-[9px] uppercase text-gray-500 tracking-wider">{k}</div>
      <div className="text-[11px] text-white truncate">{v}</div>
    </div>
  )
}
