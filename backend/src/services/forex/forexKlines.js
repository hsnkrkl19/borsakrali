/**
 * forexKlines — Forex/parite OHLC veri katmanı (Yahoo Finance chart endpoint).
 *
 * cryptoKlines ile aynı altyapı, fakat sembol Yahoo'da olduğu gibi tam verilir
 * (EURUSD=X, GC=F, NQ=F, BTC-USD ...). Çoklu zaman dilimi (her birine ayrı
 * sinyal): 5m, 15m, 1h, 4h, 1d (+ canlı fiyat için 1m).
 *   4h → Yahoo'da yok, 1h çekilip 4'erli (UTC sınırına hizalı) toplanır.
 *
 * Mum formatı: { time(saniye), open, high, low, close, volume } — eski→yeni.
 * Her (sembol, tf) için kısa TTL cache — her dk tarama Yahoo'yu boğmasın.
 */
const axios = require('axios');

const YAHOO_CHART = 'https://query1.finance.yahoo.com/v8/finance/chart';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

// Doğrudan Yahoo interval'ı olan TF'ler (4h hariç — 1h'ten resample edilir)
const YH_INTERVAL = { '1m': '1m', '5m': '5m', '15m': '15m', '30m': '30m', '1h': '1h', '1d': '1d', '1wk': '1wk' };
// 250+ mum için yeterli range. 4h/8h için 1h'i geniş çekip resample ederiz.
// ⚠️ 30m: '2mo' Yahoo tarafından 422 ile REDDEDİLİR ("30m data ... must be within
// the last 60 days" — 2 ay 60 günü aşıyor). Ölçüldü (2026-07-23): 2mo→422/0 bar,
// 1mo→1202 bar. Bu yüzden 30m aralığı '1mo'. (15m zaten '1mo' ile aynı sınırda.)
const YH_RANGE    = { '1m': '1d', '5m': '5d', '15m': '1mo', '30m': '1mo', '1h': '3mo', '4h': '6mo', '8h': '1y', '1d': '2y', '1wk': '5y' };

// Cache ömrü — düşük TF sık, yüksek TF seyrek tazelenir.
const TTL_MS = {
  '1m': 50 * 1000, '5m': 4 * 60 * 1000, '15m': 9 * 60 * 1000, '30m': 15 * 60 * 1000,
  '1h': 30 * 60 * 1000, '4h': 30 * 60 * 1000, '8h': 30 * 60 * 1000, '1d': 60 * 60 * 1000,
};

const cache = new Map(); // key -> { data, t }

function parseChart(json) {
  const r = json?.chart?.result?.[0];
  if (!r || !r.timestamp) return null;
  const ts = r.timestamp;
  const q = r.indicators?.quote?.[0] || {};
  const out = [];
  for (let i = 0; i < ts.length; i++) {
    const o = q.open?.[i], h = q.high?.[i], l = q.low?.[i], c = q.close?.[i];
    if (o == null || h == null || l == null || c == null) continue;
    if (!(c > 0)) continue;
    out.push({ time: ts[i], open: +o, high: +h, low: +l, close: +c, volume: +(q.volume?.[i] || 0) });
  }
  return out;
}

// 1h mumlarını N saatlik bara topla. Her bar KENDİ zaman damgasının
// floor(time / N*3600) buketine atanır (UTC sınırı) — dizi pozisyonuyla
// gruplama YOK: eksik 1h bar (endeks vadelisi bakım saati → 23 barlık gün,
// FX hafta sonu, Yahoo veri deliği) sonraki buketlerin hizasını kaydıramaz.
function resampleHours(h1, hours) {
  if (!h1 || !h1.length) return h1 || [];
  const sec = hours * 3600;
  const out = [];
  let cur = null;
  for (const c of h1) {
    const bucket = Math.floor(c.time / sec) * sec;
    if (!cur || cur.time !== bucket) {
      cur = { time: bucket, open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume };
      out.push(cur);
    } else {
      if (c.high > cur.high) cur.high = c.high;
      if (c.low < cur.low) cur.low = c.low;
      cur.close = c.close;
      cur.volume += c.volume;
    }
  }
  // Pencere buket ortasında açıldıysa ilk buketin açılış saatleri eksik → düş.
  if (out.length > 1 && h1[0].time % sec !== 0) out.shift();
  return out;
}
const resample4h = (h1) => resampleHours(h1, 4); // geriye uyum

// TF → milisaniye (kapalı-bar süzgeci ve bar hizası için tek kaynak).
const TF_MS = {
  '1m': 60 * 1000, '5m': 5 * 60000, '15m': 15 * 60000, '30m': 30 * 60000,
  '1h': 3600000, '4h': 4 * 3600000, '8h': 8 * 3600000,
  '1d': 24 * 3600000, '1wk': 7 * 24 * 3600000,
};

