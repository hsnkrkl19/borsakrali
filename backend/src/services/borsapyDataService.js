/**
 * Borsapy Data Service
 * ----------------------
 * github.com/saidsurucu/borsapy esin alınarak Node.js'e taşındı.
 * BIST piyasası dışındaki Türk yatırımcı için kritik veri kaynaklarını
 * tek çatı altında toplar:
 *   - TEFAS yatırım/emeklilik fonları
 *   - TCMB enflasyon (TÜFE/ÜFE) + enflasyon hesaplayıcı
 *   - Bono faizleri (2Y/5Y/10Y)
 *   - Banka döviz kurları karşılaştırması (canlidoviz.com)
 *
 * Tüm endpoint'ler ücretsiz ve key gerektirmez. Cache süreleri kaynak
 * güncelleme frekansına göre seçildi (enflasyon aylık, fon günlük,
 * banka kurları 15dk, tahvil 1 saat).
 */

const axios = require('axios');
const cheerio = require('cheerio');

const TEFAS_BASE = 'https://www.tefas.gov.tr/api/funds';
const TCMB_CALC_URL = 'https://appg.tcmb.gov.tr/KIMENFH/enflasyon/hesapla';

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

// Basit TTL cache
const cache = new Map();
const setCache = (key, value, ttlMs) => {
  cache.set(key, { value, expires: Date.now() + ttlMs });
};
const getCache = (key) => {
  const entry = cache.get(key);
  if (!entry) return null;
  if (entry.expires < Date.now()) {
    cache.delete(key);
    return null;
  }
  return entry.value;
};

// ─────────────────────────────────────────────────────────────────────
// TEFAS — Yatırım & Emeklilik Fonları
// ─────────────────────────────────────────────────────────────────────

async function tefasPost(path, body) {
  const res = await axios.post(`${TEFAS_BASE}/${path}`, body, {
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': USER_AGENT,
      'Accept': 'application/json',
      'Origin': 'https://www.tefas.gov.tr',
      'Referer': 'https://www.tefas.gov.tr/',
    },
    timeout: 15000,
  });
  return res.data;
}

async function searchTefasFunds(query) {
  const key = `tefas-search:${(query || '').toLowerCase()}`;
  const cached = getCache(key);
  if (cached) return cached;

  try {
    const data = await tefasPost('fonUnvanAra', { aranen: String(query || '').trim() });
    const list = Array.isArray(data?.resultList) ? data.resultList : [];
    const mapped = list.slice(0, 80).map((row) => ({
      code: row.fonKodu || row.FONKODU || row.kod,
      name: row.fonUnvan || row.FONUNVAN || row.unvan,
      type: row.fonTipi || row.FONTIPI || row.fonKategori || row.fonTuru || null,
    })).filter(f => f.code);
    setCache(key, mapped, 30 * 60 * 1000);
    return mapped;
  } catch (err) {
    console.warn('[borsapy] TEFAS search error:', err.message);
    return [];
  }
}

async function getTefasFundDetail(code) {
  const fonKodu = String(code || '').toUpperCase().trim();
  if (!fonKodu) throw new Error('Fon kodu zorunlu');

  const key = `tefas-detail:${fonKodu}`;
  const cached = getCache(key);
  if (cached) return cached;

  try {
    const [info, profile] = await Promise.all([
      tefasPost('fonBilgiGetir', { fonKodu }).catch(() => null),
      tefasPost('fonProfilBilgiGetir', { fonKodu, dil: 'TR' }).catch(() => null),
    ]);

    const infoRow = info?.resultList?.[0] || info?.result || null;
    const profileRow = profile?.resultList?.[0] || profile?.result || null;

    if (!infoRow && !profileRow) {
      throw new Error('Fon bulunamadı');
    }

    const pick = (...keys) => {
      for (const k of keys) {
        const v = infoRow?.[k] ?? profileRow?.[k];
        if (v != null && v !== '') return v;
      }
      return null;
    };

    const result = {
      code: fonKodu,
      name: pick('fonUnvan', 'FONUNVAN'),
      type: pick('fonTipi', 'FONTIPI', 'fonTuru'),
      isin: pick('isin', 'ISIN'),
      category: pick('fonKategori', 'KATEGORI', 'kategori'),
      categoryRank: pick('kategoriDerece'),
      categoryFundCount: pick('kategoriFonSay'),
      riskLevel: pick('riskDegeri', 'RISKDEGERI'),
      managementFee: pick('yonetimUcreti', 'YONETIMUCRETI'),
      price: pick('sonFiyat', 'FIYAT', 'SONFIYAT'),
      date: pick('tarih', 'TARIH', 'sonFiyatTarih', 'SONFIYATTARIH'),
      portfolioSize: pick('portBuyukluk', 'PORTFOYBUYUKLUGU', 'FONTOPLAMDEGER'),
      investorCount: pick('yatirimciSayi', 'YATIRIMCISAYISI'),
      dailyReturn: pick('gunlukGetiri', 'GUNLUKGETIRI'),
      marketShare: pick('pazarPayi'),
      shareCount: pick('payAdet'),
      raw: { info: infoRow, profile: profileRow },
    };

    setCache(key, result, 60 * 60 * 1000);
    return result;
  } catch (err) {
    console.warn(`[borsapy] TEFAS detail error (${fonKodu}):`, err.message);
    throw err;
  }
}

