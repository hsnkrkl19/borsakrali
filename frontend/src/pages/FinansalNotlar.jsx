import { useState, useEffect } from 'react'
import { Plus, Search, Trash2, Edit3, Save, X, FileText, Tag, TrendingUp } from 'lucide-react'

const STORAGE_KEY = 'bk-notes'
const CATEGORIES = ['Analiz', 'Fikir', 'Hatırlatıcı', 'Haber', 'Diğer']
const CAT_COLORS = {
  'Analiz':       'bg-blue-500/20 text-blue-400',
  'Fikir':        'bg-purple-500/20 text-purple-400',
  'Hatırlatıcı':  'bg-yellow-500/20 text-yellow-400',
  'Haber':        'bg-green-500/20 text-green-400',
  'Diğer':        'bg-gray-500/20 text-gray-400',
}

export default function FinansalNotlar() {
  const [notes, setNotes] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterCat, setFilterCat] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState({ symbol: '', title: '', content: '', category: 'Analiz' })
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState(null)

  useEffect(() => { fetchNotes() }, [])

  const fetchNotes = () => {
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
      setNotes(stored)
    } catch {
      setNotes([])
    } finally {
      setLoading(false)
    }
  }

  const handleSave = (e) => {
    e.preventDefault()
    if (!form.content.trim()) return
    setSaving(true)
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
    let updated
    if (editingId) {
      updated = stored.map(n => n.id === editingId
        ? { ...n, ...form, updatedAt: new Date().toISOString() }
        : n)
    } else {
      const newNote = { id: Date.now().toString(), ...form, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
      updated = [newNote, ...stored]
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
    setNotes(updated)
    resetForm()
    setSaving(false)
  }

  const handleDelete = (id) => {
    setDeletingId(id)
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
    const updated = stored.filter(n => n.id !== id)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
    setNotes(updated)
    setDeletingId(null)
  }

  const startEdit = (note) => {
    setForm({ symbol: note.symbol || '', title: note.title || '', content: note.content, category: note.category || 'Analiz' })
    setEditingId(note.id)
    setShowForm(true)
  }

  const resetForm = () => {
    setForm({ symbol: '', title: '', content: '', category: 'Analiz' })
    setEditingId(null)
    setShowForm(false)
  }

  const filtered = notes.filter(n => {
    const q = search.toLowerCase()
    const matchSearch = !q || n.symbol?.toLowerCase().includes(q) || n.title?.toLowerCase().includes(q) || n.content?.toLowerCase().includes(q)
    const matchCat = !filterCat || n.category === filterCat
    return matchSearch && matchCat
  })

  return (
    <div className="space-y-5 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Finansal Notlar</h1>
          <p className="text-xs text-gray-500 mt-0.5">Hisseleriniz için kişisel notlar</p>
        </div>
        <button
          onClick={() => { resetForm(); setShowForm(true) }}
          className="btn-primary flex items-center gap-2 text-sm"
        >
          <Plus className="w-4 h-4" />
          Not Ekle
        </button>
      </div>

      {/* Search + Filter */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            className="input w-full pl-9 text-sm"
            placeholder="Sembol veya not ara..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <select
          className="input text-sm"
          value={filterCat}
          onChange={e => setFilterCat(e.target.value)}
        >
          <option value="">Tüm Kategoriler</option>
          {CATEGORIES.map(c => <option key={c}>{c}</option>)}
        </select>
      </div>

      {/* Form */}
      {showForm && (
        <div className="card border-gold-500/30">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-white">{editingId ? 'Notu Düzenle' : 'Yeni Not'}</h3>
            <button onClick={resetForm} className="text-gray-500 hover:text-white">
              <X className="w-5 h-5" />
            </button>
          </div>
          <form onSubmit={handleSave} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-400 block mb-1">SEMBOL</label>
                <input
                  className="input w-full text-sm uppercase"
                  placeholder="THYAO"
                  value={form.symbol}
                  onChange={e => setForm(f => ({ ...f, symbol: e.target.value.toUpperCase() }))}
                  maxLength={10}
                />
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-1">KATEGORİ</label>
                <select className="input w-full text-sm" value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
                  {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="text-xs text-gray-400 block mb-1">BAŞLIK</label>
              <input
                className="input w-full text-sm"
                placeholder="Not başlığı (opsiyonel)"
                value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                maxLength={100}
              />
            </div>
            <div>
              <label className="text-xs text-gray-400 block mb-1">NOT *</label>
              <textarea
                className="input w-full resize-none text-sm"
                rows={5}
                placeholder="Notunuzu yazın..."
                value={form.content}
                onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
                maxLength={2000}
                required
              />
              <p className="text-xs text-gray-600 text-right mt-1">{form.content.length}/2000</p>
            </div>
            <div className="flex gap-2">
              <button type="submit" disabled={saving} className="btn-primary flex-1 flex items-center justify-center gap-2">
                <Save className="w-4 h-4" />
                {saving ? 'Kaydediliyor...' : 'Kaydet'}
              </button>
              <button type="button" onClick={resetForm} className="btn-secondary px-6">İptal</button>
            </div>
          </form>
        </div>
      )}

      {/* Notes List */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-2 border-gold-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="card text-center py-12">
          <FileText className="w-12 h-12 text-gray-600 mx-auto mb-3" />
          <p className="text-gray-400 text-sm">
            {notes.length === 0 ? 'Henüz not yok. İlk notunuzu ekleyin!' : 'Arama sonucu yok.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).map(note => (
            <div key={note.id} className="card hover:border-gold-500/20 transition-colors">
              <div className="flex items-start gap-3">
                {note.symbol && (
                  <div className="w-10 h-10 bg-gold-500/10 rounded-xl flex items-center justify-center flex-shrink-0">
                    <span className="text-gold-400 font-bold text-xs">{note.symbol.slice(0, 4)}</span>
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start gap-2 flex-wrap">
                    {note.title && <h3 className="font-semibold text-white text-sm">{note.title}</h3>}
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${CAT_COLORS[note.category] || CAT_COLORS['Diğer']}`}>
                      {note.category}
                    </span>
                  </div>
                  <p className="text-sm text-gray-300 mt-1 whitespace-pre-wrap line-clamp-3">{note.content}</p>
                  <p className="text-xs text-gray-600 mt-1.5">
                    {note.createdAt ? new Date(note.createdAt).toLocaleString('tr-TR') : ''}
                    {note.updatedAt && note.updatedAt !== note.createdAt ? ' (düzenlendi)' : ''}
                  </p>
                </div>
                <div className="flex gap-1 flex-shrink-0">
                  <button onClick={() => startEdit(note)} className="p-1.5 text-gray-500 hover:text-gold-400 transition-colors">
                    <Edit3 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(note.id)}
                    disabled={deletingId === note.id}
                    className="p-1.5 text-gray-500 hover:text-red-400 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
