const express = require('express');
const request = require('supertest');

jest.mock('../../src/services/authService', () => ({
  verifyToken: jest.fn(),
}));
jest.mock('../../src/services/botClient', () => ({
  get: jest.fn(),
  post: jest.fn(),
}));
jest.mock('../../src/services/botCenter/notificationBotManager', () => ({
  summary: jest.fn(),
  setEnabled: jest.fn(),
}));
jest.mock('../../src/services/botCompetition/competitionManager', () => ({
  status: jest.fn(),
  setMasterEnabled: jest.fn(),
  setBotEnabled: jest.fn(),
}));

const authService = require('../../src/services/authService');
const botClient = require('../../src/services/botClient');
const notificationBotManager = require('../../src/services/botCenter/notificationBotManager');
const competitionManager = require('../../src/services/botCompetition/competitionManager');
const botRoutes = require('../../src/routes/bot.routes');

function app() {
  const instance = express();
  instance.use(express.json());
  instance.use('/api/bot', botRoutes);
  return instance;
}

describe('Altın Botu R4 admin proxy', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    authService.verifyToken.mockResolvedValue({
      success: true,
      user: { id: 'admin-1', role: 'admin' },
    });
    botClient.get.mockImplementation(async (path) => ({ ok: true, path }));
    botClient.post.mockImplementation(async (path, body) => ({ ok: true, path, body }));
    notificationBotManager.summary.mockReturnValue({ ok: true, total: 16, bots: [] });
    notificationBotManager.setEnabled.mockImplementation((id, enabled) => ({ id, enabled }));
    competitionManager.status.mockReturnValue({ ok: true, enabled: true, leaderboard: [] });
    competitionManager.setMasterEnabled.mockImplementation((enabled) => ({ ok: true, enabled }));
    competitionManager.setBotEnabled.mockImplementation((id, enabled) => ({ id, enabled }));
  });

  test('lists and toggles Telegram notification bots behind the same admin gate', async () => {
    const server = app();
    const headers = { Authorization: 'Bearer admin-token' };

    const list = await request(server)
      .get('/api/bot/notifications')
      .set(headers);
    const toggle = await request(server)
      .post('/api/bot/notifications/forex-signals')
      .set(headers)
      .send({ enabled: false });

    expect(list.status).toBe(200);
    expect(list.body.total).toBe(16);
    expect(toggle.status).toBe(200);
    expect(notificationBotManager.setEnabled).toHaveBeenCalledWith('forex-signals', false, 'admin-1');
  });

  test('manages the isolated Telegram bot competition behind the admin gate', async () => {
    const server = app();
    const headers = { Authorization: 'Bearer admin-token' };

    const list = await request(server).get('/api/bot/competition').set(headers);
    const pause = await request(server).post('/api/bot/competition').set(headers).send({ enabled: false });
    const bot = await request(server).post('/api/bot/competition/forex-signals').set(headers).send({ enabled: true });

    expect(list.status).toBe(200);
    expect(list.body.enabled).toBe(true);
    expect(pause.status).toBe(200);
    expect(competitionManager.setMasterEnabled).toHaveBeenCalledWith(false, 'admin-1');
    expect(bot.status).toBe(200);
    expect(competitionManager.setBotEnabled).toHaveBeenCalledWith('forex-signals', true, 'admin-1');
  });

  test('proxies account binding and research endpoints only after admin auth', async () => {
    const server = app();
    const headers = { Authorization: 'Bearer admin-token' };

    const bind = await request(server)
      .post('/api/bot/account/bind_current_demo')
      .set(headers)
      .send({ ignored: true });
    const researchStatus = await request(server)
      .get('/api/bot/research/status')
      .set(headers);
    const approve = await request(server)
      .post('/api/bot/research/approve')
      .set(headers)
      .send({ symbol_key: 'gold', strategy: 'gold_trend', reviewer: 'admin' });

    expect(bind.status).toBe(200);
    expect(botClient.post).toHaveBeenCalledWith('/api/account/bind_current_demo', undefined, 'Bearer admin-token');
    expect(researchStatus.status).toBe(200);
    expect(botClient.get).toHaveBeenCalledWith('/api/research/status', undefined, 'Bearer admin-token');
    expect(approve.status).toBe(200);
    expect(botClient.post).toHaveBeenCalledWith('/api/research/approve', {
      symbol_key: 'gold', strategy: 'gold_trend', reviewer: 'admin',
    }, 'Bearer admin-token');
  });

  test('exposes a data-free verifier for the VPS and never contacts the bot', async () => {
    const response = await request(app())
      .get('/api/bot/session/verify')
      .set('Authorization', 'Bearer admin-token');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true, role: 'admin', user_id: 'admin-1' });
    expect(botClient.get).not.toHaveBeenCalled();
    expect(botClient.post).not.toHaveBeenCalled();
  });

  test('preserves bot safety rejection details', async () => {
    const error = new Error('Request failed with status code 409');
    error.response = { status: 409, data: { detail: 'Açık bot pozisyonu varken hesap kilidi değiştirilemez.' } };
    botClient.post.mockRejectedValueOnce(error);

    const response = await request(app())
      .post('/api/bot/account/bind_current_demo')
      .set('Authorization', 'Bearer admin-token')
      .send({});

    expect(response.status).toBe(409);
    expect(response.body.error).toContain('Açık bot pozisyonu');
  });

  test('rejects non-admin users before contacting the VPS', async () => {
    authService.verifyToken.mockResolvedValueOnce({
      success: true,
      user: { id: 'user-1', role: 'premium' },
    });

    const response = await request(app())
      .get('/api/bot/status')
      .set('Authorization', 'Bearer user-token');

    expect(response.status).toBe(403);
    expect(botClient.get).not.toHaveBeenCalled();
  });
});