async function getTefasFundHistory(code, periodMonths = 12) {
  const fonKodu = String(code || '').toUpperCase().trim();
  if (!fonKodu) throw new Error('Fon kodu zorunlu');

  // TEFAS period kodları: 1=1ay, 3=3ay, 6=6ay, 12=1yıl, 36=3yıl, 60=5yıl, 13=ytd
  const allowed = [1, 3, 6, 12, 36, 60, 13];
  const periyod = allowed.includes(Number(periodMonths)) ? Number(periodMonths) : 12;

  const key = `tefas-history:${fonKodu}:${periyod}`;
  const cached = getCache(key);
  if (cached) return cached;

  try {
    const data = await tefasPost('fonFiyatBilgiGetir', { fonKodu, dil: 'TR', periyod });
    const list = Array.isArray(data?.resultList) ? data.resultList : [];
    const series = list.map((row) => ({
      date: row.TARIH || row.tarih,
      price: parseFloat(row.FIYAT ?? row.fiyat ?? 0),
    })).filter(p => p.date && Number.isFinite(p.price));

    setCache(key, series, 12 * 60 * 60 * 1000);
    return series;
  } catch (err) {
    console.warn(`[borsapy] TEFAS history error (${fonKodu}):`, err.message);
    return [];
  }
}

// ─────────────────────────────────────────────────────────────────────
// TCMB — Enflasyon hesaplayıcı + son veriler
// ─────────────────────────────────────────────────────────────────────

async function calculateInflation(amount, fromYear, fromMonth, toYear, toMonth) {
  // TCMB API string param ister + alan adları: baslangicYil/Ay, bitisYil/Ay, malSepeti
  const body = {
    baslangicYil: String(Number(fromYear)),
    baslangicAy:  String(Number(fromMonth)),
    bitisYil:     String(Number(toYear)),
    bitisAy:      String(Number(toMonth)),
    malSepeti:    String(Number(amount) || 100),
  };
  try {
    const res = await axios.post(TCMB_CALC_URL, body, {
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': USER_AGENT,
        'Accept': 'application/json',
        'Origin': 'https://www.tcmb.gov.tr',
        'Referer': 'https://www.tcmb.gov.tr/',
      },
      timeout: 15000,
    });
    const data = res.data || {};
    // TCMB yanıtı: { yeniSepetDeger: "78,706.91", toplamDegisim: "687.07", ortalamaYillikEnflasyon: "41.72", ilkYilTufe, sonYilTufe }
    // Değerler en-US format string ("78,706.91") — virgül binlik ayraç, nokta ondalık
    const parseTr = (v) => {
      if (v == null) return null;
      if (typeof v === 'number') return v;
      const cleaned = String(v).replace(/,/g, '');
      const n = parseFloat(cleaned);
      return Number.isFinite(n) ? n : null;
    };
    const yeniSepet = parseTr(
      data.yeniSepetDeger ?? data.yeniSepetDegeri ?? data.yeniMalSepeti ?? data.guncelDeger
    );
    const initial = Number(amount);
    const totalChangePct = parseTr(data.toplamDegisim) ??
      (initial > 0 && yeniSepet != null ? ((yeniSepet - initial) / initial) * 100 : 0);
    return {
      initialValue: initial,
      finalValue: yeniSepet,
      totalChangePct,
      avgYearlyPct: parseTr(data.ortalamaYillikEnflasyon),
      fromYear: Number(fromYear),
      fromMonth: Number(fromMonth),
      toYear: Number(toYear),
      toMonth: Number(toMonth),
      raw: data,
    };
  } catch (err) {
    const status = err.response?.status;
    const detail = err.response?.data?.mesaj?.join(' ') || err.message;
    console.warn(`[borsapy] TCMB inflation calc error (HTTP ${status}):`, detail);
    throw new Error(`TCMB enflasyon hesaplayıcı yanıt vermedi (${status || 'network'})`);
  }
}