/**
 * KAPALI BAR SÜZGECİ — yarım (forming) mumu değerlendirmekten koruyan TEK yer.
 *
 * NEDEN `slice(0, -1)` YETMEZ (canlı ölçüldü, 2026-07-23):
 * Yahoo chart yanıtı, TF'ye hizalı FORMING barın ARDINA bir de "anlık kotasyon"
 * satırı ekler (meta.regularMarketTime damgalı, volume 0). Yaygın slice(0,-1)
 * kalıbı yalnız o kotasyon satırını atar; geriye HÂLÂ OLUŞAN bar kalır:
 *   GC=F 5m  75 sn arayla iki çekim → "değerlendirilen" 15:40 barı 4054.60 ⟶ 4054.30
 *   GC=F 30m aynı → 15:30 barı 4054.60 ⟶ 4054.30   (kapalı bir bar DEĞİŞEMEZ)
 * Sinyal yarım mumdan doğar; signalId bara sabitlendiği için bar içinde koşulun
 * anlık sağlandığı İLK anda kalıcı pozisyon (ve köprüde GERÇEK MT5 emri) açılır,
 * bar çürüyerek kapansa bile geri alınmaz. Projenin TEMA34'te bir kez yaşadığı
 * "gün-içi yarım-mum sahte sinyal" hatasının aynısı.
 *
 * SABİT SLICE SAYISI ÇÖZÜM DEĞİLDİR: slice(0,-2) seans kapalıyken (kotasyon
 * satırı yokken) GERÇEK bir kapalı barı atar.
 *
 * HİZA (`time % tfMs`) İLE DE ÇÖZÜLEMEZ: Yahoo günlük barları epoch'a hizalı
 * DEĞİLDİR — ölçüldü: GC=F/NQ=F/ES=F/SI=F 1d barları 04:00 UTC damgalı
 * (mod=14400000), EURUSD=X 1d ise DST'ye göre 23:00/00:00 arasında GEZER. Hiza
 * süzgeci bu serileri ya tamamen boşaltır (tüm 1d botları SESSİZCE susar) ya da
 * ortadan delik açar. Bu yüzden kapalılık YALNIZ zamanla belirlenir:
 *
 *   bar kapalı  ⇔  besleme barın BİTİŞİNDEN sonra bir satır üretmiş
 *                  ⇔  bar.time + tfMs <= serinin son satırının zamanı
 *
 * Son satır ne olursa olsun (kotasyon satırı, forming bar, seans-sonu hayalet
 * satırı) veri ucudur; ondan önce BİTEN her bar kapanmıştır. Hiza/faz varsayımı
 * yok → 5m'den 1d'ye, futures/FX/kripto ve 4h/8h resample'ında aynı şekilde
 * doğru çalışır.
 *
 * DUVAR SAATİ BİLEREK KULLANILMAZ: GC=F (COMEX) akışı ~10 dk gecikmelidir
 * (ölçüldü: 10.0-10.2 dk). Date.now() ile "bitti" demek, Yahoo daha doldurmamış
 * barı kapalı sayıp aynı repaint hatasını geri getirir.
 *
 * GARANTİ: sonuç HER ZAMAN slice(0,-1)'in alt kümesidir (son satır koşulsuz
 * düşer) → hiçbir bot bu değişiklikle DAHA ÖNCE GÖRMEDİĞİ bir bar görmez;
 * yalnız forming barlar eksilir. Seans kapalıyken (ardından satır gelmeyen) en
 * taze kapalı bar da bir tur beklemiş olur — slice(0,-1) zaten öyle davranıyordu.
 *
 * time saniye veya ms olabilir (fetchCandles saniye verir); kıyas ms'te yapılır,
 * DÖNEN satırlar orijinaldir (birim değişmez).
 */
function closedBars(candles, tfMs) {
  if (!Array.isArray(candles) || !candles.length || !(tfMs > 0)) return [];
  const ms = (t) => (Number.isFinite(t) ? (t < 1e12 ? t * 1000 : t) : NaN);
  const out = candles.slice();
  const dataEnd = ms(out[out.length - 1] && out[out.length - 1].time);
  if (!Number.isFinite(dataEnd)) return [];
  // NaN zamanlı satırlar da düşer (koşul olumsuzlanarak yazıldı — bilinçli).
  while (out.length && !(ms(out[out.length - 1].time) + tfMs <= dataEnd)) out.pop();
  return out;
}

async function yahooFetch(yahooSymbol, params) {
  const res = await axios.get(`${YAHOO_CHART}/${encodeURIComponent(yahooSymbol)}`, {
    params, timeout: 15000, headers: { 'User-Agent': UA },
  });
  return parseChart(res.data);
}

/**
 * Güncel mumlar (oldest→newest). yahooSymbol Yahoo formatında tam sembol.
 * Yetersiz/erişilemez → null.
 */
async function fetchCandles(yahooSymbol, tf, limit = 300) {
  const key = `${yahooSymbol}:${tf}:${limit}`;
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && now - hit.t < (TTL_MS[tf] || 60 * 1000)) return hit.data;
  try {
    let candles;
    if (tf === '4h' || tf === '8h') {
      const hrs = tf === '4h' ? 4 : 8;
      candles = resampleHours(await yahooFetch(yahooSymbol, { interval: '1h', range: YH_RANGE[tf] }), hrs);
    } else {
      const yi = YH_INTERVAL[tf];
      if (!yi) return null;
      candles = await yahooFetch(yahooSymbol, { interval: yi, range: YH_RANGE[tf] || '5d' });
    }
    const data = candles && candles.length ? candles.slice(-limit) : null;
    cache.set(key, { data, t: now });
    return data;
  } catch (e) {
    // Hata anında bayat cache'i (varsa) döndür — kısa kesintilerde sinyal düşmesin
    if (hit) return hit.data;
    cache.set(key, { data: null, t: now });
    return null;
  }
}

module.exports = { fetchCandles, resampleHours, closedBars, TF_MS, YH_INTERVAL, YH_RANGE };
