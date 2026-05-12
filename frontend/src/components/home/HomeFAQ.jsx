import { useState } from 'react'
import { Plus, Minus, HelpCircle } from 'lucide-react'
import { useScrollReveal, useHoverTilt } from '../../hooks/useAnime'

const FAQS = [
  {
    q: 'Sinyaller %100 doğru mu? Kazanma garantisi var mı?',
    a: 'Hayır. Hiçbir sinyal kazanma garantisi vermez. Algoritmamız geçmiş veriler ve teknik göstergeler üzerinden olasılık üretir — kesinlik değil. Backtest sonuçlarını ve başarısız dönemleri açık paylaşıyoruz. Her sinyale ortalama %55-68 başarı oranı veriyoruz (strateji bazında değişir). Risk yönetimi her zaman kendi sorumluluğunuzdadır.',
  },
  {
    q: 'Sinyallerin arkasındaki algoritma nasıl çalışıyor?',
    a: 'Her hisse 16 teknik kritere göre puanlanır: RSI (aşırı alım/satım + divergence), MACD (sinyal kesimi + ivme), EMA dizilimi (8/21/34), ATR volatilite rejimi, mum formasyonları, hacim doğrulaması, destek-direnç yakınlığı, momentum ve daha fazlası. Skor 16/16 yaklaştıkça sinyal güçlenir. Kripto için ek olarak funding rate ve Binance USDT klines entegrasyonu var. Tüm formüller ve eşik değerleri "Nasıl Çalışır?" bölümünde detaylıdır.',
  },
  {
    q: 'Hangi veri kaynaklarını kullanıyorsunuz?',
    a: 'BIST için Yahoo Finance (anlık fiyat akışı) + KAP (resmi şirket duyuruları). Kripto için CoinGecko (top 100 coin) ve Binance (USDT klines + futures funding rate). Ekonomik takvim için TR + ABD veri sağlayıcıları. Tüm kaynaklar herkese açık ve doğrulanabilir.',
  },
  {
    q: 'Backtest sonuçları gerçek mi, abartılı mı?',
    a: 'Backtest sonuçlarımız geriye dönük gerçek BIST/kripto verisi üzerinde simüle edilir. Spot kripto için 3 dönem ortalaması +%102 net, Futures Long için +%38 net, BIST MTF Confluence için +%47 net dönüş hesaplandı. ÖNEMLİ: Geçmiş performans gelecek getiri garantisi değildir. Backtest komisyon ve slippage gibi gerçek piyasa sürtünmelerini dahil eder. Algoritma sürekli güncellenir.',
  },
  {
    q: 'Bu siteden yatırım tavsiyesi alabilir miyim?',
    a: 'Hayır. Borsa Kralı SPK lisanslı bir yatırım danışmanlığı şirketi değildir. Tüm içerik tamamen eğitim ve bilgilendirme amaçlıdır. Hiçbir sinyal, analiz veya yorum bir alım-satım tavsiyesi olarak yorumlanamaz. Gerçek yatırım kararları için SPK lisanslı bir yatırım danışmanına başvurmanız önerilir.',
  },
  {
    q: 'Ücretsiz hesap ile ne yapabilirim?',
    a: 'Ücretsiz hesapla günlük top 10 sinyalini, BIST piyasa kokpitini, kripto sinyallerini, eğitim makalelerini ve canlı heatmap\'i kullanabilirsiniz. Premium plan (50 TL/ay veya 1500 TL ömür boyu) ile gelişmiş AI analizler, DCF değerleme, sınırsız takip listesi ve öncelikli bildirimler açılır. Kredi kartı bilgisi kayıt sırasında istenmez.',
  },
  {
    q: 'Sinyalleri ne sıklıkta alıyorum?',
    a: 'BIST için 09:55\'te pre-market sinyalleri, 11:00\'da revizyon, gün içinde sessiz güncellemeler. Kripto için 09:00, 13:00, 19:00, 01:00 saatlerinde push bildirimleri + her 30 dakikada bir sessiz tarama. MTF (Multi-Timeframe) sistemi sürekli arka planda 7 zaman çerçevesini hesaplar; STRONG_LONG/SHORT geçişlerinde bildirim alırsın.',
  },
  {
    q: 'Verilerim güvende mi? Kimseyle paylaşılıyor mu?',
    a: 'Hesap bilgileriniz, takip listeniz ve notlarınız bizim güvenli sunucumuzda saklanır. Üçüncü taraflarla paylaşılmaz. AdSense ve Google Analytics (anonim) site analizi için kullanılır. Tam ayrıntılar için Gizlilik Politikası sayfasına bakabilirsiniz. Hesap silme talebiniz olursa /hesap-silme sayfasından kalıcı silme yapabilirsiniz.',
  },
]