/**
 * doviz.com/tahvil sayfasını parse ederek 2Y, 5Y, 10Y bono faizlerini döner.
 * borsapy'nin Bond sınıfına eşdeğer.
 */
async function getBondYields() {
  const cached = getCache('bond-yields');
  if (cached) return cached;

  try {
    const res = await axios.get('https://www.doviz.com/tahvil', {
      headers: { 'User-Agent': USER_AGENT, 'Accept': 'text/html' },
      timeout: 15000,
    });
    const $ = cheerio.load(res.data);
    const yields = {};
    // doviz.com tablo yapısı:
    //   <a href="/tahvil/tr-2-yillik-tahvil" class="name">TR 2 Yıllık Tahvil Faizi</a>
    //   <td class="text-bold">44,24</td>
    // İlk td.text-bold faiz oranı, sonraki td'ler değişim/hacim.
    $('a.name[href*="/tahvil/tr-"]').each((_, a) => {
      const href = $(a).attr('href') || '';
      const m = href.match(/tr-(\d+)-yillik/i);
      if (!m) return;
      const tenor = `${m[1]}Y`;
      // Linkin parent <td>'sinden sonraki .text-bold td'yi bul
      const $row = $(a).closest('tr');
      const valTxt = $row.find('td.text-bold').first().text().trim().replace(',', '.');
      const val = parseFloat(valTxt);
      if (Number.isFinite(val) && val > 0 && val < 200) {
        yields[tenor] = val;
      }
    });

    const result = {
      ...yields,
      riskFreeRate: yields['10Y'] != null ? yields['10Y'] / 100 : null,
      source: 'doviz.com',
      timestamp: new Date().toISOString(),
    };
    setCache('bond-yields', result, 60 * 60 * 1000); // 1 saat
    return result;
  } catch (err) {
    console.warn('[borsapy] Bond yields error:', err.message);
    return { '2Y': null, '5Y': null, '10Y': null, riskFreeRate: null, error: err.message };
  }
}

/**
 * TCMB politika faizi.
 *
 * Not: TCMB resmi sayfası HTML scrape için uygun değil (JS render + WCM CMS).
 * doviz.com'da da net bir endpoint yok. Bu yüzden en son MPK kararını
 * burada manuel tutuyoruz. PPK kararı çıktığında bu blok güncellenir.
 * (Ayda 1 toplanır — env.TCMB_POLICY_RATE override desteklenir.)
 */
function getTcmbPolicyRate() {
  // Son MPK kararı — güncelle: https://www.tcmb.gov.tr/wps/wcm/connect/TR/TCMB+TR/Main+Menu/Para+Politikasi/PPK+Kararlari
  const HARDCODED = {
    policyRate: 46.00,           // 1 hafta vadeli repo
    overnightLending: 49.00,     // gecelik borç verme
    overnightBorrowing: 44.50,   // gecelik borç alma
    asOfDate: '2026-04-24',
    nextMeeting: '2026-05-29',
    note: 'TCMB Para Politikası Kurulu kararı — son güncellenen değer. PPK toplantısı sonrası güncellenir.',
  };
  return {
    policyRate: parseFloat(process.env.TCMB_POLICY_RATE) || HARDCODED.policyRate,
    overnightLending: parseFloat(process.env.TCMB_ON_LENDING) || HARDCODED.overnightLending,
    overnightBorrowing: parseFloat(process.env.TCMB_ON_BORROWING) || HARDCODED.overnightBorrowing,
    asOfDate: process.env.TCMB_AS_OF || HARDCODED.asOfDate,
    nextMeeting: process.env.TCMB_NEXT || HARDCODED.nextMeeting,
    note: HARDCODED.note,
    source: 'TCMB PPK (manuel güncellenir)',
  };
}

// ─────────────────────────────────────────────────────────────────────
// canlidoviz.com — Banka Döviz Kurları Karşılaştırması
// ─────────────────────────────────────────────────────────────────────

const CURRENCY_SLUGS = {
  USD: 'dolar',
  EUR: 'euro',
  GBP: 'ingiliz-sterlini',
  CHF: 'isvicre-frangi',
};

