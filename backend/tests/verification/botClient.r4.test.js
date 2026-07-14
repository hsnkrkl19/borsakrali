jest.mock('axios');
jest.mock('../../src/utils/logger', () => ({ warn: jest.fn() }));

delete process.env.BOT_API_URL;
delete process.env.BOT_API_TOKEN;
const axios = require('axios');
const botClient = require('../../src/services/botClient');

describe('Altın Botu R4 HTTP client', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    axios.get.mockResolvedValue({ data: { ok: true } });
  });

  test('uses the dedicated HTTPS tunnel and forwards only the verified admin bearer', async () => {
    await botClient.get('/api/status', undefined, 'Bearer admin-session');

    expect(axios.get).toHaveBeenCalledWith(
      'https://botapi.borsakrali.com/api/status',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer admin-session' }),
      }),
    );
    expect(axios.get.mock.calls[0][1].headers['X-Auth-Token']).toBeUndefined();
  });
});