function FaqItem({ item, isOpen, onToggle, index }) {
  return (
    <div
      className="rounded-2xl border overflow-hidden transition-all duration-400"
      style={{
        background: isOpen
          ? 'linear-gradient(135deg, rgba(212,175,55,0.04), rgba(212,175,55,0.01))'
          : 'var(--bg-card)',
        borderColor: isOpen ? 'var(--border-gold)' : 'var(--border-main)',
        boxShadow: isOpen ? '0 0 0 1px rgba(212,175,55,0.08) inset, var(--shadow-md)' : 'var(--shadow-sm)',
      }}
    >
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between gap-4 px-5 py-4 sm:py-5 text-left group"
        aria-expanded={isOpen}
      >
        <div className="flex items-center gap-3 min-w-0">
          <span
            className="text-[10px] font-bold tracking-[0.18em] uppercase flex-shrink-0"
            style={{ color: isOpen ? 'var(--gold-400)' : 'var(--text-faint)' }}
          >
            {String(index + 1).padStart(2, '0')}
          </span>
          <span
            className="text-[14px] sm:text-[15px] font-semibold leading-snug transition-colors"
            style={{ color: isOpen ? 'var(--text-primary)' : 'var(--text-secondary)' }}
          >
            {item.q}
          </span>
        </div>
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 transition-all duration-300"
          style={{
            background: isOpen ? 'rgba(212,175,55,0.15)' : 'var(--bg-input)',
            border: `1px solid ${isOpen ? 'var(--border-gold-strong)' : 'var(--border-main)'}`,
            transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
          }}
        >
          {isOpen
            ? <Minus className="w-4 h-4" style={{ color: 'var(--gold-400)' }} />
            : <Plus  className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
          }
        </div>
      </button>

      {/* Cevap — height transition için grid trick */}
      <div
        className="grid transition-[grid-template-rows] duration-500 ease-out"
        style={{ gridTemplateRows: isOpen ? '1fr' : '0fr' }}
      >
        <div className="overflow-hidden">
          <div className="px-5 pb-5 pt-0 ml-9 sm:ml-12">
            <div
              className="rounded-xl p-4 border text-[13px] sm:text-[13.5px] leading-relaxed"
              style={{
                background: 'var(--bg-input)',
                borderColor: 'var(--border-main)',
                color: 'var(--text-secondary)',
              }}
            >
              {item.a}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function HomeFAQ() {
  const [openIdx, setOpenIdx] = useState(0) // İlk SSS varsayılan olarak açık
  const headRef = useScrollReveal({ selector: '> *', stagger: 80, y: 22, duration: 800 })
  const listRef = useScrollReveal({ selector: '> *', stagger: 70, y: 18, duration: 700, delay: 120 })

  return (
    <section className="relative">
      <div ref={headRef} className="text-center mb-8 max-w-2xl mx-auto">
        <div
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-[11px] font-semibold tracking-wide uppercase mb-3"
          style={{
            background: 'rgba(212,175,55,0.08)',
            borderColor: 'var(--border-gold)',
            color: 'var(--gold-400)',
          }}
        >
          <HelpCircle className="w-3 h-3" />
          Sık Sorulan Sorular
        </div>
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight mb-3"
          style={{ color: 'var(--text-primary)' }}
        >
          Aklındaki soruları cevaplayalım
        </h2>
        <p className="text-sm sm:text-base" style={{ color: 'var(--text-muted)' }}>
          Şeffaflık prensibimiz gereği zor sorulardan kaçınmıyoruz.
          Algoritma, veriler, başarı oranı, risk — hepsi açık.
        </p>
      </div>

      <div ref={listRef} className="max-w-3xl mx-auto space-y-2.5">
        {FAQS.map((item, i) => (
          <FaqItem
            key={i}
            item={item}
            index={i}
            isOpen={openIdx === i}
            onToggle={() => setOpenIdx(openIdx === i ? -1 : i)}
          />
        ))}
      </div>
    </section>
  )
}
