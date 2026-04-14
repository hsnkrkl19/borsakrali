/**
 * Telegram Bot Service - BORSA KRALI
 * Per.Tgm. Hasan KIRKIL tarafindan olusturulmustur
 * Kapsamli komut sistemi ve sinyal bildirimleri
 */

const axios = require('axios');

// Telegram Bot ayarlari
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '8374895928:AAGA830voVcjUoPlwzVUGoW1WRPrdru_Gv4';
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || '2116638354';

// API URL
const getTelegramUrl = (method) =>
  `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/${method}`;

// Signal store
const sentSignals = new Map();

// Aktif alarmlar
const activeAlerts = [];

// Son update_id
let lastUpdateId = 0;

// Cache - hisse verileri
let stockDataCache = new Map();
let lastCacheUpdate = null;

/**
 * Telegram'a mesaj gonder
 */
async function sendMessage(chatId, text, parseMode = 'HTML') {
  if (!TELEGRAM_BOT_TOKEN) {
    console.log('[Telegram] Bot token ayarlanmamis');
    return { success: false, error: 'Bot token yok' };
  }

  try {
    // Turkce karakterleri ASCII'ye cevir
    const safeText = text
      .replace(/ş/g, 's').replace(/Ş/g, 'S')
      .replace(/ğ/g, 'g').replace(/Ğ/g, 'G')
      .replace(/ü/g, 'u').replace(/Ü/g, 'U')
      .replace(/ö/g, 'o').replace(/Ö/g, 'O')
      .replace(/ç/g, 'c').replace(/Ç/g, 'C')
      .replace(/ı/g, 'i').replace(/İ/g, 'I');

    const response = await axios.post(getTelegramUrl('sendMessage'), {
      chat_id: chatId,
      text: safeText,
      parse_mode: parseMode,
      disable_web_page_preview: true
    });

    return { success: true, messageId: response.data.result.message_id };
  } catch (error) {
    console.error('[Telegram] Mesaj gonderme hatasi:', error.response?.data || error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Hisse verisi getir (Yahoo Finance)
 */
async function getStockData(symbol) {
  try {
    const yahooSymbol = `${symbol}.IS`;
    const response = await axios.get(`https://query1.finance.yahoo.com/v8/finance/chart/${yahooSymbol}`, {
      params: { interval: '1d', range: '5d' },
      timeout: 10000
    });

    const result = response.data.chart.result[0];
    const meta = result.meta;
    const quotes = result.indicators.quote[0];
    const closes = quotes.close.filter(c => c !== null);

    const currentPrice = meta.regularMarketPrice;
    const previousClose = meta.previousClose || closes[closes.length - 2];
    const change = currentPrice - previousClose;
    const changePercent = (change / previousClose) * 100;

    // RSI hesapla (basit)
    let rsi = 50;
    if (closes.length >= 14) {
      let gains = 0, losses = 0;
      for (let i = closes.length - 14; i < closes.length; i++) {
        const diff = closes[i] - closes[i - 1];
        if (diff > 0) gains += diff;
        else losses += Math.abs(diff);
      }
      const avgGain = gains / 14;
      const avgLoss = losses / 14;
      const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
      rsi = 100 - (100 / (1 + rs));
    }

    return {
      symbol,
      price: currentPrice,
      change,
      changePercent,
      previousClose,
      high: meta.regularMarketDayHigh,
      low: meta.regularMarketDayLow,
      volume: meta.regularMarketVolume,
      rsi: rsi.toFixed(1),
      marketState: meta.marketState
    };
  } catch (error) {
    console.error(`[Telegram] Hisse verisi alinamadi: ${symbol}`, error.message);
    return null;
  }
}

/**
 * Teknik analiz yap
 */
async function getTechnicalAnalysis(symbol) {
  const data = await getStockData(symbol);
  if (!data) return null;

  const rsi = parseFloat(data.rsi);

  // Sinyal belirle
  let signal = 'NOTR';
  let signalEmoji = '⚪';
  let description = 'Bekle';

  if (rsi < 30) {
    signal = 'AL';
    signalEmoji = '🟢';
    description = 'RSI asiri satim bolgesinde - Potansiyel alis firsati';
  } else if (rsi > 70) {
    signal = 'SAT';
    signalEmoji = '🔴';
    description = 'RSI asiri alim bolgesinde - Potansiyel satis firsati';
  } else if (rsi >= 45 && rsi <= 55) {
    signal = 'NOTR';
    signalEmoji = '⚪';
    description = 'RSI notr bolgede - Bekle';
  } else if (rsi > 55) {
    signal = 'GUCLU';
    signalEmoji = '🟡';
    description = 'Yukselis egilimi devam ediyor';
  } else {
    signal = 'ZAYIF';
    signalEmoji = '🟠';
    description = 'Dusus baskisi var';
  }

  return {
    ...data,
    signal,
    signalEmoji,
    description
  };
}

/**
 * Bot guncellemelerini al
 */
async function getUpdates() {
  try {
    const response = await axios.get(getTelegramUrl('getUpdates'), {
      params: { offset: lastUpdateId + 1, limit: 10 },
      timeout: 5000
    });
    return response.data.result || [];
  } catch (error) {
    if (error.response?.status !== 409) {
      console.error('[Telegram] getUpdates hatasi:', error.message);
    }
    return [];
  }
}

/**
 * Komutlari isle
 */
async function processUpdates() {
  const updates = await getUpdates();

  for (const update of updates) {
    lastUpdateId = update.update_id;

    const message = update.message;
    if (!message) continue;

    const chatId = message.chat.id;
    const text = (message.text || '').trim();
    const firstName = message.from.first_name || 'Kullanici';

    console.log(`[Telegram] Komut: ${text} from ${firstName} (${chatId})`);

    // /start komutu
    if (text === '/start') {
      await cmdStart(chatId, firstName);
    }
    // /help komutu
    else if (text === '/help') {
      await cmdHelp(chatId);
    }
    // /analiz_SEMBOL komutu
    else if (text.startsWith('/analiz_')) {
      const symbol = text.replace('/analiz_', '').toUpperCase();
      await cmdAnaliz(chatId, symbol);
    }
    // /fiyat_SEMBOL komutu
    else if (text.startsWith('/fiyat_')) {
      const symbol = text.replace('/fiyat_', '').toUpperCase();
      await cmdFiyat(chatId, symbol);
    }
    // /piyasa komutu
    else if (text === '/piyasa') {
      await cmdPiyasa(chatId);
    }
    // /bist30 komutu
    else if (text === '/bist30') {
      await cmdBist30(chatId);
    }
    // /yukselenler komutu
    else if (text === '/yukselenler') {
      await cmdYukselenler(chatId);
    }
    // /dusenler komutu
    else if (text === '/dusenler') {
      await cmdDusenler(chatId);
    }
    // /sinyaller komutu
    else if (text === '/sinyaller') {
      await cmdSinyaller(chatId);
    }
    // /tarama komutu
    else if (text === '/tarama') {
      await cmdTarama(chatId);
    }
    // /site komutu
    else if (text === '/site') {
      await cmdSite(chatId);
    }
    // /status komutu
    else if (text === '/status') {
      await cmdStatus(chatId);
    }
    // /iletisim komutu
    else if (text === '/iletisim') {
      await cmdIletisim(chatId);
    }
    // Bilinmeyen komut
    else if (text.startsWith('/')) {
      await sendMessage(chatId, `Bilinmeyen komut: ${text}\n\nKomutlari gormek icin /help yazin.`);
    }
  }
}

// ==================== KOMUTLAR ====================

/**
 * /start - Botu baslat
 */
async function cmdStart(chatId, firstName) {
  const msg = `
<b>BORSA KRALI AI BOT</b>

Merhaba ${firstName}! Hos geldiniz.

Ben Borsa Krali yapay zeka botuyum. Size BIST hisseleri hakkinda teknik analiz, fiyat bilgisi ve sinyal bildirimleri saglayabilirim.

<b>Hizli Baslangic:</b>
/analiz_THYAO - THYAO hissesini analiz et
/fiyat_GARAN - GARAN fiyatini gor
/piyasa - Piyasa ozeti
/help - Tum komutlar

<b>Ozellikler:</b>
- Canli fiyat takibi
- RSI bazli teknik analiz
- Otomatik sinyal bildirimleri
- BIST30 ve BIST100 takibi

Per.Tgm. Hasan KIRKIL - Borsa Krali
`;
  await sendMessage(chatId, msg);
}

/**
 * /help - Yardim
 */
async function cmdHelp(chatId) {
  const msg = `
<b>BORSA KRALI - KOMUT LISTESI</b>

<b>ANALIZ KOMUTLARI:</b>
/analiz_SEMBOL - Hisse teknik analizi
  Ornek: /analiz_THYAO, /analiz_GARAN

/fiyat_SEMBOL - Hisse fiyat bilgisi
  Ornek: /fiyat_ASELS, /fiyat_SISE

<b>PIYASA KOMUTLARI:</b>
/piyasa - Genel piyasa ozeti
/bist30 - BIST30 endeks bilgisi
/yukselenler - En cok yukselenler
/dusenler - En cok dusenler

<b>SINYAL KOMUTLARI:</b>
/sinyaller - Aktif sinyaller
/tarama - RSI taramasi yap

<b>DIGER KOMUTLAR:</b>
/site - Web sitesi linki
/status - Bot durumu
/iletisim - Iletisim bilgileri
/help - Bu yardim mesaji

<b>KULLANIM ORNEGI:</b>
Bir hisseyi analiz etmek icin:
/analiz_THYAO

Not: Semboller buyuk harfle yazilmalidir.
`;
  await sendMessage(chatId, msg);
}

/**
 * /analiz_SEMBOL - Teknik analiz
 */
async function cmdAnaliz(chatId, symbol) {
  if (!symbol || symbol.length < 2) {
    await sendMessage(chatId, 'Lutfen gecerli bir hisse kodu girin.\nOrnek: /analiz_THYAO');
    return;
  }

  await sendMessage(chatId, `${symbol} icin analiz yapiliyor...`);

  const analysis = await getTechnicalAnalysis(symbol);

  if (!analysis) {
    await sendMessage(chatId, `${symbol} icin veri alinamadi. Hisse kodunu kontrol edin.`);
    return;
  }

  const arrow = analysis.changePercent >= 0 ? '+' : '';

  const msg = `
${analysis.signalEmoji} <b>TEKNIK ANALIZ: ${symbol}</b>

<b>FIYAT BILGISI:</b>
Guncel: ${analysis.price?.toFixed(2)} TL
Degisim: ${arrow}${analysis.changePercent?.toFixed(2)}%
Onceki Kapanis: ${analysis.previousClose?.toFixed(2)} TL
Gun Yuksek: ${analysis.high?.toFixed(2)} TL
Gun Dusuk: ${analysis.low?.toFixed(2)} TL

<b>TEKNIK GOSTERGELER:</b>
RSI (14): ${analysis.rsi}
${parseFloat(analysis.rsi) < 30 ? '(Asiri Satim Bolgesi)' : parseFloat(analysis.rsi) > 70 ? '(Asiri Alim Bolgesi)' : '(Normal Bolge)'}

<b>SINYAL: ${analysis.signal}</b>
${analysis.description}

<b>HACIM:</b>
${(analysis.volume / 1000000).toFixed(2)}M lot

Piyasa Durumu: ${analysis.marketState === 'REGULAR' ? 'Acik' : 'Kapali'}

--
Bu bilgi yatirim tavsiyesi degildir.
#BorsaKrali #${symbol}
`;

  await sendMessage(chatId, msg);
}

/**
 * /fiyat_SEMBOL - Fiyat bilgisi
 */
async function cmdFiyat(chatId, symbol) {
  if (!symbol || symbol.length < 2) {
    await sendMessage(chatId, 'Lutfen gecerli bir hisse kodu girin.\nOrnek: /fiyat_THYAO');
    return;
  }

  const data = await getStockData(symbol);

  if (!data) {
    await sendMessage(chatId, `${symbol} icin veri alinamadi.`);
    return;
  }

  const arrow = data.changePercent >= 0 ? '+' : '';
  const emoji = data.changePercent >= 0 ? '📈' : '📉';

  const msg = `
${emoji} <b>${symbol} FIYAT</b>

Fiyat: <b>${data.price?.toFixed(2)} TL</b>
Degisim: ${arrow}${data.changePercent?.toFixed(2)}%

Yuksek: ${data.high?.toFixed(2)} TL
Dusuk: ${data.low?.toFixed(2)} TL
Hacim: ${(data.volume / 1000000).toFixed(2)}M

#${symbol}
`;

  await sendMessage(chatId, msg);
}

/**
 * /piyasa - Piyasa ozeti
 */
async function cmdPiyasa(chatId) {
  await sendMessage(chatId, 'Piyasa verileri aliniyor...');

  // XU100 endeksini al
  try {
    const xu100 = await getStockData('XU100');

    const msg = `
<b>BIST PIYASA OZETI</b>

<b>BIST 100 (XU100):</b>
${xu100 ? `Deger: ${xu100.price?.toFixed(2)}
Degisim: ${xu100.changePercent >= 0 ? '+' : ''}${xu100.changePercent?.toFixed(2)}%` : 'Veri alinamadi'}

<b>Piyasa Durumu:</b> ${xu100?.marketState === 'REGULAR' ? 'Acik' : 'Kapali'}

<b>Detayli bilgi icin:</b>
/bist30 - BIST30 hisseleri
/yukselenler - Cok yukselenler
/dusenler - Cok dusenler

#BorsaKrali #BIST
`;

    await sendMessage(chatId, msg);
  } catch (error) {
    await sendMessage(chatId, 'Piyasa verisi alinamadi.');
  }
}

/**
 * /bist30 - BIST30 hisseleri
 */
async function cmdBist30(chatId) {
  const bist30 = ['AKBNK', 'ARCLK', 'ASELS', 'BIMAS', 'EKGYO', 'EREGL', 'FROTO', 'GARAN',
    'GUBRF', 'HEKTS', 'ISCTR', 'KCHOL', 'KOZAA', 'KOZAL', 'KRDMD', 'ODAS',
    'PETKM', 'PGSUS', 'SAHOL', 'SASA', 'SISE', 'TAVHL', 'TCELL', 'THYAO',
    'TKFEN', 'TOASO', 'TTKOM', 'TUPRS', 'VESTL', 'YKBNK'];

  const msg = `
<b>BIST 30 HISSELERI</b>

${bist30.join(', ')}

<b>Analiz icin:</b>
/analiz_THYAO
/analiz_GARAN
/analiz_ASELS

Herhangi bir hisseyi analiz edebilirsiniz.

#BIST30
`;

  await sendMessage(chatId, msg);
}

/**
 * /yukselenler - En cok yukselenler
 */
async function cmdYukselenler(chatId) {
  await sendMessage(chatId, 'En cok yukselenler aliniyor...');

  const topStocks = ['THYAO', 'GARAN', 'ASELS', 'EREGL', 'SISE'];
  let results = [];

  for (const symbol of topStocks) {
    const data = await getStockData(symbol);
    if (data) {
      results.push(data);
    }
  }

  results.sort((a, b) => b.changePercent - a.changePercent);

  let msg = '<b>EN COK YUKSELENLER</b>\n\n';
  results.forEach((stock, i) => {
    const arrow = stock.changePercent >= 0 ? '+' : '';
    msg += `${i + 1}. ${stock.symbol}: ${stock.price?.toFixed(2)} TL (${arrow}${stock.changePercent?.toFixed(2)}%)\n`;
  });

  msg += '\nDetay icin: /analiz_SEMBOL';

  await sendMessage(chatId, msg);
}

/**
 * /dusenler - En cok dusenler
 */
async function cmdDusenler(chatId) {
  await sendMessage(chatId, 'En cok dusenler aliniyor...');

  const topStocks = ['THYAO', 'GARAN', 'ASELS', 'EREGL', 'SISE'];
  let results = [];

  for (const symbol of topStocks) {
    const data = await getStockData(symbol);
    if (data) {
      results.push(data);
    }
  }

  results.sort((a, b) => a.changePercent - b.changePercent);

  let msg = '<b>EN COK DUSENLER</b>\n\n';
  results.forEach((stock, i) => {
    const arrow = stock.changePercent >= 0 ? '+' : '';
    msg += `${i + 1}. ${stock.symbol}: ${stock.price?.toFixed(2)} TL (${arrow}${stock.changePercent?.toFixed(2)}%)\n`;
  });

  msg += '\nDetay icin: /analiz_SEMBOL';

  await sendMessage(chatId, msg);
}

/**
 * /sinyaller - Aktif sinyaller
 */
async function cmdSinyaller(chatId) {
  if (activeAlerts.length === 0) {
    await sendMessage(chatId, 'Su an aktif sinyal bulunmuyor.\n\nYeni sinyaller tespit edildiginde bildirim alacaksiniz.');
    return;
  }

  let msg = '<b>AKTIF SINYALLER</b>\n\n';

  activeAlerts.slice(0, 5).forEach((alert, i) => {
    msg += `${i + 1}. ${alert.symbol} - ${alert.strategy}\n`;
    msg += `   Fiyat: ${alert.price?.toFixed(2)} TL\n`;
    msg += `   ${new Date(alert.timestamp).toLocaleString('tr-TR')}\n\n`;
  });

  msg += `Toplam: ${activeAlerts.length} sinyal`;

  await sendMessage(chatId, msg);
}

/**
 * /tarama - RSI taramasi
 */
async function cmdTarama(chatId) {
  await sendMessage(chatId, 'RSI taramasi yapiliyor...');

  const stocks = ['THYAO', 'GARAN', 'ASELS', 'EREGL', 'SISE', 'AKBNK', 'TCELL', 'KCHOL'];
  let oversold = [];
  let overbought = [];

  for (const symbol of stocks) {
    const data = await getStockData(symbol);
    if (data) {
      const rsi = parseFloat(data.rsi);
      if (rsi < 30) oversold.push({ symbol, rsi, price: data.price });
      if (rsi > 70) overbought.push({ symbol, rsi, price: data.price });
    }
  }

  let msg = '<b>RSI TARAMA SONUCLARI</b>\n\n';

  if (oversold.length > 0) {
    msg += '<b>ASIRI SATIM (RSI &lt; 30):</b>\n';
    oversold.forEach(s => {
      msg += `- ${s.symbol}: RSI ${s.rsi} (${s.price?.toFixed(2)} TL)\n`;
    });
    msg += '\n';
  }

  if (overbought.length > 0) {
    msg += '<b>ASIRI ALIM (RSI &gt; 70):</b>\n';
    overbought.forEach(s => {
      msg += `- ${s.symbol}: RSI ${s.rsi} (${s.price?.toFixed(2)} TL)\n`;
    });
    msg += '\n';
  }

  if (oversold.length === 0 && overbought.length === 0) {
    msg += 'Su an asiri alim/satim bolgesinde hisse yok.\n';
  }

  msg += '\nDetay icin: /analiz_SEMBOL';

  await sendMessage(chatId, msg);
}

/**
 * /site - Web sitesi
 */
async function cmdSite(chatId) {
  const msg = `
<b>BORSA KRALI WEB SITESI</b>

Tam ozellikli platformumuzu ziyaret edin:

- Canli Heatmap
- Detayli Teknik Analiz
- Temel Analiz (AI)
- Gunluk Tespitler
- Tarama Merkezi
- ve daha fazlasi...

Web: localhost:5173
(Yerel gelistirme ortami)

Per.Tgm. Hasan KIRKIL
`;

  await sendMessage(chatId, msg);
}

/**
 * /status - Bot durumu
 */
async function cmdStatus(chatId) {
  const now = new Date();
  const msg = `
<b>BOT DURUMU</b>

Durum: AKTIF
Zaman: ${now.toLocaleString('tr-TR')}

Aktif Sinyaller: ${activeAlerts.length}
Cache Boyutu: ${stockDataCache.size}

Bot: @Borsa_krali_aibot (Borsa Kralı v5)
Versiyon: 2.0

#BorsaKrali
`;

  await sendMessage(chatId, msg);
}

/**
 * /iletisim - Iletisim bilgileri
 */
async function cmdIletisim(chatId) {
  const msg = `
<b>ILETISIM</b>

Gelistirici: Per.Tgm. Hasan KIRKIL

Telegram Bot: @Borsa_krali_aibot (Borsa Kralı v5)

Proje: Borsa Krali
Amac: Egitim amacli teknik analiz platformu

Not: Bu platform yatirim tavsiyesi vermez.
Tum analizler egitim amaclidir.

#BorsaKrali
`;

  await sendMessage(chatId, msg);
}

// ==================== YARDIMCI FONKSIYONLAR ====================

/**
 * Polling baslat
 */
let pollingInterval = null;

function startPolling() {
  if (pollingInterval) return;

  console.log('[Telegram] Bot polling baslatildi...');
  pollingInterval = setInterval(processUpdates, 2000);
  processUpdates();
}

function stopPolling() {
  if (pollingInterval) {
    clearInterval(pollingInterval);
    pollingInterval = null;
    console.log('[Telegram] Bot polling durduruldu');
  }
}

/**
 * Sinyal bildirimi gonder
 */
async function sendSignalAlert(signal, chatId = TELEGRAM_CHAT_ID) {
  const signalKey = `${signal.symbol}-${signal.strategy}-${new Date().toDateString()}`;

  if (sentSignals.has(signalKey)) {
    return { success: false, error: 'Sinyal zaten gonderildi' };
  }

  const emoji = signal.type === 'BUY' ? '🟢' : signal.type === 'SELL' ? '🔴' : '🟡';
  const arrow = signal.changePercent >= 0 ? '+' : '';

  const msg = `
${emoji} <b>YENI SINYAL!</b>

Hisse: <b>${signal.symbol}</b>
Strateji: ${signal.strategy}
Fiyat: ${signal.price?.toFixed(2)} TL
Degisim: ${arrow}${signal.changePercent?.toFixed(2)}%
RSI: ${signal.rsi || '-'}

${signal.description || ''}

Zaman: ${new Date().toLocaleString('tr-TR')}

Detay icin: /analiz_${signal.symbol}

#BorsaKrali #${signal.symbol}
`;

  const alertData = {
    id: Date.now(),
    ...signal,
    timestamp: new Date().toISOString(),
    read: false
  };
  activeAlerts.unshift(alertData);

  if (activeAlerts.length > 100) {
    activeAlerts.pop();
  }

  const result = await sendMessage(chatId, msg);

  if (result.success) {
    sentSignals.set(signalKey, Date.now());
    setTimeout(() => sentSignals.delete(signalKey), 24 * 60 * 60 * 1000);
  }

  return { ...result, alert: alertData };
}

/**
 * Bot durumunu kontrol et
 */
async function checkBotStatus() {
  if (!TELEGRAM_BOT_TOKEN) {
    return { active: false, configured: false, error: 'Bot token ayarlanmamis' };
  }

  try {
    const response = await axios.get(getTelegramUrl('getMe'));
    return {
      active: true,
      botInfo: response.data.result,
      configured: true,
      polling: !!pollingInterval
    };
  } catch (error) {
    return { active: false, error: error.message };
  }
}

// Aktif alarmlari getir
function getActiveAlerts(limit = 50) {
  return activeAlerts.slice(0, limit);
}

// Alarmi okundu isaretle
function markAlertAsRead(alertId) {
  const alert = activeAlerts.find(a => a.id === alertId);
  if (alert) {
    alert.read = true;
    return true;
  }
  return false;
}

// Alarmlari temizle
function clearAllAlerts() {
  activeAlerts.length = 0;
  return true;
}

// Okunmamis sayisi
function getUnreadCount() {
  return activeAlerts.filter(a => !a.read).length;
}

module.exports = {
  sendMessage,
  sendSignalAlert,
  checkBotStatus,
  getActiveAlerts,
  markAlertAsRead,
  clearAllAlerts,
  getUnreadCount,
  startPolling,
  stopPolling,
  processUpdates,
  getStockData,
  getTechnicalAnalysis
};
