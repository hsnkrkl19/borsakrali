/**
 * Telegram guncelleme bildirimi.
 * Kimlik bilgileri yalnizca ortam degiskenlerinden okunur.
 */

'use strict';

const axios = require('axios');

const BOT_TOKEN = String(process.env.TELEGRAM_BOT_TOKEN || '').trim();
const CHAT_ID = String(process.env.TELEGRAM_CHAT_ID || '').trim();

async function sendNotification() {
  if (!BOT_TOKEN || !CHAT_ID) {
    throw new Error('TELEGRAM_BOT_TOKEN ve TELEGRAM_CHAT_ID ortam degiskenleri zorunludur.');
  }

  const message = `🚀 <b>BORSA KRALI v4.2 - YAYIN HAZIR!</b>

✅ <b>Tamamlanan Islemler:</b>
• Tum sayfalar kontrol edildi ve hatalar duzeltildi
• API response kontrolleri eklendi
• Error handling mekanizmalari guclendirildi
• Null/undefined guvenlik kontrolleri eklendi

📊 <b>Duzeltilen Sayfalar:</b>
• TemelAnalizAI - Hata gosterimi eklendi
• TeknikAnalizAI - Sektor yukleme duzeltildi
• HisseAISkor - Sinyal renklendirmesi duzeltildi
• Taramalar - Fibonacci null kontrolleri
• GunlukTespitler - Socket/API kontrolleri
• Login/Register - Response validasyonu
• TakipListem - Watchlist API kontrolleri
• KAPAnalitik - Promise.all hata yonetimi

⚡ <b>Teknik Iyilestirmeler:</b>
• TradingView ticker widget guncellendi
• Header overflow duzeltildi
• Mobile responsive iyilestirmeler
• Ngrok otomatik baslatma eklendi

🎯 <b>Sistem Durumu:</b>
• Frontend: HAZIR
• Backend: HAZIR
• Telegram Bot: AKTIF
• Versiyon: 4.2

👨‍💻 Per.Tgm. Hasan KIRKIL
📅 02 Subat 2026

🌐 Site yayina hazir!`;

  const response = await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    chat_id: CHAT_ID,
    text: message,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
  });

  if (!response.data?.ok) throw new Error('Telegram API bildirimi kabul etmedi.');
  console.log('✅ Bildirim basariyla gonderildi!');
}

sendNotification().catch((error) => {
  console.error('❌ Bildirim gonderilemedi:', error.message);
  process.exitCode = 1;
});
