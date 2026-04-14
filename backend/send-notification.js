/**
 * Telegram Guncelleme Bildirimi
 * BORSA KRALI v4.2 - PRODUCTION READY
 */

const axios = require('axios');

const BOT_TOKEN = '8374895928:AAGA830voVcjUoPlwzVUGoW1WRPrdru_Gv4';
const CHAT_ID = '2116638354';

async function sendNotification() {
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

    try {
        const response = await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
            chat_id: CHAT_ID,
            text: message,
            parse_mode: 'HTML',
            disable_web_page_preview: true
        });

        if (response.data.ok) {
            console.log('✅ Bildirim basariyla gonderildi!');
        } else {
            console.error('❌ Bildirim gonderilemedi:', response.data);
        }
    } catch (error) {
        console.error('❌ Hata:', error.message);
    }
}

sendNotification();
