/**
 * Parça 4 — Öğren sayfası (eski Eğitim).
 *
 * Yeni yapı: kısa kartlar + tıklayınca açılan modal. Eski uzun makaleler
 * (egitim/*.jsx) "Detaylı oku" linki olarak kalır.
 */

import { useState, useMemo, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Search, X, ArrowRight, BookOpen } from 'lucide-react'
import { LEARN_CATEGORIES, LEARN_CARDS } from '../data/learnCards'
import { Button, Card, PageHeader, EmptyState } from '../components/ui'

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
      <Card
        tone="gold"
        padding="lg"
        className="w-full max-w-md space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-lg font-bold sm:text-xl" style={{ color: 'var(--text-primary)' }}>
            {card.title}
          </h2>
          <Button variant="subtle" size="sm" icon={X} aria-label="Kapat" onClick={onClose} />
        </div>

        <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
          {card.body}
        </p>

        {card.example && (
          <p className="rounded-lg p-3 text-[13px] leading-relaxed"
            style={{ background: 'rgba(0, 201, 138, 0.07)', color: 'var(--text-secondary)' }}>
            <span className="font-semibold" style={{ color: 'var(--jade)' }}>Örnek: </span>
            {card.example.replace(/^Örnek:\s*/, '')}
          </p>
        )}

        {card.warning && (
          <p className="rounded-lg p-3 text-[13px] leading-relaxed"
            style={{ background: 'rgba(212, 175, 55, 0.07)', color: 'var(--text-secondary)' }}>
            <span className="font-semibold" style={{ color: 'var(--gold-400)' }}>Dikkat: </span>
            {card.warning.replace(/^Dikkat:\s*/, '')}
          </p>
        )}

        {card.detailHref && (
          <Button as={Link} to={card.detailHref} onClick={onClose} variant="outline" size="sm" iconRight={ArrowRight}>
            Detaylı oku
          </Button>
        )}
      </Card>
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
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        icon={BookOpen}
        title="Öğren"
        description="Her kart 30 saniyede okunur. Bir konuyu derinlemesine öğrenmek istersen 'Detaylı oku' linkini kullan."
      />

      {/* Arama */}
      <div className="relative">
        <Search
          className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2"
          style={{ color: 'var(--text-faint)' }}
          aria-hidden="true"
        />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Konu ara"
          placeholder="Ne öğrenmek istiyorsun? (örn. AL, risk, bot)"
          className="w-full rounded-xl py-2.5 pl-10 pr-3 text-sm"
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
            <h2 className="text-[11px] font-bold uppercase tracking-[0.18em]" style={{ color: 'var(--gold-400)' }}>
              {cat.label}
            </h2>
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
              {list.map((card) => (
                <Card
                  key={card.id}
                  as="button"
                  type="button"
                  interactive
                  padding="sm"
                  onClick={() => setActiveCard(card)}
                  className="text-left"
                  style={{ minHeight: 88 }}
                >
                  <p className="text-[13.5px] font-semibold leading-snug" style={{ color: 'var(--text-primary)' }}>
                    {card.title}
                  </p>
                </Card>
              ))}
            </div>
          </section>
        )
      })}

      {filtered.length === 0 && (
        <Card padding="none">
          <EmptyState
            icon={Search}
            compact
            title={`"${query}" için kart bulunamadı`}
            description="Aşağıdaki detaylı makalelerde olabilir."
          />
        </Card>
      )}

      {/* Detaylı makaleler */}
      <section className="space-y-3 pt-6">
        <h2 className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em]" style={{ color: 'var(--text-faint)' }}>
          <BookOpen className="h-3.5 w-3.5" />
          Detaylı Rehberler
        </h2>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {DETAILED_ARTICLES.map((a) => (
            <Card
              key={a.slug}
              as={Link}
              to={`/egitim/${a.slug}`}
              interactive
              padding="none"
              className="flex items-center justify-between px-3.5 py-3 text-sm"
              style={{ color: 'var(--text-primary)' }}
            >
              <span className="font-medium">{a.title}</span>
              <span className="flex items-center gap-1.5 text-[11px]" style={{ color: 'var(--text-faint)' }}>
                {a.readingTime} <ArrowRight className="h-3.5 w-3.5" />
              </span>
            </Card>
          ))}
        </div>
      </section>

      <p className="pt-4 text-center text-[11px]" style={{ color: 'var(--text-faint)' }}>
        Bu sayfa yatırım tavsiyesi değildir; tamamen bilgilendirme amaçlıdır.
      </p>

      <CardModal card={activeCard} onClose={() => setActiveCard(null)} />
    </div>
  )
}
