/**
 * signalDelivery — BIST DIŞI sinyal bildirim yönlendirmesi (tek kaynak / ayar).
 *
 * Kullanıcı isteği (2026-06-18): "bot bana göndermesin hepsi kanala gitsin (bist
 * hariç)". BIST dışı sistemler (forex, wave, kripto, MTF) kullanıcıya DM /
 * uygulama (FCM) push'u ATMAZ; yalnız Telegram kanalına (@borsakraliai) gider.
 * BIST sistemleri (günlük sinyaller, ≥75 BIST sinyalleri, EMA34/TEMA34 crossover)
 * bu ayardan ETKİLENMEZ.
 *
 *   SIGNALS_CHANNEL_ONLY=0 → eski davranış (DM/uygulama push açık). Varsayılan AÇIK.
 *   Kanal = TELEGRAM_FOREX_CHANNEL (yoksa TELEGRAM_SIGNAL_CHANNEL). DM'e DÜŞMEZ.
 */

function signalChannel() {
  return process.env.TELEGRAM_FOREX_CHANNEL || process.env.TELEGRAM_SIGNAL_CHANNEL || '';
}

function channelOnly() {
  return process.env.SIGNALS_CHANNEL_ONLY !== '0'; // varsayılan AÇIK
}

module.exports = { signalChannel, channelOnly };
