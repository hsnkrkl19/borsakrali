import { useState, useEffect, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Bell, Search, X, Check, CheckCheck, Trash2, RotateCcw, Filter, Settings as SettingsIcon,
  Megaphone, ExternalLink, Inbox, AlertCircle,
} from 'lucide-react'
import { PageHeader, Button } from '../components/ui'
import apiClient from '../services/api'
import {
  useAnnouncementsStore,
  inferCategory,
  NOTIF_CATEGORIES,
} from '../store/announcementsStore'
import { formatRelativeTime } from '../lib/strategyMeta'
import ScrollableTabBar from '../components/ScrollableTabBar'

const CATEGORY_LIST = Object.values(NOTIF_CATEGORIES)

/* ─── Tarih grupla ───────────────────────────────────────────────────── */
function groupByDate(list) {
  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const startOfYesterday = startOfToday - 86400000
  const startOfWeek = startOfToday - 6 * 86400000

  const groups = { today: [], yesterday: [], week: [], older: [] }
  for (const item of list) {
    const t = new Date(item.sentAt || 0).getTime()
    if (t >= startOfToday) groups.today.push(item)
    else if (t >= startOfYesterday) groups.yesterday.push(item)
    else if (t >= startOfWeek) groups.week.push(item)
    else groups.older.push(item)
  }
  return groups
}

const GROUP_LABELS = {
  today: 'Bugün',
  yesterday: 'Dün',
  week: 'Bu Hafta',
  older: 'Daha Eski',
}

/* ─── Kategori rozeti ────────────────────────────────────────────────── */
function CategoryBadge({ categoryId }) {
  const meta = NOTIF_CATEGORIES[categoryId] || NOTIF_CATEGORIES.general
  return (
    <span
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider"
      style={{
        background: `${meta.color}1a`,
        color: meta.color,
        border: `1px solid ${meta.color}40`,
      }}
    >
      <span>{meta.icon}</span>
      {meta.label}
    </span>
  )
}

