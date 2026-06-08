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
// Politika faizi canlı kaynağı — TCMB 1H repo değişiklik geçmişi tablosu
const GLOBAL_RATES_TR_URL = 'https://www.global-rates.com/en/interest-rates/central-banks/5/turkish-tcmb-repo-rate/';

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
 * TCMB politika faizi (1 hafta vadeli repo) + gecelik borç verme/alma.
 *
 * Tasarım (2026-06-08 yeniden yazıldı — eski hardcoded değer ~1 yıl bayatlamış,
 * %46 gösteriyordu; gerçeği %37):
 *  1) Oran CANLI kaynaktan çekilir (global-rates.com, TCMB repo değişiklik
 *     geçmişi) ve sıkı doğrulamadan geçer. Kaynak çökerse baz değere düşer.
 *  2) Karar/sonraki toplantı tarihleri PPK takviminden OTOMATİK hesaplanır —
 *     elle tarih güncellemesi yok, "sonraki toplantı geçmişte" hatası biter.
 *  3) Canlı teyit yoksa ve baz değeri teyit eden toplantıdan sonra yeni bir PPK
 *     yapılmışsa `stale:true` döner; UI bunu "teyit bekleniyor" gösterir,
 *     yanlış değeri kesin gibi sunmaz.
 *
 * Acil elle müdahale: env TCMB_POLICY_RATE / TCMB_ON_LENDING / TCMB_ON_BORROWING.
 */

// TCMB resmi PPK toplantı takvimi (2026 tam + 2027 ilk yarı).
// Liste tükenmeden yeni dönemin tarihleri eklenmeli — cron buna uyarı verir.
const PPK_MEETINGS = [
  '2026-01-22', '2026-03-12', '2026-04-22', '2026-06-11',
  '2026-07-23', '2026-09-10', '2026-10-22', '2026-12-10',
  '2027-01-21', '2027-03-18', '2027-04-22', '2027-06-10',
];

// Bu seviyeyi teyit eden son PPK kararı — canlı kaynak çökerse yedek.
// Faiz 22 Oca 2026'da %37'ye indi; 12 Mar ve 22 Nis toplantıları sabit tuttu.
const POLICY_BASELINE = {
  policyRate: 37.00,          // 1 hafta vadeli repo
  overnightLending: 40.00,   // gecelik borç verme  (+300 bp)
  overnightBorrowing: 35.50, // gecelik borç alma   (−150 bp)
  asOfDate: '2026-04-22',    // bu oranı teyit eden son PPK kararı
};

function pickMeetingDates() {
  const today = new Date().toISOString().slice(0, 10);
  let last = null, next = null;
  for (const d of PPK_MEETINGS) {
    if (d <= today) last = d;
    else if (next == null) next = d;
  }
  return { last, next, today };
}

/**
 * global-rates.com'dan güncel 1H repo oranını çeker (değişiklik geçmişi
 * tablosunun ilk satırı = güncel oran). 6 saat cache. Başarısızlıkta null
 * döner ve cache'lenmez (sonraki istek tekrar dener).
 * @returns {Promise<{rate:number, changeDate:string|null, source:string}|null>}
 */
async function fetchLivePolicyRate() {
  const cached = getCache('tcmb-policy-live');
  if (cached) return cached;
  try {
    const res = await axios.get(GLOBAL_RATES_TR_URL, {
      headers: { 'User-Agent': USER_AGENT, 'Accept': 'text/html' },
      timeout: 12000,
      validateStatus: () => true,
    });
    if (res.status >= 400 || typeof res.data !== 'string') throw new Error(`HTTP ${res.status}`);
    const $ = cheerio.load(res.data);
    // Başlığı "Date | Rate" olan tabloyu bul (oran değişiklik geçmişi)
    const table = $('table').filter((_, t) => {
      const hdr = $(t).find('tr').first().find('th,td')
        .map((_, c) => $(c).text().trim().toLowerCase()).get();
      return hdr.includes('date') && hdr.includes('rate');
    }).first();
    if (!table.length) throw new Error('oran tablosu bulunamadı');

    // İlk geçerli (tarih + oran) satır = en son değişiklik = güncel oran
    let rate = null, changeDate = null;
    table.find('tr').each((_, tr) => {
      if (rate != null) return;
      const tds = $(tr).find('td');
      if (tds.length < 2) return;
      const d = $(tds.get(0)).text().trim();
      const r = $(tds.get(1)).text().trim();
      const dm = d.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);          // MM-DD-YYYY
      const rv = parseFloat(r.replace('%', '').replace(',', '.').trim());
      if (dm && Number.isFinite(rv)) {
        rate = rv;
        changeDate = `${dm[3]}-${dm[1].padStart(2, '0')}-${dm[2].padStart(2, '0')}`;
      }
    });

    // Sıkı doğrulama: Türkiye faiz oranı makul bandda olmalı (yanlış hücre koruması)
    if (!Number.isFinite(rate) || rate < 5 || rate > 60) {
      throw new Error(`mantıksız oran: ${rate}`);
    }
    const out = { rate: +rate.toFixed(2), changeDate, source: 'global-rates.com' };
    setCache('tcmb-policy-live', out, 6 * 60 * 60 * 1000); // 6 saat
    return out;
  } catch (err) {
    console.warn('[borsapy] Canlı politika faizi alınamadı:', err.message);
    return null;
  }
}