/**
 * Bir döviz için tüm bankaların alış/satış kurlarını döner.
 * @param {string} currency USD|EUR|GBP|CHF
 */
async function getBankRates(currency = 'USD') {
  const sym = String(currency || 'USD').toUpperCase();
  const slug = CURRENCY_SLUGS[sym] || CURRENCY_SLUGS.USD;
  const cacheKey = `bank-rates:${sym}`;
  const cached = getCache(cacheKey);
  if (cached) return cached;

  try {
    const res = await axios.get(`https://canlidoviz.com/doviz-kurlari/${slug}`, {
      headers: { 'User-Agent': USER_AGENT, 'Accept': 'text/html' },
      timeout: 15000,
      validateStatus: () => true,
    });
    if (res.status >= 400) throw new Error(`HTTP ${res.status}`);

    const $ = cheerio.load(res.data);
    const banks = [];

    // Tüm <a> linklerini tara, /doviz-kurlari/{bank-slug}/{currency-slug} pattern'i
    $(`a[href*="/doviz-kurlari/"]`).each((_, el) => {
      const href = $(el).attr('href') || '';
      const m = href.match(/\/doviz-kurlari\/([^/]+)\/([^/?#]+)/);
      if (!m) return;
      const bankSlug = m[1];
      const currSlug = m[2];
      if (currSlug !== slug) return;
      // Hariç tutulanlar (sayfa nav linkleri, başka döviz vb.)
      if (['dolar', 'euro', 'ingiliz-sterlini', 'isvicre-frangi'].includes(bankSlug)) return;

      const bankName = $(el).text().trim();
      if (!bankName) return;

      // En yakın <tr> içinden alış/satış al
      const $tr = $(el).closest('tr');
      const tds = $tr.find('td');
      if (tds.length < 2) return;

      const nums = [];
      tds.each((__, td) => {
        const raw = $(td).text().trim();
        // Yalnızca sayısal değerleri yakala
        const matches = raw.match(/[0-9]+[,.][0-9]+/g) || [];
        matches.forEach(n => nums.push(parseFloat(n.replace(',', '.'))));
      });

      if (nums.length >= 2) {
        // Genelde [Alış, Satış] sırasıyla gelir
        const [buy, sell] = nums.slice(0, 2);
        if (Number.isFinite(buy) && Number.isFinite(sell) && buy > 0 && sell > 0) {
          // Aynı bank slug zaten varsa atla
          if (!banks.find(b => b.slug === bankSlug)) {
            banks.push({
              slug: bankSlug,
              name: bankName.replace(/\s+/g, ' ').slice(0, 60),
              buy,
              sell,
              spread: +(sell - buy).toFixed(4),
              spreadPct: +(((sell - buy) / buy) * 100).toFixed(3),
            });
          }
        }
      }
    });

    // Spread'e göre sırala (en iyi: en düşük spread)
    banks.sort((a, b) => a.spreadPct - b.spreadPct);

    // Banka bakış açısı kullanıcı için ters:
    //   Kullanıcı dövizi BANKADAN ALIR → bankanın SATIŞ fiyatı önemli → EN DÜŞÜK satış kazandırır
    //   Kullanıcı dövizi BANKAYA SATAR → bankanın ALIŞ fiyatı önemli → EN YÜKSEK alış kazandırır
    const bestForBuying = banks.length
      ? banks.reduce((min, b) => (b.sell < min.sell ? b : min), banks[0])
      : null;
    const bestForSelling = banks.length
      ? banks.reduce((max, b) => (b.buy > max.buy ? b : max), banks[0])
      : null;
    const lowestSpread = banks.length ? banks[0] : null; // zaten spread'e göre sıralı

    const result = {
      currency: sym,
      banks,
      bestForBuying,   // dövizi almak isteyen için
      bestForSelling,  // dövizi satmak isteyen için
      lowestSpread,
      timestamp: new Date().toISOString(),
      source: 'canlidoviz.com',
    };

    setCache(cacheKey, result, 15 * 60 * 1000); // 15dk
    return result;
  } catch (err) {
    console.warn(`[borsapy] Bank rates error (${sym}):`, err.message);
    return { currency: sym, banks: [], error: err.message };
  }
}

module.exports = {
  // TEFAS
  searchTefasFunds,
  getTefasFundDetail,
  getTefasFundHistory,
  // TCMB
  calculateInflation,
  getTcmbPolicyRate,
  // Bond
  getBondYields,
  // Banks
  getBankRates,
  CURRENCY_SLUGS,
};