/* ─── Tek bildirim kartı ─────────────────────────────────────────────── */
function NotifCard({ entry, isUnread, onOpen, onToggleRead, onHide }) {
  const category = inferCategory(entry)
  const meta = NOTIF_CATEGORIES[category] || NOTIF_CATEGORIES.general
  return (
    <div
      className="group flex gap-3 p-3 rounded-xl transition-all"
      style={{
        background: isUnread ? 'rgba(212, 175, 55, 0.05)' : 'var(--bg-card)',
        border: `1px solid ${isUnread ? 'var(--border-gold)' : 'var(--border-main)'}`,
      }}
    >
      <div
        className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 text-base"
        style={{
          background: `${meta.color}18`,
          color: meta.color,
          border: `1px solid ${meta.color}30`,
        }}
      >
        {meta.icon}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center flex-wrap gap-2 mb-1">
              <span className="text-[14px] font-bold leading-tight" style={{ color: 'var(--text-primary)' }}>
                {entry.title}
              </span>
              <CategoryBadge categoryId={category} />
              {isUnread && (
                <span className="w-2 h-2 rounded-full" style={{ background: 'var(--ember)' }} title="Okunmadı" />
              )}
            </div>
            <p className="text-[12.5px] leading-relaxed mb-1.5" style={{ color: 'var(--text-secondary)' }}>
              {entry.body}
            </p>
            <div className="flex items-center gap-2 text-[11px]" style={{ color: 'var(--text-faint)' }}>
              <span>{formatRelativeTime(entry.sentAt)}</span>
              {entry.path && (
                <button
                  type="button"
                  onClick={onOpen}
                  className="flex items-center gap-1 hover:opacity-80 transition-opacity"
                  style={{ color: 'var(--gold-400)' }}
                >
                  <ExternalLink className="w-3 h-3" />
                  {entry.path}
                </button>
              )}
              {entry.sentBy && <span>· {entry.sentBy}</span>}
            </div>
          </div>

          <div className="flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              type="button"
              onClick={onToggleRead}
              className="p-1.5 rounded-md hover:bg-amber-500/10 transition-colors"
              title={isUnread ? 'Okundu olarak işaretle' : 'Okunmadı olarak işaretle'}
              aria-label={isUnread ? 'Okundu' : 'Okunmadı'}
            >
              {isUnread ? <Check className="w-3.5 h-3.5" style={{ color: 'var(--gold-400)' }} /> :
                <RotateCcw className="w-3.5 h-3.5" style={{ color: 'var(--text-muted)' }} />}
            </button>
            <button
              type="button"
              onClick={onHide}
              className="p-1.5 rounded-md hover:bg-red-500/10 transition-colors"
              title="Bu bildirimi gizle"
              aria-label="Gizle"
            >
              <Trash2 className="w-3.5 h-3.5" style={{ color: 'var(--ember)' }} />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ─── Tercihler paneli ───────────────────────────────────────────────── */
function PreferencesPanel({ preferences, onToggle, onClose }) {
  return (
    <div
      className="rounded-xl p-4 mb-4"
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border-gold)',
        boxShadow: '0 4px 16px rgba(212, 175, 55, 0.08)',
      }}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <h3 className="text-[15px] font-bold flex items-center gap-2" style={{ color: 'var(--gold-400)' }}>
            <SettingsIcon className="w-4 h-4" />
            Bildirim Tercihleri
          </h3>
          <p className="text-[11.5px] mt-1" style={{ color: 'var(--text-faint)' }}>
            Sustur ettiğin kategoriler için sesli/toast uyarı atılmaz, listede de gizlenir.
            Kapatabilir, istediğin an açabilirsin — geçmişin korunur.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-1.5 rounded-md hover:bg-amber-500/10"
          aria-label="Kapat"
        >
          <X className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {CATEGORY_LIST.map((cat) => {
          const enabled = preferences[cat.id] !== false
          return (
            <label
              key={cat.id}
              className="flex items-center justify-between gap-2 p-2.5 rounded-lg cursor-pointer transition-all"
              style={{
                background: enabled ? `${cat.color}10` : 'var(--bg-input)',
                border: `1px solid ${enabled ? `${cat.color}40` : 'var(--border-main)'}`,
              }}
            >
              <span className="flex items-center gap-2 text-[12.5px] font-semibold" style={{ color: 'var(--text-primary)' }}>
                <span className="text-base">{cat.icon}</span>
                {cat.label}
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={enabled}
                onClick={() => onToggle(cat.id, !enabled)}
                className="relative w-9 h-5 rounded-full transition-colors flex-shrink-0"
                style={{
                  background: enabled ? cat.color : 'var(--bg-input)',
                  border: `1px solid ${enabled ? cat.color : 'var(--border-main)'}`,
                }}
              >
                <span
                  className="absolute top-0.5 w-3.5 h-3.5 rounded-full transition-all"
                  style={{
                    left: enabled ? '18px' : '2px',
                    background: '#fff',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.2)',
                  }}
                />
              </button>
            </label>
          )
        })}
      </div>
    </div>
  )
}