async function getTcmbPolicyRate() {
  const { last, next } = pickMeetingDates();

  let policyRate = POLICY_BASELINE.policyRate;
  let overnightLending = POLICY_BASELINE.overnightLending;
  let overnightBorrowing = POLICY_BASELINE.overnightBorrowing;
  let asOfDate = last || POLICY_BASELINE.asOfDate;
  let source = 'TCMB PPK takvimi (baz değer)';
  let liveConfirmed = false;
  let corridorEstimated = false;

  const envRate = parseFloat(process.env.TCMB_POLICY_RATE);
  if (Number.isFinite(envRate)) {
    // Acil elle müdahale — her şeyi ezer, teyitli sayılır
    policyRate = envRate;
    overnightLending = parseFloat(process.env.TCMB_ON_LENDING) || overnightLending;
    overnightBorrowing = parseFloat(process.env.TCMB_ON_BORROWING) || overnightBorrowing;
    asOfDate = process.env.TCMB_AS_OF || asOfDate;
    source = 'env override';
    liveConfirmed = true;
  } else {
    const live = await fetchLivePolicyRate();
    if (live && Number.isFinite(live.rate)) {
      liveConfirmed = true;
      source = `canlı · ${live.source}`;
      if (Math.abs(live.rate - POLICY_BASELINE.policyRate) > 0.001) {
        // Oran baz değerden sapmış (kod henüz güncellenmemiş) → canlı oranı kullan,
        // gecelik koridoru son bilinen ofsetlerle tahmin et
        const lendOff = POLICY_BASELINE.overnightLending - POLICY_BASELINE.policyRate;   // +3.00
        const borrowOff = POLICY_BASELINE.overnightBorrowing - POLICY_BASELINE.policyRate; // -1.50
        policyRate = live.rate;
        overnightLending = +(live.rate + lendOff).toFixed(2);
        overnightBorrowing = +(live.rate + borrowOff).toFixed(2);
        asOfDate = live.changeDate || asOfDate;
        corridorEstimated = true;
      }
    }
  }

  // Bayatlık: canlı teyit yokken baz değeri teyit eden toplantıdan sonra yeni
  // bir PPK yapılmışsa (ya da takvim tükenmişse) gösterdiğimiz değer eski olabilir.
  const meetingPassedSinceBaseline = (!!last && last > POLICY_BASELINE.asOfDate) || next == null;
  const stale = !liveConfirmed && meetingPassedSinceBaseline;

  let note;
  if (stale) {
    note = `⚠️ ${last || 'son'} PPK kararından sonra güncel oran teyit edilemedi. Gösterilen, son bilinen orandır — TCMB'den doğrulayın.`;
  } else if (corridorEstimated) {
    note = 'Politika faizi canlı kaynaktan güncellendi. Gecelik koridor son resmi ofsetle tahmin edildi.';
  } else if (liveConfirmed) {
    note = 'TCMB Para Politikası Kurulu politika faizi — canlı teyitli.';
  } else {
    note = 'TCMB Para Politikası Kurulu politika faizi.';
  }

  return {
    policyRate,
    overnightLending,
    overnightBorrowing,
    asOfDate,
    nextMeeting: process.env.TCMB_NEXT || next,
    stale,
    liveConfirmed,
    corridorEstimated,
    note,
    source,
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

      // canlidoviz link metnine güncelleme saati/tarihi ekliyor
      // ("DESTEKBANK 22:29:20", "ZİRAAT BANKASI 20/05/26") → sondaki bu
      // artıkları temizle, yoksa banka adı rezil görünür
      const bankName = $(el).text()
        .replace(/\s+/g, ' ')
        .replace(/(?:\s+(?:\d{1,2}:\d{2}(?::\d{2})?|\d{1,2}\/\d{1,2}\/\d{2,4}))+\s*$/g, '')
        .trim();
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
              name: bankName.slice(0, 60),
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

// ─────────────────────────────────────────────────────────────────────
// VIOP — İş Yatırım Vadeli İşlemler ve Opsiyon Pazarı
// borsapy/_providers/viop.py port'u — accordion HTML scrape
// ─────────────────────────────────────────────────────────────────────

const VIOP_URL = 'https://www.isyatirim.com.tr/tr-tr/analiz/Sayfalar/viop.aspx';

const VIOP_SECTIONS = {
  stock_futures:     'Pay Vadeli İşlem Ana Pazarı',
  index_futures:     'Endeks Vadeli İşlem Ana Pazarı',
  currency_futures:  'Döviz Vadeli İşlem Ana Pazarı',
  commodity_futures: 'Kıymetli Madenler Vadeli İşlem Ana Pazarı',
  stock_options:     'Pay Opsiyon Ana Pazarı',
  index_options:     'Endeks Opsiyon Ana Pazarı',
};

function parseTrNumber(s) {
  if (s == null) return null;
  const str = String(s).trim().replace(/\./g, '').replace(',', '.').replace(/[^\d.\-]/g, '');
  const n = parseFloat(str);
  return Number.isFinite(n) ? n : null;
}

async function getViopContracts() {
  const cached = getCache('viop-all');
  if (cached) return cached;

  try {
    const res = await axios.get(VIOP_URL, {
      headers: { 'User-Agent': USER_AGENT, 'Accept': 'text/html' },
      timeout: 20000,
    });
    const $ = cheerio.load(res.data);

    const result = {};
    for (const [key, title] of Object.entries(VIOP_SECTIONS)) {
      result[key] = [];
      // accordion-title <a> içinde başlık var
      const $titleEl = $('.accordion-title a, .accordion-title').filter((_, el) => $(el).text().trim() === title).first();
      const $container = $titleEl.closest('.accordion-item');
      const $table = $container.find('table').first();
      if (!$table.length) continue;

      $table.find('tbody tr').each((_, tr) => {
        const $tr = $(tr);
        const tds = $tr.find('td');
        if (tds.length < 5) return;

        // İlk td: title="F_CIMSA0626 | CIMSA Haziran 2026 Vadeli", text=display name
        const titleAttr = ($(tds[0]).attr('title') || '').trim();
        const [code, displayName] = titleAttr.includes('|')
          ? titleAttr.split('|').map(s => s.trim())
          : [titleAttr, $(tds[0]).text().trim()];

        if (!code) return;

        // Header sırası: Kontrat | Son Fiyat | Değişim (%) | Değişim (TL) | Hacim (TL) | Hacim (Adet)
        result[key].push({
          code,
          name: displayName || $(tds[0]).text().trim(),
          price:      parseTrNumber($(tds[1]).text()),
          changePct:  parseTrNumber($(tds[2]).text()),
          change:     parseTrNumber($(tds[3]).text()),
          volumeTl:   parseTrNumber($(tds[4]).text()),
          volumeQty:  parseTrNumber($(tds[5]).text()),
        });
      });
    }

    const out = {
      ...result,
      timestamp: new Date().toISOString(),
      source: 'İş Yatırım VİOP (15dk gecikmeli)',
    };
    setCache('viop-all', out, 10 * 60 * 1000); // 10dk
    return out;
  } catch (err) {
    console.warn('[borsapy] VIOP error:', err.message);
    return {
      stock_futures: [], index_futures: [], currency_futures: [], commodity_futures: [],
      stock_options: [], index_options: [],
      error: err.message,
    };
  }
}

async function getViopByCategory(category) {
  const all = await getViopContracts();
  if (!all || all.error) return all;
  return {
    category,
    contracts: all[category] || [],
    timestamp: all.timestamp,
    source: all.source,
  };
}

async function searchViopBySymbol(symbol) {
  const all = await getViopContracts();
  if (!all || all.error) return { symbol, matches: [], error: all?.error };
  const q = String(symbol || '').toUpperCase();
  const matches = [];
  for (const [cat, list] of Object.entries(all)) {
    if (!Array.isArray(list)) continue;
    list.forEach(c => {
      if ((c.code || '').toUpperCase().includes(q) || (c.name || '').toUpperCase().includes(q)) {
        matches.push({ category: cat, ...c });
      }
    });
  }
  return { symbol: q, matches, timestamp: all.timestamp };
}

// ─────────────────────────────────────────────────────────────────────
// EVDS — TCMB Elektronik Veri Dağıtım Sistemi
// Catalog endpoint'leri key gerektirmez (kategoriler/seri listesi/search)
// ─────────────────────────────────────────────────────────────────────

const EVDS_BASE = 'https://evds3.tcmb.gov.tr/igmevdsms-dis';

async function getEvdsCategories() {
  const cached = getCache('evds-categories');
  if (cached) return cached;
  try {
    const res = await axios.get(`${EVDS_BASE}/categories/withDatagroups/type=json`, {
      headers: { 'User-Agent': USER_AGENT, 'Accept': 'application/json' },
      timeout: 15000,
    });
    const data = res.data;
    setCache('evds-categories', data, 6 * 60 * 60 * 1000); // 6 saat
    return data;
  } catch (err) {
    console.warn('[borsapy] EVDS categories error:', err.message);
    return { error: err.message };
  }
}

async function getEvdsSeriesList(datagroupCode) {
  const code = String(datagroupCode || '').trim();
  if (!code) throw new Error('datagroup code zorunlu');
  const cacheKey = `evds-series:${code}`;
  const cached = getCache(cacheKey);
  if (cached) return cached;
  try {
    const url = `${EVDS_BASE}/serieList/fe/type=json&code=${encodeURIComponent(code)}`;
    const res = await axios.get(url, {
      headers: { 'User-Agent': USER_AGENT, 'Accept': 'application/json' },
      timeout: 15000,
    });
    setCache(cacheKey, res.data, 6 * 60 * 60 * 1000);
    return res.data;
  } catch (err) {
    console.warn(`[borsapy] EVDS series list error (${code}):`, err.message);
    return { error: err.message };
  }
}

async function searchEvds(term) {
  const q = String(term || '').trim();
  if (!q) return { results: [] };
  const cacheKey = `evds-search:${q.toLowerCase()}`;
  const cached = getCache(cacheKey);
  if (cached) return cached;
  try {
    const res = await axios.get(`${EVDS_BASE}/searchResults?searchVal=${encodeURIComponent(q)}`, {
      headers: { 'User-Agent': USER_AGENT, 'Accept': 'application/json' },
      timeout: 15000,
    });
    setCache(cacheKey, res.data, 30 * 60 * 1000);
    return res.data;
  } catch (err) {
    console.warn(`[borsapy] EVDS search error (${q}):`, err.message);
    return { error: err.message };
  }
}

/**
 * EVDS series değerleri — KEY GEREKTİRİR (process.env.EVDS_KEY).
 * Key yoksa hata mesajı döner.
 */
async function getEvdsSeriesData(seriesCode, period = '1y') {
  const key = process.env.EVDS_KEY;
  if (!key) {
    return { error: 'EVDS_KEY tanımlı değil. evds3.tcmb.gov.tr/serviceweb üzerinden ücretsiz key alın ve env değişkenine ekleyin.' };
  }
  const codes = Array.isArray(seriesCode) ? seriesCode.join('-') : String(seriesCode);
  // Tarih aralığı
  const end = new Date();
  const start = new Date(end);
  const m = String(period).match(/(\d+)([dmy])/i);
  if (m) {
    const num = Number(m[1]);
    const unit = m[2].toLowerCase();
    if (unit === 'd') start.setDate(end.getDate() - num);
    else if (unit === 'm') start.setMonth(end.getMonth() - num);
    else start.setFullYear(end.getFullYear() - num);
  } else {
    start.setFullYear(end.getFullYear() - 1);
  }
  const fmt = (d) => `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
  const url = `https://evds2.tcmb.gov.tr/service/evds/series=${encodeURIComponent(codes)}&startDate=${fmt(start)}&endDate=${fmt(end)}&type=json&key=${encodeURIComponent(key)}`;
  try {
    const res = await axios.get(url, {
      headers: { 'User-Agent': USER_AGENT, 'Accept': 'application/json' },
      timeout: 20000,
    });
    return res.data;
  } catch (err) {
    console.warn('[borsapy] EVDS series data error:', err.message);
    return { error: err.message };
  }
}

// ─────────────────────────────────────────────────────────────────────
// Eurobond — Türkiye'nin USD/EUR cinsi eurobond getirileri
// Ziraat API yerine Yahoo Finance'den proxy (TUR tickers)
// ─────────────────────────────────────────────────────────────────────

async function getEurobondYields() {
  const cached = getCache('eurobond-yields');
  if (cached) return cached;
  // Türkiye eurobondlarının yaklaşık getirileri için kullanılabilir göstergeler:
  // ABD 10Y + Türk CDS = Eurobond getirisi yaklaşıkı. Doğrudan tikerlar yok.
  // Çözüm: temel ticker'ları topla.
  const symbols = [
    { ticker: '^TNX',  label: 'ABD 10Y Tahvil Getirisi (referans)' },
    { ticker: '^FVX',  label: 'ABD 5Y Tahvil Getirisi (referans)' },
    { ticker: 'TUR',   label: 'iShares MSCI Turkey ETF (USD)' },
  ];
  try {
    const YF = require('yahoo-finance2').default;
    const yahooFinance = typeof YF === 'function' ? new YF({ suppressNotices: ['yahooSurvey'] }) : YF;
    const results = await Promise.all(symbols.map(async (s) => {
      try {
        const q = await yahooFinance.quote(s.ticker);
        return {
          ticker: s.ticker,
          label: s.label,
          price: q?.regularMarketPrice ?? null,
          change: q?.regularMarketChange ?? null,
          changePct: q?.regularMarketChangePercent ?? null,
          currency: q?.currency || 'USD',
        };
      } catch (e) {
        return { ticker: s.ticker, label: s.label, error: e.message };
      }
    }));

    const out = {
      indicators: results,
      note: 'Türkiye eurobond getirileri için doğrudan ücretsiz endpoint yok. Yukarıdaki göstergeler proxy olarak kullanılabilir (ABD tahvil getirileri + Türkiye ETF\'i).',
      timestamp: new Date().toISOString(),
    };
    setCache('eurobond-yields', out, 60 * 60 * 1000); // 1 saat
    return out;
  } catch (err) {
    console.warn('[borsapy] Eurobond error:', err.message);
    return { indicators: [], error: err.message };
  }
}

// ─────────────────────────────────────────────────────────────────────
// Teknik Scanner — Yahoo Finance verisi üzerinde RSI/MA tabanlı tarama
// Borsapy'nin bp.scan() port'u — basit ama etkili
// ─────────────────────────────────────────────────────────────────────

function calcRSI(closes, period = 14) {
  if (closes.length < period + 1) return null;
  let gains = 0, losses = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const change = closes[i] - closes[i - 1];
    if (change > 0) gains += change;
    else losses -= change;
  }
  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

function calcSMA(closes, period) {
  if (closes.length < period) return null;
  const slice = closes.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

/**
 * BIST taraması — kriter tabanlı.
 * @param {Object} criteria { rsiBelow, rsiAbove, priceAboveSma, priceBelowSma, volumeMin, changeMin, changeMax }
 * @param {string} universe 'bist30' | 'bist100' | 'all'
 */
async function scanStocks(criteria = {}, universe = 'bist30') {
  const liveDataService = require('./liveDataService');
  const { bist30Stocks, bist100Stocks, allBistStocks } = require('../data/allBistStocks');

  const pool = universe === 'all' ? allBistStocks
    : universe === 'bist100' ? bist100Stocks
    : bist30Stocks;

  // Tüm evreni al (slice yok). 'all' ~510 hisse, 'bist100' ~100, 'bist30' 30.
  const symbols = (Array.isArray(pool) ? pool : [])
    .map(s => typeof s === 'string' ? s : s.symbol || s.code)
    .filter(Boolean);

  // Teknik filtre var mı? (RSI/SMA → historical fetch gerektirir)
  const needsHistorical =
    criteria.rsiBelow != null || criteria.rsiAbove != null ||
    criteria.priceAboveSma != null || criteria.priceBelowSma != null ||
    criteria.smaCross != null;

  // ── Faz 1: Canlı quote (price/changePct/volume) — 15'li paralel ──
  // liveDataService ham Yahoo chart endpoint'ini kullanıyor (Render'da çalışır).
  // yahoo-finance2.quote() crumb 429 alır, o yüzden kullanmıyoruz.
  const quotes = new Map(); // symbol -> { price, changePct, volume }
  for (let i = 0; i < symbols.length; i += 15) {
    const batch = symbols.slice(i, i + 15);
    await Promise.all(batch.map(async (sym) => {
      try {
        const q = await liveDataService.fetchYahooData(sym);
        if (q && q.price != null) {
          quotes.set(sym, {
            price: q.price,
            changePct: q.changePercent,
            volume: q.volume || 0,
          });
        }
      } catch { /* sembol atla */ }
    }));
  }

  // ── Faz 2: Ucuz filtre (changePct / volume) — quote'tan, ek fetch yok ──
  const cheapMatches = symbols.filter(sym => {
    const q = quotes.get(sym);
    if (!q) return false; // canlı quote alamadıysak ele
    if (criteria.changeMin != null && (q.changePct == null || q.changePct < Number(criteria.changeMin))) return false;
    if (criteria.changeMax != null && (q.changePct == null || q.changePct > Number(criteria.changeMax))) return false;
    if (criteria.volumeMin != null && q.volume < Number(criteria.volumeMin)) return false;
    return true;
  });

  // ── Faz 3: Teknik filtre gerekiyorsa historical fetch (sadece ucuz filtreyi geçenler) ──
  const matches = [];
  const errors = [];

  if (!needsHistorical) {
    // Sadece quote bazlı kriterler → direkt match
    for (const sym of cheapMatches) {
      const q = quotes.get(sym);
      matches.push({
        symbol: sym,
        price: q.price,
        changePct: q.changePct,
        rsi: null, sma20: null, sma50: null,
        volume: q.volume,
      });
    }
  } else {
    // 8'li paralel historical fetch (sadece ucuz filtreyi geçenler için)
    for (let i = 0; i < cheapMatches.length; i += 8) {
      const batch = cheapMatches.slice(i, i + 8);
      await Promise.all(batch.map(async (sym) => {
        try {
          const q = quotes.get(sym);
          // 6 ay (~125 günlük mum) → SMA50 + RSI14 için rahat yeter
          const hist = await liveDataService.fetchHistoricalData(sym, '6mo', '1d');
          if (!Array.isArray(hist) || hist.length < 20) return;
          const closes = hist.map(h => h.close).filter(Number.isFinite);
          if (closes.length < 20) return;

          const rsi = calcRSI(closes, 14);
          const sma20 = calcSMA(closes, 20);
          const sma50 = calcSMA(closes, 50);
          const last = q.price; // canlı fiyatı kullan, historical kapanış değil

          let passes = true;
          if (criteria.rsiBelow != null && (rsi == null || rsi >= criteria.rsiBelow)) passes = false;
          if (criteria.rsiAbove != null && (rsi == null || rsi <= criteria.rsiAbove)) passes = false;
          if (criteria.priceAboveSma === 20 && (sma20 == null || last <= sma20)) passes = false;
          if (criteria.priceAboveSma === 50 && (sma50 == null || last <= sma50)) passes = false;
          if (criteria.priceBelowSma === 20 && (sma20 == null || last >= sma20)) passes = false;
          if (criteria.priceBelowSma === 50 && (sma50 == null || last >= sma50)) passes = false;
          if (criteria.smaCross === 'golden' && (sma20 == null || sma50 == null || sma20 <= sma50)) passes = false;
          if (criteria.smaCross === 'death' && (sma20 == null || sma50 == null || sma20 >= sma50)) passes = false;

          if (passes) {
            matches.push({
              symbol: sym, price: last, changePct: q.changePct,
              rsi: rsi != null ? +rsi.toFixed(2) : null,
              sma20: sma20 != null ? +sma20.toFixed(2) : null,
              sma50: sma50 != null ? +sma50.toFixed(2) : null,
              volume: q.volume,
            });
          }
        } catch (e) {
          errors.push({ symbol: sym, error: e.message });
        }
      }));
    }
  }

  matches.sort((a, b) => (b.changePct || 0) - (a.changePct || 0));
  return {
    criteria, universe,
    matches,
    count: matches.length,
    scanned: symbols.length,
    quoted: quotes.size, // kaç sembol için canlı quote alındı
    errors: errors.slice(0, 5),
    timestamp: new Date().toISOString(),
  };
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
  // VIOP
  getViopContracts,
  getViopByCategory,
  searchViopBySymbol,
  VIOP_SECTIONS,
  // EVDS
  getEvdsCategories,
  getEvdsSeriesList,
  searchEvds,
  getEvdsSeriesData,
  // Eurobond
  getEurobondYields,
  // Scanner
  scanStocks,
};
