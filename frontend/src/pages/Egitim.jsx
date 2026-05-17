/**
 * Parça 4 — Öğren sayfası (eski Eğitim).
 *
 * Yeni yapı: kısa kartlar + tıklayınca açılan modal. Eski uzun makaleler
 * (egitim/*.jsx) "Detaylı oku" linki olarak kalır.
 */

import { useState, useMemo, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Search, X, ArrowRight, BookOpen } from 'lucide-react'
import BrandMark from '../components/BrandMark'
import HelpBubble from '../components/HelpBubble'
import { LEARN_CATEGORIES, LEARN_CARDS } from '../data/learnCards'

// Eski uzun makaleler — "Detaylı oku" hedefi olarak kalır.
const DETAILED_ARTICLES = [
  { slug: 'teknik-analiz-giris', title: 'Teknik Analize Giriş', readingTime: '8 dk' },
  { slug: 'bist100-rehberi',     title: 'BIST 100 Rehberi',      readingTime: '9 dk' },
  { slug: 'temel-gostergeler',   title: 'Temel Göstergeler',     readingTime: '10 dk' },
  { slug: 'bilanco-okuma',       title: 'Bilanço Okuma',         readingTime: '11 dk' },
  { slug: 'destek-direnc',       title: 'Destek/Direnç',         readingTime: '9 dk' },
  { slug: 'yatirim-stratejisi',  title: 'Yatırım Stratejisi',    readingTime: '10 dk' },
]

function CardModal({ card, onClose }) {
  useEffect(() => {
    if (!card) return
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [card, onClose])

  if (!card) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl border p-5 sm:p-6 space-y-4"
        style={{ background: 'var(--bg-card)', borderColor: 'var(--border-gold)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-lg sm:text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
            {card.title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Kapat"
            className="p-1.5 rounded-lg"
            style={{ color: 'var(--text-faint)' }}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
          {card.body}
        </p>

        {card.example && (
          <p className="text-[13px] leading-relaxed rounded-lg p-3"
            style={{ background: 'rgba(0, 201, 138, 0.07)', color: 'var(--text-secondary)' }}>
            <span className="font-semibold" style={{ color: 'var(--jade)' }}>Örnek: </span>
            {card.example.replace(/^Örnek:\s*/, '')}
          </p>
        )}

        {card.warning && (
          <p className="text-[13px] leading-relaxed rounded-lg p-3"
            style={{ background: 'rgba(212, 175, 55, 0.07)', color: 'var(--text-secondary)' }}>
            <span className="font-semibold" style={{ color: 'var(--gold-400)' }}>Dikkat: </span>
            {card.warning.replace(/^Dikkat:\s*/, '')}
          </p>
        )}

        {card.detailHref && (
          <Link
            to={card.detailHref}
            onClick={onClose}
            className="inline-flex items-center gap-1.5 text-[13px] font-semibold"
            style={{ color: 'var(--gold-400)' }}
          >
            Detaylı oku <ArrowRight className="w-4 h-4" />
          </Link>
        )}
      </div>
    </div>
  )
}

export default function Egitim() {
  const [query, setQuery] = useState('')
  const [activeCard, setActiveCard] = useState(null)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return LEARN_CARDS
    return LEARN_CARDS.filter((c) =>
      c.title.toLowerCase().includes(q) ||
      c.body.toLowerCase().includes(q) ||
      c.example?.toLowerCase().includes(q)
    )
  }, [query])

  return (
    <div className="min-h-screen px-4 py-8" style={{ background: 'var(--bg-canvas)' }}>
      <div className="mx-auto max-w-5xl space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <Link to="/" className="inline-flex items-center gap-3 text-sm" style={{ color: 'var(--gold-400)' }}>
            <BrandMark size="sm" />
            Borsa Krali
          </Link>
          <div className="flex flex-wrap gap-4 text-sm">
            <Link to="/hakkimizda" style={{ color: 'var(--text-faint)' }}>Hakkımızda</Link>
            <Link to="/iletisim" style={{ color: 'var(--text-faint)' }}>İletişim</Link>
            <Link to="/privacy-policy" style={{ color: 'var(--text-faint)' }}>Gizlilik</Link>
          </div>
        </div>

        {/* Başlık + yardım */}
        <header className="space-y-2">
          <h1
            className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center"
            style={{ color: 'var(--text-primary)' }}
          >
            Öğren
            <HelpBubble text="Anlamadığın bir şey varsa burada açıklama bulursun." />
          </h1>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            Her kart 30 saniyede okunur. Bir konuyu derinlemesine öğrenmek istersen "Detaylı oku" linkini kullan.
          </p>
        </header>

        {/* Arama */}
        <div className="relative">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4"
            style={{ color: 'var(--text-faint)' }}
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Ne öğrenmek istiyorsun? (örn. AL, risk, bot)"
            className="w-full rounded-xl pl-10 pr-3 py-2.5 text-sm"
            style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border-main)',
              color: 'var(--text-primary)',
            }}
          />
        </div>

        {/* Kategori grupları */}
        {LEARN_CATEGORIES.map((cat) => {
          const list = filtered.filter((c) => c.category === cat.id)
          if (list.length === 0) return null
          return (
            <section key={cat.id} className="space-y-3">
              <h2
                className="text-[11px] uppercase tracking-[0.18em] font-bold"
                style={{ color: 'var(--gold-400)' }}
              >
                {cat.label}
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
                {list.map((card) => (
                  <button
                    key={card.id}
                    type="button"
                    onClick={() => setActiveCard(card)}
                    className="text-left rounded-xl p-3 transition-colors hover:scale-[1.02]"
                    style={{
                      background: 'var(--bg-card)',
                      border: '1px solid var(--border-main)',
                      minHeight: 88,
                    }}
                  >
                    <p
                      className="text-[13.5px] font-semibold leading-snug"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      {card.title}
                    </p>
                  </button>
                ))}
              </div>
            </section>
          )
        })}

        {filtered.length === 0 && (
          <div
            className="rounded-xl border p-6 text-center text-sm"
            style={{
              background: 'var(--bg-card)',
              borderColor: 'var(--border-main)',
              color: 'var(--text-secondary)',
            }}
          >
            "{query}" için kart bulunamadı. Aşağıdaki detaylı makalelerde olabilir.
          </div>
        )}

        {/* Detaylı makaleler */}
        <section className="space-y-3 pt-6">
          <h2
            className="text-[11px] uppercase tracking-[0.18em] font-bold flex items-center gap-2"
            style={{ color: 'var(--text-faint)' }}
          >
            <BookOpen className="w-3.5 h-3.5" />
            Detaylı Rehberler
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {DETAILED_ARTICLES.map((a) => (
              <Link
                key={a.slug}
                to={`/egitim/${a.slug}`}
                className="flex items-center justify-between rounded-xl px-3 py-2.5 text-sm"
                style={{
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border-main)',
                  color: 'var(--text-primary)',
                }}
              >
                <span>{a.title}</span>
                <span className="flex items-center gap-1.5 text-[11px]" style={{ color: 'var(--text-faint)' }}>
                  {a.readingTime} <ArrowRight className="w-3.5 h-3.5" />
                </span>
              </Link>
            ))}
          </div>
        </section>

        <p className="text-[11px] text-center pt-4" style={{ color: 'var(--text-faint)' }}>
          Bu sayfa yatırım tavsiyesi değildir; tamamen bilgilendirme amaçlıdır.
        </p>
      </div>

      <CardModal card={activeCard} onClose={() => setActiveCard(null)} />
    </div>
  )
}
