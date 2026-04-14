/**
 * Telegram Bot - BORSA KRALI v4.2
 * Per.Tgm. Hasan KIRKIL
 *
 * OZELLIKLER:
 * - Hisse analizi
 * - Kullanici kayit sistemi
 * - 2FA dogrulama kodu
 * - Turkce karakter uyarisi
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

// Bot ayarlari
const BOT_TOKEN = '8374895928:AAGA830voVcjUoPlwzVUGoW1WRPrdru_Gv4';
const CHAT_ID = '2116638354';
const USERS_FILE = path.join(__dirname, 'src/data/users.json');
const SITE_URL = 'https://lowbred-tonsillary-lucille.ngrok-free.dev';
const SITE_URL_PROD = 'https://borsakrali.com.tr'; // Yayin sonrasi

const getTelegramUrl = (method) => `https://api.telegram.org/bot${BOT_TOKEN}/${method}`;

// Update ID
let lastUpdateId = 0;

// Islenen mesajlar
const processedMessages = new Set();

// Kayit adimlari (chat_id -> adim bilgisi)
const registrationSteps = new Map();

// Hisse cache
const stockCache = new Map();
const CACHE_TTL = 120000;

// Turkce karakterler
const turkishChars = /[şŞğĞüÜöÖçÇıİ]/;

// ==================== VERITABANI ====================

function readDB() {
  try {
    const data = fs.readFileSync(USERS_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    return { users: [], pendingVerifications: {}, telegramLinks: {} };
  }
}

function writeDB(data) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(data, null, 2), 'utf8');
}

function generateId() {
  return 'BK' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).substring(2, 6).toUpperCase();
}

function generateVerificationCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Turkce karakter kontrolu
function hasTurkishChars(text) {
  return turkishChars.test(text);
}

// Turkce karakterleri temizle
function cleanTurkishChars(text) {
  return text
    .replace(/ş/g, 's').replace(/Ş/g, 'S')
    .replace(/ğ/g, 'g').replace(/Ğ/g, 'G')
    .replace(/ü/g, 'u').replace(/Ü/g, 'U')
    .replace(/ö/g, 'o').replace(/Ö/g, 'O')
    .replace(/ç/g, 'c').replace(/Ç/g, 'C')
    .replace(/ı/g, 'i').replace(/İ/g, 'I');
}

// ==================== MESAJ ====================

async function sendMessage(chatId, text, options = {}) {
  try {
    await axios.post(getTelegramUrl('sendMessage'), {
      chat_id: chatId,
      text: text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
      ...options
    });
    return true;
  } catch (error) {
    console.error('Mesaj hatasi:', error.message);
    return false;
  }
}

// ==================== HISSE VERILERI ====================

async function getStockData(symbol) {
  const cached = stockCache.get(symbol);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }

  try {
    const yahooSymbol = `${symbol}.IS`;
    const response = await axios.get(
      `https://query1.finance.yahoo.com/v8/finance/chart/${yahooSymbol}`,
      {
        params: { interval: '1d', range: '1mo', includePrePost: false },
        headers: { 'User-Agent': 'Mozilla/5.0' },
        timeout: 15000
      }
    );

    if (!response.data?.chart?.result?.[0]) return null;

    const result = response.data.chart.result[0];
    const meta = result.meta;
    const quotes = result.indicators.quote[0];

    const currentPrice = meta.regularMarketPrice;
    const previousClose = meta.previousClose;

    if (!currentPrice || !previousClose) return null;

    const change = currentPrice - previousClose;
    const changePct = (change / previousClose) * 100;

    const closes = quotes.close.filter(c => c !== null);
    let rsi = 50;

    if (closes.length >= 15) {
      let gains = 0, losses = 0;
      for (let i = 1; i < Math.min(15, closes.length); i++) {
        const diff = closes[closes.length - i] - closes[closes.length - i - 1];
        if (diff > 0) gains += diff;
        else losses += Math.abs(diff);
      }
      const avgGain = gains / 14;
      const avgLoss = losses / 14;
      if (avgLoss > 0) {
        rsi = 100 - (100 / (1 + avgGain / avgLoss));
      } else if (avgGain > 0) {
        rsi = 100;
      }
    }

    const data = {
      symbol,
      name: meta.longName || meta.shortName || symbol,
      price: currentPrice,
      previousClose,
      change,
      changePct,
      high: meta.regularMarketDayHigh || currentPrice,
      low: meta.regularMarketDayLow || currentPrice,
      volume: meta.regularMarketVolume || 0,
      rsi: rsi.toFixed(1),
      marketState: meta.marketState || 'CLOSED'
    };

    stockCache.set(symbol, { data, timestamp: Date.now() });
    return data;
  } catch (error) {
    console.error(`[API] ${symbol} hatasi:`, error.message);
    return null;
  }
}

async function getMultipleStocks(symbols) {
  const results = [];
  for (const symbol of symbols) {
    const data = await getStockData(symbol);
    if (data) results.push(data);
    await new Promise(r => setTimeout(r, 500));
  }
  return results;
}

// ==================== KAYIT SISTEMI ====================

async function startRegistration(chatId, firstName) {
  const db = readDB();

  // Zaten kayitli mi kontrol et
  const existingUser = db.users.find(u => u.telegramChatId === chatId.toString());
  if (existingUser) {
    await sendMessage(chatId, `<b>Zaten kayitlisiniz!</b>

Kullanici ID: <b>${existingUser.id}</b>
Ad: ${existingUser.firstName} ${existingUser.lastName}
E-posta: ${existingUser.email}

Siteye giris icin /giris yazin.`);
    return;
  }

  // Kayit adimini baslat
  registrationSteps.set(chatId.toString(), {
    step: 'firstName',
    data: {}
  });

  await sendMessage(chatId, `<b>BORSA KRALI - KAYIT</b>

Hosgeldiniz ${firstName}!

<b>⚠️ ONEMLI:</b> Turkce karakter KULLANMAYIN!
(ş→s, ğ→g, ü→u, ö→o, ç→c, ı→i)

<b>1. Adiniz nedir?</b>
✅ Ornek: Omer, Sule, Cigdem
❌ Yanlis: Ömer, Şule, Çiğdem`);
}

async function processRegistration(chatId, text, telegramUsername) {
  const chatIdStr = chatId.toString();
  const step = registrationSteps.get(chatIdStr);

  if (!step) return false;

  // Eger / ile baslayan komut yazildiysa kaydi iptal et
  if (text.startsWith('/')) {
    registrationSteps.delete(chatIdStr);
    await sendMessage(chatId, '📋 Kayit islemi iptal edildi.');
    return false; // Komutu islesin diye false don
  }

  const db = readDB();

  switch (step.step) {
    case 'firstName':
      // Turkce karakter kontrolu
      if (hasTurkishChars(text)) {
        await sendMessage(chatId, `<b>HATA!</b> Turkce karakter kullanmayin!

Yazdiginiz: ${text}
Sorunlu karakterler: s, g, u, o, c, i

Lutfen Turkce karaktersiz tekrar yazin.
✅ Dogru: Omer, Sule, Cigdem
❌ Yanlis: Ömer, Şule, Çiğdem`);
        return true;
      }

      if (text.length < 2 || text.length > 50) {
        await sendMessage(chatId, 'Lutfen gecerli bir isim girin (2-50 karakter).');
        return true;
      }
      step.data.firstName = text.trim();
      step.step = 'lastName';
      await sendMessage(chatId, `<b>2. Soyadiniz nedir?</b>
(Turkce karakter kullanmayin!)
(Ornek: Yilmaz, Ozdemir, Celik)`);
      break;

    case 'lastName':
      // Turkce karakter kontrolu
      if (hasTurkishChars(text)) {
        await sendMessage(chatId, `<b>HATA!</b> Turkce karakter kullanmayin!

Yazdiginiz: ${text}

Lutfen Ingilizce karakterlerle tekrar yazin.
Ornek: Yilmaz, Ozdemir, Celik`);
        return true;
      }

      if (text.length < 2 || text.length > 50) {
        await sendMessage(chatId, 'Lutfen gecerli bir soyad girin (2-50 karakter).');
        return true;
      }
      step.data.lastName = text.trim();
      step.step = 'email';
      await sendMessage(chatId, `<b>3. E-posta adresiniz nedir?</b>
(Ornek: ornek@email.com)

Bu adres siteye giris icin kullanilacak.`);
      break;

    case 'email':
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(text)) {
        await sendMessage(chatId, 'Lutfen gecerli bir e-posta adresi girin.');
        return true;
      }

      // Email zaten kayitli mi?
      if (db.users.find(u => u.email.toLowerCase() === text.toLowerCase())) {
        await sendMessage(chatId, 'Bu e-posta adresi zaten kayitli!\n\nBaska bir e-posta girin veya /iptal yazin.');
        return true;
      }

      step.data.email = text.toLowerCase().trim();
      step.step = 'password';
      await sendMessage(chatId, `<b>4. Sifrenizi belirleyin:</b>

- En az 6 karakter
- Harf ve rakam icermeli
- Turkce karakter KULLANMAYIN!

(Bu mesaji yazdiktan sonra silmenizi oneririz)`);
      break;

    case 'password':
      // Turkce karakter kontrolu
      if (hasTurkishChars(text)) {
        await sendMessage(chatId, `<b>HATA!</b> Sifrede Turkce karakter kullanmayin!

Lutfen sadece Ingilizce harf ve rakam kullanin.`);
        return true;
      }

      if (text.length < 6) {
        await sendMessage(chatId, 'Sifre en az 6 karakter olmali.');
        return true;
      }
      if (!/[a-zA-Z]/.test(text) || !/[0-9]/.test(text)) {
        await sendMessage(chatId, 'Sifre hem harf hem rakam icermeli.');
        return true;
      }

      step.data.password = text;
      step.step = 'confirm';

      await sendMessage(chatId, `<b>KAYIT OZETI</b>

Ad: ${step.data.firstName}
Soyad: ${step.data.lastName}
E-posta: ${step.data.email}
Sifre: ${'*'.repeat(text.length)}

<b>Onayliyor musunuz?</b>
/onayla - Kaydi tamamla
/iptal - Kaydi iptal et`);
      break;

    case 'confirm':
      await sendMessage(chatId, 'Lutfen /onayla veya /iptal yazin.');
      break;

    default:
      registrationSteps.delete(chatIdStr);
      return false;
  }

  return true;
}

async function confirmRegistration(chatId, telegramUsername) {
  const chatIdStr = chatId.toString();
  const step = registrationSteps.get(chatIdStr);

  if (!step || step.step !== 'confirm') {
    await sendMessage(chatId, 'Aktif kayit isleminiz yok. /kayit yazarak baslayabilirsiniz.');
    return;
  }

  const db = readDB();

  // Sifreyi hashle
  const hashedPassword = await bcrypt.hash(step.data.password, 10);

  // Benzersiz ID olustur
  const userId = generateId();

  // Yeni kullanici
  const newUser = {
    id: userId,
    firstName: step.data.firstName,
    lastName: step.data.lastName,
    email: step.data.email,
    password: hashedPassword,
    telegramUsername: telegramUsername || '',
    telegramChatId: chatIdStr,
    verified: true,
    createdAt: new Date().toISOString()
  };

  db.users.push(newUser);
  writeDB(db);

  registrationSteps.delete(chatIdStr);

  console.log(`[KAYIT] Yeni kullanici: ${newUser.email} (${userId})`);

  await sendMessage(chatId, `<b>✅ KAYIT BASARILI!</b>

👤 Kullanici ID: <b>${userId}</b>
📝 Ad Soyad: ${newUser.firstName} ${newUser.lastName}
📧 E-posta: ${newUser.email}

<b>🔑 Siteye giris icin:</b>
1. Asagidaki linke tiklayin
2. E-posta ve sifrenizi girin
3. /giris yazarak dogrulama kodu alin
4. Kodu siteye girin

<b>🌐 TEST SITESI:</b>
${SITE_URL}

<b>⚠️ NOT:</b> Bu test sitesidir. Gercek site (borsakrali.com.tr) yakin zamanda yayina girecektir. Verileriniz guvenle saklanmaktadir.

🏆 Borsa Krali'na hosgeldiniz!

👨‍💻 Per.Tgm. Hasan KIRKIL`);
}

async function cancelRegistration(chatId) {
  registrationSteps.delete(chatId.toString());
  await sendMessage(chatId, 'Kayit iptal edildi.\n\nTekrar baslamak icin /kayit yazin.');
}

// ==================== GIRIS SISTEMI ====================

async function cmdGiris(chatId) {
  const db = readDB();
  const user = db.users.find(u => u.telegramChatId === chatId.toString());

  if (!user) {
    await sendMessage(chatId, `Kayitli hesabiniz yok!

Kayit olmak icin /kayit yazin.`);
    return;
  }

  // Dogrulama kodu olustur
  const code = generateVerificationCode();
  const expiresAt = Date.now() + (5 * 60 * 1000); // 5 dakika

  // Veritabanina kaydet
  db.pendingVerifications[user.id] = {
    code,
    expiresAt,
    attempts: 0
  };
  writeDB(db);

  console.log(`[GIRIS] Kod olusturuldu: ${user.email} -> ${code}`);

  await sendMessage(chatId, `<b>GIRIS DOGRULAMA KODU</b>

Merhaba ${user.firstName}!

Dogrulama Kodunuz: <b>${code}</b>

Bu kodu siteye girin.
Gecerlilik suresi: 5 dakika

<b>Site:</b> ${SITE_URL}

Kod calismiyorsa /kod yazarak yeni kod alin.`);
}

// /kod komutu - 2 dakika gecerli hizli kod
async function cmdKod(chatId) {
  const db = readDB();
  const user = db.users.find(u => u.telegramChatId === chatId.toString());

  if (!user) {
    await sendMessage(chatId, `Kayitli hesabiniz yok!

Kayit olmak icin /kayit yazin.`);
    return;
  }

  // Dogrulama kodu olustur - 2 dakika gecerli
  const code = generateVerificationCode();
  const expiresAt = Date.now() + (2 * 60 * 1000); // 2 dakika

  // Veritabanina kaydet
  db.pendingVerifications[user.id] = {
    code,
    expiresAt,
    attempts: 0
  };
  writeDB(db);

  console.log(`[KOD] Hizli kod olusturuldu: ${user.email} -> ${code}`);

  await sendMessage(chatId, `<b>HIZLI DOGRULAMA KODU</b>

Kodunuz: <b>${code}</b>

Gecerlilik: 2 DAKIKA

Hemen siteye girin ve bu kodu yazin!

<b>Site:</b> ${SITE_URL}`);
}

async function cmdHesap(chatId) {
  const db = readDB();
  const user = db.users.find(u => u.telegramChatId === chatId.toString());

  if (!user) {
    await sendMessage(chatId, `Kayitli hesabiniz yok!

Kayit olmak icin /kayit yazin.`);
    return;
  }

  await sendMessage(chatId, `<b>HESAP BILGILERI</b>

ID: <b>${user.id}</b>
Ad: ${user.firstName} ${user.lastName}
E-posta: ${user.email}
Kayit: ${new Date(user.createdAt).toLocaleDateString('tr-TR')}

<b>Site:</b> ${SITE_URL}
<b>Siteye giris icin:</b> /giris`);
}

// ==================== DIGER KOMUTLAR ====================

async function cmdStart(chatId, firstName, telegramUsername) {
  const db = readDB();
  const chatIdStr = chatId.toString();

  // Zaten kayitli mi?
  let existingUser = db.users.find(u => u.telegramChatId === chatIdStr);

  // Web'den kayit olmus ama telegram baglamamis kullanici var mi?
  if (!existingUser && telegramUsername) {
    const webUser = db.users.find(u =>
      u.telegramUsername &&
      u.telegramUsername.toLowerCase() === telegramUsername.toLowerCase() &&
      !u.telegramChatId
    );

    if (webUser) {
      // Web'den kayit olmus kullaniciyi bagla
      webUser.telegramChatId = chatIdStr;
      webUser.verified = true;
      writeDB(db);

      await sendMessage(chatId, `<b>✅ HESAP BAGLANDI!</b>

Merhaba ${webUser.firstName}!

Web uzerinden kayit oldugunuz hesabiniz Telegram'a basariyla baglandi.

<b>📧 E-posta:</b> ${webUser.email}
<b>👤 Kullanici:</b> ${webUser.username || '-'}

Artik siteye giris yapabilirsiniz!

<b>🌐 Site:</b> ${SITE_URL}

/giris - Giris kodu al
/help - Tum komutlar`);
      return;
    }
  }

  // Normal hosgeldin mesaji
  await sendMessage(chatId, `<b>🏆 BORSA KRALI AI BOT</b>

Merhaba ${firstName}!

BIST hisseleri icin canli fiyat ve teknik analiz.

<b>📋 KAYIT VE GIRIS:</b>
/kayit - Yeni hesap olustur
/giris - Siteye giris kodu al (5 dk)
/kod - Hizli dogrulama kodu (2 dk)
/hesap - Hesap bilgileri

<b>📊 HISSE ANALIZ:</b>
/analiz_THYAO - THY analizi
/fiyat_GARAN - Garanti fiyati

<b>📈 PIYASA:</b>
/piyasa - Genel durum
/bist30 - Hisse listesi
/yukselenler - Cok yukselenler

/help - Tum komutlar

<b>🌐 TEST SITESI:</b>
${SITE_URL}

<b>⚠️ NOT:</b> Bu site test amaclidir. Gercek site (borsakrali.com.tr) yakin zamanda yayina girecektir. Tum islemler guvenli sekilde kaydedilmektedir.

👨‍💻 Per.Tgm. Hasan KIRKIL`);
}

async function cmdHelp(chatId) {
  await sendMessage(chatId, `<b>BORSA KRALI - YARDIM</b>

<b>HESAP ISLEMLERI:</b>
/kayit - Yeni hesap olustur
/giris - Siteye giris kodu al (5 dk)
/kod - Hizli dogrulama kodu (2 dk)
/hesap - Hesap bilgileri

<b>HISSE ANALIZ:</b>
/analiz_HISSEKODU
Ornek: /analiz_THYAO

<b>FIYAT SORGULA:</b>
/fiyat_HISSEKODU
Ornek: /fiyat_GARAN

<b>PIYASA BILGISI:</b>
/piyasa - Genel durum
/bist30 - BIST 30 listesi
/yukselenler - En cok yukselenler
/dusenler - En cok dusenler
/tarama - RSI taramasi

<b>DIGER:</b>
/status - Bot durumu
/iletisim - Iletisim

<b>Site:</b> ${SITE_URL}

Per.Tgm. Hasan KIRKIL`);
}

async function cmdAnaliz(chatId, symbol) {
  if (!symbol || symbol.length < 2) {
    await sendMessage(chatId, `Hisse kodu girin.
Ornek: /analiz_THYAO`);
    return;
  }

  const data = await getStockData(symbol);

  if (!data) {
    await sendMessage(chatId, `${symbol} bulunamadi. Kodu kontrol edin.`);
    return;
  }

  const rsi = parseFloat(data.rsi);
  let signal = 'NOTR';
  let desc = 'Bekle';

  if (rsi < 30) {
    signal = 'ALIS FIRSATI';
    desc = 'RSI asiri satimda';
  } else if (rsi > 70) {
    signal = 'SATIS FIRSATI';
    desc = 'RSI asiri alimda';
  } else if (rsi > 55) {
    signal = 'YUKSELIS';
    desc = 'Trend yukari';
  } else if (rsi < 45) {
    signal = 'DUSUS';
    desc = 'Trend asagi';
  }

  const arrow = data.changePct >= 0 ? '+' : '';

  await sendMessage(chatId, `<b>${symbol} ANALIZ</b>

<b>${data.name}</b>

Fiyat: <b>${data.price.toFixed(2)} TL</b>
Degisim: <b>${arrow}${data.changePct.toFixed(2)}%</b>
Onceki: ${data.previousClose.toFixed(2)} TL
Yuksek: ${data.high.toFixed(2)} TL
Dusuk: ${data.low.toFixed(2)} TL

RSI: <b>${data.rsi}</b>
Sinyal: <b>${signal}</b>
${desc}

Hacim: ${(data.volume / 1000000).toFixed(1)}M
Piyasa: ${data.marketState === 'REGULAR' ? 'Acik' : 'Kapali'}

#${symbol}`);
}

async function cmdFiyat(chatId, symbol) {
  if (!symbol || symbol.length < 2) {
    await sendMessage(chatId, `Hisse kodu girin.
Ornek: /fiyat_THYAO`);
    return;
  }

  const data = await getStockData(symbol);

  if (!data) {
    await sendMessage(chatId, `${symbol} bulunamadi.`);
    return;
  }

  const arrow = data.changePct >= 0 ? '+' : '';

  await sendMessage(chatId, `<b>${symbol}</b>
${data.name}

Fiyat: <b>${data.price.toFixed(2)} TL</b>
Degisim: ${arrow}${data.changePct.toFixed(2)}%`);
}

async function cmdPiyasa(chatId) {
  const xu100 = await getStockData('XU100');

  let msg = '<b>BIST PIYASA</b>\n\n';

  if (xu100) {
    const arrow = xu100.changePct >= 0 ? '+' : '';
    msg += `BIST 100: ${xu100.price.toFixed(0)} (${arrow}${xu100.changePct.toFixed(2)}%)\n`;
    msg += `Durum: ${xu100.marketState === 'REGULAR' ? 'Acik' : 'Kapali'}\n`;
  } else {
    msg += 'Veri alinamadi\n';
  }

  msg += '\n/yukselenler /dusenler /bist30';

  await sendMessage(chatId, msg);
}

async function cmdBist30(chatId) {
  await sendMessage(chatId, `<b>BIST 30</b>

AKBNK - Akbank
ARCLK - Arcelik
ASELS - Aselsan
BIMAS - BIM
EKGYO - Emlak GYO
EREGL - Eregli
FROTO - Ford Otosan
GARAN - Garanti
GUBRF - Gubre Fab.
HEKTS - Hektas
ISCTR - Is Bankasi
KCHOL - Koc Holding
TRMET - TR Anadolu Metal (eski KOZAA)
TRALT - Turk Altin (eski KOZAL)
KRDMD - Kardemir
PETKM - Petkim
PGSUS - Pegasus
SAHOL - Sabanci
SASA - Sasa
SISE - Sisecam
TAVHL - TAV
TCELL - Turkcell
THYAO - THY
TKFEN - Tekfen
TOASO - Tofas
TTKOM - Turk Telekom
TUPRS - Tupras
VESTL - Vestel
YKBNK - Yapi Kredi

/analiz_THYAO`);
}

async function cmdYukselenler(chatId) {
  await sendMessage(chatId, 'Hesaplaniyor...');

  const symbols = ['THYAO', 'GARAN', 'ASELS', 'EREGL', 'SISE', 'AKBNK', 'TCELL', 'KCHOL', 'TUPRS', 'FROTO'];
  const results = await getMultipleStocks(symbols);

  if (results.length === 0) {
    await sendMessage(chatId, 'Veri alinamadi.');
    return;
  }

  results.sort((a, b) => b.changePct - a.changePct);

  let msg = '<b>EN COK YUKSELENLER</b>\n\n';
  results.slice(0, 5).forEach((s, i) => {
    const arrow = s.changePct >= 0 ? '+' : '';
    msg += `${i + 1}. ${s.symbol}: ${s.price.toFixed(2)} TL (${arrow}${s.changePct.toFixed(2)}%)\n`;
  });

  await sendMessage(chatId, msg);
}

async function cmdDusenler(chatId) {
  await sendMessage(chatId, 'Hesaplaniyor...');

  const symbols = ['THYAO', 'GARAN', 'ASELS', 'EREGL', 'SISE', 'AKBNK', 'TCELL', 'KCHOL', 'TUPRS', 'FROTO'];
  const results = await getMultipleStocks(symbols);

  if (results.length === 0) {
    await sendMessage(chatId, 'Veri alinamadi.');
    return;
  }

  results.sort((a, b) => a.changePct - b.changePct);

  let msg = '<b>EN COK DUSENLER</b>\n\n';
  results.slice(0, 5).forEach((s, i) => {
    const arrow = s.changePct >= 0 ? '+' : '';
    msg += `${i + 1}. ${s.symbol}: ${s.price.toFixed(2)} TL (${arrow}${s.changePct.toFixed(2)}%)\n`;
  });

  await sendMessage(chatId, msg);
}

async function cmdTarama(chatId) {
  await sendMessage(chatId, 'RSI taramasi yapiliyor...');

  const symbols = ['THYAO', 'GARAN', 'ASELS', 'EREGL', 'SISE', 'AKBNK', 'TCELL', 'KCHOL', 'TUPRS', 'FROTO'];
  const results = await getMultipleStocks(symbols);

  let oversold = results.filter(s => parseFloat(s.rsi) < 30);
  let overbought = results.filter(s => parseFloat(s.rsi) > 70);

  let msg = '<b>RSI TARAMA</b>\n\n';

  if (oversold.length > 0) {
    msg += 'ASIRI SATIM (RSI&lt;30):\n';
    oversold.forEach(s => msg += `${s.symbol}: RSI ${s.rsi}\n`);
    msg += '\n';
  }

  if (overbought.length > 0) {
    msg += 'ASIRI ALIM (RSI&gt;70):\n';
    overbought.forEach(s => msg += `${s.symbol}: RSI ${s.rsi}\n`);
    msg += '\n';
  }

  if (oversold.length === 0 && overbought.length === 0) {
    msg += 'Tum hisseler normal aralikta (30-70)';
  }

  await sendMessage(chatId, msg);
}

async function cmdStatus(chatId) {
  const db = readDB();
  await sendMessage(chatId, `<b>BOT DURUMU</b>

Durum: AKTIF
Zaman: ${new Date().toLocaleString('tr-TR')}
Cache: ${stockCache.size} hisse
Kayitli Kullanici: ${db.users.length}
Bekleyen Dogrulama: ${Object.keys(db.pendingVerifications).length}
Versiyon: 4.2

Site: ${SITE_URL}`);
}

async function cmdIletisim(chatId) {
  await sendMessage(chatId, `<b>ILETISIM</b>

Per.Tgm. Hasan KIRKIL
Bot: @Borsa_krali_aibot
Site: ${SITE_URL}

Egitim amaclidir.
Yatirim tavsiyesi degildir.`);
}

// ==================== MESAJ ISLEME ====================

async function processUpdates() {
  try {
    const response = await axios.get(getTelegramUrl('getUpdates'), {
      params: {
        offset: lastUpdateId + 1,
        limit: 1,
        timeout: 30
      },
      timeout: 35000
    });

    const updates = response.data.result || [];

    for (const update of updates) {
      lastUpdateId = update.update_id;

      const msg = update.message;
      if (!msg || !msg.text) continue;

      const msgKey = `${msg.chat.id}_${msg.message_id}`;
      if (processedMessages.has(msgKey)) continue;
      processedMessages.add(msgKey);

      if (processedMessages.size > 1000) {
        const arr = Array.from(processedMessages);
        arr.slice(0, 500).forEach(k => processedMessages.delete(k));
      }

      const chatId = msg.chat.id;
      const text = msg.text.trim();
      const firstName = msg.from.first_name || 'Kullanici';
      const telegramUsername = msg.from.username || '';

      console.log(`[MSG] ${firstName}: ${text}`);

      try {
        // Kayit isleminde miyiz?
        if (registrationSteps.has(chatId.toString())) {
          // Ozel komutlar
          if (text === '/onayla') {
            await confirmRegistration(chatId, telegramUsername);
            continue;
          }
          if (text === '/iptal') {
            await cancelRegistration(chatId);
            continue;
          }
          // Normal kayit adimlari
          const handled = await processRegistration(chatId, text, telegramUsername);
          if (handled) continue;
        }

        // Normal komutlar
        if (text === '/start') {
          await cmdStart(chatId, firstName, telegramUsername);
        }
        else if (text === '/help') {
          await cmdHelp(chatId);
        }
        else if (text === '/kayit') {
          await startRegistration(chatId, firstName);
        }
        else if (text === '/giris') {
          await cmdGiris(chatId);
        }
        else if (text === '/kod') {
          await cmdKod(chatId);
        }
        else if (text === '/hesap') {
          await cmdHesap(chatId);
        }
        else if (text.startsWith('/analiz_')) {
          const symbol = text.replace('/analiz_', '').toUpperCase().trim();
          await cmdAnaliz(chatId, symbol);
        }
        else if (text.startsWith('/fiyat_')) {
          const symbol = text.replace('/fiyat_', '').toUpperCase().trim();
          await cmdFiyat(chatId, symbol);
        }
        else if (text === '/piyasa') {
          await cmdPiyasa(chatId);
        }
        else if (text === '/bist30') {
          await cmdBist30(chatId);
        }
        else if (text === '/yukselenler') {
          await cmdYukselenler(chatId);
        }
        else if (text === '/dusenler') {
          await cmdDusenler(chatId);
        }
        else if (text === '/tarama') {
          await cmdTarama(chatId);
        }
        else if (text === '/status') {
          await cmdStatus(chatId);
        }
        else if (text === '/iletisim') {
          await cmdIletisim(chatId);
        }
        else if (text.startsWith('/')) {
          await sendMessage(chatId, `Bilinmeyen komut.
/help yazin.`);
        }
      } catch (cmdError) {
        console.error(`[CMD] Hata: ${cmdError.message}`);
      }
    }
  } catch (error) {
    if (!error.message.includes('timeout') && !error.message.includes('409')) {
      console.error('[UPDATE] Hata:', error.message);
    }
  }
}

// ==================== ANA DONGU ====================

async function main() {
  console.log('=====================================');
  console.log('   BORSA KRALI BOT v4.2');
  console.log('   Kayit + Giris Kodu Sistemi');
  console.log('   Per.Tgm. Hasan KIRKIL');
  console.log('=====================================');
  console.log('');

  // Data klasorunu kontrol et
  const dataDir = path.join(__dirname, 'src/data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  // Users dosyasini kontrol et
  if (!fs.existsSync(USERS_FILE)) {
    writeDB({ users: [], pendingVerifications: {}, telegramLinks: {} });
    console.log('[DB] users.json olusturuldu');
  }

  // Eski mesajlari atla
  try {
    const initResponse = await axios.get(getTelegramUrl('getUpdates'), {
      params: { offset: -1 },
      timeout: 5000
    });
    const updates = initResponse.data.result || [];
    if (updates.length > 0) {
      lastUpdateId = updates[updates.length - 1].update_id;
      console.log(`[INIT] Son update_id: ${lastUpdateId}`);
    }
  } catch (e) {
    console.log('[INIT] Baslangic kontrolu atlandi');
  }

  // Baslangic mesaji
  await sendMessage(CHAT_ID, `Bot v4.2 aktif!

/kayit - Yeni hesap
/giris - Giris kodu
/help - Komutlar

Site: ${SITE_URL}`);

  console.log('[BOT] Aktif. CTRL+C ile kapat.');
  console.log(`[BOT] Site: ${SITE_URL}`);
  console.log('');

  while (true) {
    await processUpdates();
  }
}

main().catch(err => {
  console.error('Bot hatasi:', err);
  process.exit(1);
});
