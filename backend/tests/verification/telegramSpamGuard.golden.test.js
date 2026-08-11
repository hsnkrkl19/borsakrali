'use strict';

/**
 * 2026-08-11 SPAM KORUMASI — bot public (@Borsa_krali_ai); rastgele (çoğunlukla
 * Rusça doxxing-botu) reklamları DM atıyor. Polling üretimde KAPALI ama açılırsa
 * bile yabancı DM'lere hiçbir yanıt verilmemeli — spam'a "Bilinmeyen komut"
 * bile dönmemeli.
 *
 * Değişmezler:
 *  1. Yetkisiz özel sohbet (pozitif chat_id, TELEGRAM_CHAT_ID değil) → sessiz
 *     yok say; sendMessage HİÇ çağrılmaz.
 *  2. Yetkili kullanıcı (TELEGRAM_CHAT_ID) → komut işlenir.
 *  3. Kanal/grup (negatif id) yayın hedefi → dokunulmaz (filtre atlar).
 */

const axios = require('axios');
jest.mock('axios');

process.env.TELEGRAM_BOT_TOKEN = 'test:token';
process.env.TELEGRAM_CHAT_ID = '2116638354';   // yetkili kullanıcı

const telegram = require('../../src/services/telegramService');

function updatesResponse(updates) {
  return { data: { ok: true, result: updates } };
}
const msg = (chatId, text) => ({
  update_id: Math.floor(Math.random() * 1e9),
  message: { chat: { id: chatId }, from: { first_name: 'X', id: chatId }, text },
});

beforeEach(() => {
  axios.get.mockReset();
  axios.post.mockReset().mockResolvedValue({ data: { ok: true, result: { message_id: 1 } } });
});

describe('Telegram spam koruması (yetkisiz DM sessiz)', () => {
  test('yabancı DM (Rusça spam) HİÇBİR yanıt almaz', async () => {
    axios.get.mockResolvedValueOnce(updatesResponse([
      msg(999888777, '/start'),                 // yabancı
      msg(555444333, 'БОТЫ для Пробива'),        // Rusça spam
      msg(111222333, '/help'),                   // yabancı komut
    ]));
    await telegram.processUpdates();
    // Hiçbir yabancıya sendMessage çağrılmadı (getMe/getUpdates GET; POST = sendMessage)
    expect(axios.post).not.toHaveBeenCalled();
  });

  test('yetkili kullanıcının komutu İŞLENİR', async () => {
    axios.get.mockResolvedValue(updatesResponse([msg(2116638354, '/site')]));
    await telegram.processUpdates();
    // Yetkili → en az bir sendMessage (POST) gitti
    expect(axios.post).toHaveBeenCalled();
    const url = axios.post.mock.calls[0][0];
    expect(String(url)).toContain('sendMessage');
  });

  test('kanal/grup (negatif id) filtreye takılmaz', async () => {
    // Negatif id yayın hedefi; bilinmeyen komut değil ama filtre onu ATLAMAMALI.
    // /start ile yanıt tetiklenmese de filtre `continue` etmemeli — kod yolu
    // negatif id'yi yetkisiz saymaz.
    axios.get.mockResolvedValue(updatesResponse([msg(-1004435146032, '/start')]));
    await telegram.processUpdates();
    // Kanala /start → cmdStart çağrılır (POST). Filtre negatifleri geçirir.
    expect(axios.post).toHaveBeenCalled();
  });

  test('kaynak: filtre TELEGRAM_CHAT_ID ile yetki kontrolü yapar', () => {
    const src = require('fs').readFileSync(
      require.resolve('../../src/services/telegramService.js'), 'utf8');
    const fn = src.slice(src.indexOf('async function processUpdates'));
    const govde = fn.slice(0, fn.indexOf('\n}\n'));
    expect(govde).toContain('chatId > 0');
    expect(govde).toContain('TELEGRAM_CHAT_ID');
  });
});
