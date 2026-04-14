import { useState, useEffect } from 'react'
import { MessageSquare, Send, User, Clock, ChevronDown, ChevronUp } from 'lucide-react'

export default function Comments() {
  const [comments, setComments] = useState([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [isOpen, setIsOpen] = useState(false)
  const [name, setName] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => {
    if (isOpen) {
      fetchComments()
    }
  }, [isOpen])

  const fetchComments = async () => {
    try {
      const response = await fetch('/api/comments')
      const data = await response.json()
      if (data.success) {
        setComments(data.comments)
      }
    } catch (err) {
      console.error('Yorumlar alinamadi:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setSuccess('')

    if (!name.trim() || !message.trim()) {
      setError('Ad ve mesaj alanlari zorunludur!')
      return
    }

    setSubmitting(true)

    try {
      const response = await fetch('/api/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), message: message.trim() })
      })

      const data = await response.json()

      if (data.success) {
        setSuccess('Yorumunuz eklendi!')
        setName('')
        setMessage('')
        fetchComments()
        setTimeout(() => setSuccess(''), 3000)
      } else {
        setError(data.error || 'Yorum eklenemedi')
      }
    } catch (err) {
      setError('Baglanti hatasi!')
    } finally {
      setSubmitting(false)
    }
  }

  const formatDate = (dateString) => {
    const date = new Date(dateString)
    const now = new Date()
    const diff = now - date
    const minutes = Math.floor(diff / 60000)
    const hours = Math.floor(diff / 3600000)
    const days = Math.floor(diff / 86400000)

    if (minutes < 1) return 'Simdi'
    if (minutes < 60) return `${minutes} dk once`
    if (hours < 24) return `${hours} saat once`
    if (days < 7) return `${days} gun once`
    return date.toLocaleDateString('tr-TR')
  }

  return (
    <div className="fixed bottom-4 right-4 z-50">
      {/* Toggle Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="bg-primary-600 hover:bg-primary-700 text-white rounded-full p-4 shadow-lg flex items-center gap-2 transition-all"
      >
        <MessageSquare className="w-5 h-5" />
        <span className="font-medium">Gorus & Oneri</span>
        {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
      </button>

      {/* Comments Panel */}
      {isOpen && (
        <div className="absolute bottom-16 right-0 w-96 bg-dark-800 rounded-xl border border-dark-700 shadow-2xl overflow-hidden">
          {/* Header */}
          <div className="bg-dark-900 p-4 border-b border-dark-700">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-primary-500" />
              Gorus ve Oneriler
            </h3>
            <p className="text-xs text-gray-500 mt-1">Dusuncelerinizi paylasın</p>
          </div>

          {/* Comment Form */}
          <form onSubmit={handleSubmit} className="p-4 border-b border-dark-700">
            {error && (
              <div className="mb-3 p-2 bg-red-500/10 border border-red-500/30 rounded text-red-400 text-sm">
                {error}
              </div>
            )}
            {success && (
              <div className="mb-3 p-2 bg-green-500/10 border border-green-500/30 rounded text-green-400 text-sm">
                {success}
              </div>
            )}

            <div className="mb-3">
              <input
                type="text"
                placeholder="Adiniz"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={50}
                className="w-full bg-dark-900 border border-dark-600 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-primary-500"
              />
            </div>

            <div className="mb-3">
              <textarea
                placeholder="Mesajiniz..."
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                maxLength={500}
                rows={3}
                className="w-full bg-dark-900 border border-dark-600 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-primary-500 resize-none"
              />
              <p className="text-xs text-gray-600 mt-1 text-right">{message.length}/500</p>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-primary-600 hover:bg-primary-700 disabled:bg-dark-700 text-white py-2 rounded-lg font-medium flex items-center justify-center gap-2 transition-colors"
            >
              {submitting ? (
                'Gonderiliyor...'
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  Gonder
                </>
              )}
            </button>
          </form>

          {/* Comments List */}
          <div className="max-h-64 overflow-y-auto p-4 space-y-3">
            {loading ? (
              <div className="text-center py-4">
                <div className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
              </div>
            ) : comments.length === 0 ? (
              <div className="text-center py-4 text-gray-500 text-sm">
                Henuz yorum yok. Ilk yorumu siz yapin!
              </div>
            ) : (
              comments.map((comment) => (
                <div key={comment.id} className="bg-dark-900 rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-8 h-8 bg-primary-500/20 rounded-full flex items-center justify-center">
                      <User className="w-4 h-4 text-primary-500" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-white">{comment.name}</p>
                      <p className="text-xs text-gray-500 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {formatDate(comment.createdAt)}
                      </p>
                    </div>
                  </div>
                  <p className="text-sm text-gray-300 break-words">{comment.message}</p>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