/* ─── Ana sayfa ──────────────────────────────────────────────────────── */
export default function Bildirimler() {
  const navigate = useNavigate()
  const [searchTerm, setSearchTerm] = useState('')
  const [activeCategory, setActiveCategory] = useState('all')
  const [showPrefs, setShowPrefs] = useState(false)
  const [showHidden, setShowHidden] = useState(false)
  const [loading, setLoading] = useState(true)

  const announcements = useAnnouncementsStore((s) => s.announcements)
  const readIds = useAnnouncementsStore((s) => s.readIds)
  const hiddenIds = useAnnouncementsStore((s) => s.hiddenIds)
  const preferences = useAnnouncementsStore((s) => s.preferences)
  const setAnnouncements = useAnnouncementsStore((s) => s.setAnnouncements)
  const markRead = useAnnouncementsStore((s) => s.markRead)
  const markUnread = useAnnouncementsStore((s) => s.markUnread)
  const markAllRead = useAnnouncementsStore((s) => s.markAllRead)
  const hideAnnouncement = useAnnouncementsStore((s) => s.hideAnnouncement)
  const restoreAll = useAnnouncementsStore((s) => s.restoreAll)
  const setPreference = useAnnouncementsStore((s) => s.setPreference)

  // İlk yükleme — daha geniş bir geçmiş çek (sayfa için 50 makul)
  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const res = await apiClient.get('/notifications/announcements?limit=50')
        if (!cancelled && res.data?.success) {
          setAnnouncements(res.data.announcements || [])
        }
      } catch {
        /* dropdown'da zaten 20 var, kritik değil */
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [setAnnouncements])

  const readSet = useMemo(() => new Set(readIds), [readIds])
  const hiddenSet = useMemo(() => new Set(hiddenIds), [hiddenIds])

  // Kategori bazlı sayım — chip'lerin yanında badge için
  const categoryCounts = useMemo(() => {
    const counts = { all: 0 }
    for (const cat of CATEGORY_LIST) counts[cat.id] = 0
    for (const a of announcements) {
      if (!showHidden && a.id && hiddenSet.has(a.id)) continue
      const cat = inferCategory(a)
      if (preferences && preferences[cat] === false) continue
      counts.all += 1
      counts[cat] = (counts[cat] || 0) + 1
    }
    return counts
  }, [announcements, hiddenSet, showHidden, preferences])

  // Filtrelenmiş + kategori + arama
  const filtered = useMemo(() => {
    const q = searchTerm.trim().toLowerCase()
    return announcements.filter((a) => {
      if (!a.id) return false
      if (!showHidden && hiddenSet.has(a.id)) return false
      if (showHidden && !hiddenSet.has(a.id)) return false
      const cat = inferCategory(a)
      if (preferences && preferences[cat] === false && !showHidden) return false
      if (activeCategory !== 'all' && cat !== activeCategory) return false
      if (q) {
        const hay = `${a.title || ''} ${a.body || ''} ${a.path || ''}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [announcements, hiddenSet, showHidden, activeCategory, searchTerm, preferences])

  const grouped = useMemo(() => groupByDate(filtered), [filtered])
  const totalUnread = useMemo(
    () => filtered.filter((a) => a.id && !readSet.has(a.id)).length,
    [filtered, readSet]
  )

  const handleOpen = useCallback((entry) => {
    if (entry.id) markRead(entry.id)
    if (!entry.path) return
    if (/^https?:\/\//i.test(entry.path)) window.open(entry.path, '_blank')
    else navigate(entry.path)
  }, [navigate, markRead])

  const handleToggleRead = useCallback((entry) => {
    if (!entry.id) return
    if (readSet.has(entry.id)) markUnread(entry.id)
    else markRead(entry.id)
  }, [readSet, markRead, markUnread])

  return (
    <div className="max-w-4xl mx-auto px-4 lg:px-6 py-6">
      <PageHeader
        icon={Bell}
        title="Bildirim Merkezi"
        description="Tüm duyurular, sinyal uyarıları ve piyasa bildirimleri burada toplanır."
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant={showPrefs ? 'gold' : 'ghost'}
              size="sm"
              icon={SettingsIcon}
              onClick={() => setShowPrefs((v) => !v)}
            >
              Tercihler
            </Button>
            <Button
              variant="outline"
              size="sm"
              icon={CheckCheck}
              disabled={totalUnread === 0}
              onClick={markAllRead}
            >
              Tümünü Okundu Say{totalUnread > 0 && ` (${totalUnread})`}
            </Button>
          </div>
        }
      />

      {/* ─── Tercihler paneli ─── */}
      {showPrefs && (
        <PreferencesPanel
          preferences={preferences || {}}
          onToggle={setPreference}
          onClose={() => setShowPrefs(false)}
        />
      )}

      {/* ─── Arama + Gizlenmişler toggle ─── */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <div
          className="flex-1 min-w-[200px] flex items-center gap-2 px-3 h-10 rounded-xl"
          style={{
            background: 'var(--bg-input)',
            border: '1px solid var(--border-main)',
          }}
        >
          <Search className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--text-muted)' }} />
          <input
            type="text"
            placeholder="Başlık veya içerikte ara…"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="flex-1 bg-transparent outline-none text-[13px]"
            style={{ color: 'var(--text-primary)' }}
          />
          {searchTerm && (
            <button onClick={() => setSearchTerm('')} aria-label="Aramayı temizle" className="opacity-60 hover:opacity-100">
              <X className="w-3.5 h-3.5" style={{ color: 'var(--text-muted)' }} />
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={() => setShowHidden((v) => !v)}
          className="flex items-center gap-1.5 px-3 h-10 rounded-xl text-[12px] font-semibold transition-colors"
          style={{
            background: showHidden ? 'rgba(255, 59, 70, 0.10)' : 'var(--bg-card)',
            color: showHidden ? 'var(--ember)' : 'var(--text-muted)',
            border: `1px solid ${showHidden ? 'rgba(255, 59, 70, 0.4)' : 'var(--border-main)'}`,
          }}
        >
          <Trash2 className="w-3.5 h-3.5" />
          {showHidden ? 'Aktiflere Dön' : 'Gizlenenler'}
        </button>
        {showHidden && hiddenIds.length > 0 && (
          <button
            type="button"
            onClick={restoreAll}
            className="flex items-center gap-1.5 px-3 h-10 rounded-xl text-[12px] font-semibold transition-colors"
            style={{
              background: 'rgba(16, 185, 129, 0.10)',
              color: 'var(--jade)',
              border: '1px solid rgba(16, 185, 129, 0.3)',
            }}
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Hepsini Geri Yükle
          </button>
        )}
      </div>

      {/* ─── Kategori chip'leri — sağ/sol ok butonu ─── */}
      <ScrollableTabBar
        activeKey={activeCategory}
        wrapperClassName="mb-5"
        className="items-center gap-2 pb-1 -mx-1 px-1"
      >
        <button
          type="button"
          data-tab-key="all"
          onClick={() => setActiveCategory('all')}
          className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11.5px] font-bold whitespace-nowrap transition-all"
          style={{
            background: activeCategory === 'all' ? 'rgba(212, 175, 55, 0.18)' : 'var(--bg-card)',
            color: activeCategory === 'all' ? 'var(--gold-400)' : 'var(--text-muted)',
            border: `1px solid ${activeCategory === 'all' ? 'var(--border-gold)' : 'var(--border-main)'}`,
          }}
        >
          <Filter className="w-3 h-3" />
          Tümü
          <span className="num-tabular opacity-70">({categoryCounts.all})</span>
        </button>
        {CATEGORY_LIST.map((cat) => {
          const isActive = activeCategory === cat.id
          const count = categoryCounts[cat.id] || 0
          if (count === 0 && !isActive) return null
          return (
            <button
              key={cat.id}
              type="button"
              data-tab-key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11.5px] font-bold whitespace-nowrap transition-all"
              style={{
                background: isActive ? `${cat.color}20` : 'var(--bg-card)',
                color: isActive ? cat.color : 'var(--text-muted)',
                border: `1px solid ${isActive ? `${cat.color}50` : 'var(--border-main)'}`,
              }}
            >
              <span>{cat.icon}</span>
              {cat.label}
              <span className="num-tabular opacity-70">({count})</span>
            </button>
          )
        })}
      </ScrollableTabBar>

      {/* ─── Liste ─── */}
      {loading ? (
        <div className="text-center py-16" style={{ color: 'var(--text-faint)' }}>
          <Bell className="w-8 h-8 mx-auto mb-3 opacity-50 animate-pulse" />
          <div className="text-[13px]">Bildirimler yükleniyor…</div>
        </div>
      ) : filtered.length === 0 ? (
        <div
          className="text-center py-16 rounded-xl"
          style={{
            background: 'var(--bg-card)',
            border: '1px dashed var(--border-main)',
          }}
        >
          {showHidden ? (
            <>
              <Trash2 className="w-9 h-9 mx-auto mb-3 opacity-40" style={{ color: 'var(--text-faint)' }} />
              <div className="text-[14px] font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>
                Gizlenmiş bildirim yok
              </div>
              <div className="text-[12px]" style={{ color: 'var(--text-faint)' }}>
                Bir bildirimi sağ köşedeki çöp kutusu ile gizleyebilirsin.
              </div>
            </>
          ) : searchTerm || activeCategory !== 'all' ? (
            <>
              <Search className="w-9 h-9 mx-auto mb-3 opacity-40" style={{ color: 'var(--text-faint)' }} />
              <div className="text-[14px] font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>
                Eşleşen bildirim yok
              </div>
              <div className="text-[12px]" style={{ color: 'var(--text-faint)' }}>
                Filtre veya arama kriterini değiştirmeyi dene.
              </div>
            </>
          ) : (
            <>
              <Inbox className="w-9 h-9 mx-auto mb-3 opacity-40" style={{ color: 'var(--text-faint)' }} />
              <div className="text-[14px] font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>
                Bildirim yok
              </div>
              <div className="text-[12px]" style={{ color: 'var(--text-faint)' }}>
                Fırsat çıkınca burada görünür.
              </div>
              {Object.values(preferences || {}).some((v) => v === false) && (
                <div
                  className="mt-4 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px]"
                  style={{
                    background: 'rgba(245, 158, 11, 0.10)',
                    color: 'var(--gold-400)',
                    border: '1px solid var(--border-gold)',
                  }}
                >
                  <AlertCircle className="w-3 h-3" />
                  Bazı kategorileri sustur ettin — Tercihler'den geri açabilirsin.
                </div>
              )}
            </>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).map(([key, list]) => {
            if (!list.length) return null
            return (
              <section key={key}>
                <h2
                  className="text-[11px] font-bold uppercase tracking-[0.2em] mb-2 px-1"
                  style={{ color: 'var(--text-faint)' }}
                >
                  {GROUP_LABELS[key]} <span className="opacity-60 num-tabular">· {list.length}</span>
                </h2>
                <div className="space-y-2">
                  {list.map((entry) => (
                    <NotifCard
                      key={entry.id || entry.sentAt}
                      entry={entry}
                      isUnread={entry.id && !readSet.has(entry.id)}
                      onOpen={() => handleOpen(entry)}
                      onToggleRead={() => handleToggleRead(entry)}
                      onHide={() => entry.id && hideAnnouncement(entry.id)}
                    />
                  ))}
                </div>
              </section>
            )
          })}
        </div>
      )}

      {/* Alt info çubuğu */}
      <div className="mt-8 pt-4 border-t flex items-center justify-between gap-2 flex-wrap text-[11px]"
        style={{ borderColor: 'var(--border-main)', color: 'var(--text-faint)' }}
      >
        <span className="flex items-center gap-1.5">
          <Megaphone className="w-3 h-3" />
          Toplam {announcements.length} bildirim · {hiddenIds.length} gizli
        </span>
        <span>
          Bildirim gelmiyor mu? <button onClick={() => navigate('/ayarlar')} className="underline hover:opacity-80" style={{ color: 'var(--gold-400)' }}>Tarayıcı izinlerini kontrol et</button>
        </span>
      </div>
    </div>
  )
}
