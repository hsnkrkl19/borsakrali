const fs = require('fs');
const path = require('path');

const DEVICES_FILE = path.join(__dirname, '../data/push-devices.json');
const DEFAULT_TOPIC = process.env.FCM_BROADCAST_TOPIC || 'borsakrali-all-users';
const DEFAULT_CHANNEL_ID = process.env.FCM_DEFAULT_CHANNEL_ID || 'borsa-krali-announcements';

let firebaseAdmin = null;
let firebaseApp = null;

function safeTrim(value, maxLength = 500) {
  return String(value || '').trim().slice(0, maxLength);
}

function ensureStoreShape(parsed) {
  return {
    devices: parsed?.devices && typeof parsed.devices === 'object' ? parsed.devices : {},
    lastBroadcast: parsed?.lastBroadcast || null,
  };
}

function readStore() {
  try {
    if (!fs.existsSync(DEVICES_FILE)) {
      return ensureStoreShape();
    }

    const raw = fs.readFileSync(DEVICES_FILE, 'utf8');
    return ensureStoreShape(JSON.parse(raw));
  } catch (error) {
    console.error('[PUSH] Store read error:', error.message);
    return ensureStoreShape();
  }
}

function writeStore(data) {
  try {
    const dir = path.dirname(DEVICES_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(DEVICES_FILE, JSON.stringify(ensureStoreShape(data), null, 2), 'utf8');
  } catch (error) {
    console.error('[PUSH] Store write error:', error.message);
  }
}

function parseServiceAccount() {
  const inlineJson = safeTrim(process.env.FIREBASE_SERVICE_ACCOUNT_JSON, 50000);
  if (inlineJson) {
    return JSON.parse(inlineJson);
  }

  const base64Value = safeTrim(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64, 50000);
  if (base64Value) {
    return JSON.parse(Buffer.from(base64Value, 'base64').toString('utf8'));
  }

  return null;
}

function getFirebaseAdmin() {
  if (!firebaseAdmin) {
    firebaseAdmin = require('firebase-admin');
  }

  return firebaseAdmin;
}

function ensureFirebaseApp() {
  try {
    if (firebaseApp) {
      return { success: true, app: firebaseApp };
    }

    const serviceAccount = parseServiceAccount();
    if (!serviceAccount) {
      return {
        success: false,
        error: 'Firebase service account tanimli degil. Render env degiskenlerini kontrol edin.',
        statusCode: 503,
      };
    }

    const admin = getFirebaseAdmin();
    firebaseApp = admin.apps.length
      ? admin.app()
      : admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });

    return { success: true, app: firebaseApp };
  } catch (error) {
    console.error('[PUSH] Firebase init error:', error.message);
    return {
      success: false,
      error: `Firebase baslatilamadi: ${error.message}`,
      statusCode: 500,
    };
  }
}

function normalizePath(pathValue) {
  const value = safeTrim(pathValue, 300);
  if (!value) return '';
  if (/^https?:\/\//i.test(value)) return value;
  return value.startsWith('/') ? value : `/${value}`;
}

function buildDeviceRecord(existingRecord, payload) {
  const now = new Date().toISOString();
  return {
    token: payload.pushToken,
    topic: payload.topic || DEFAULT_TOPIC,
    platform: safeTrim(payload.platform || 'android', 50),
    appVersion: safeTrim(payload.appVersion || '', 50),
    bundleId: safeTrim(payload.bundleId || '', 120),
    deviceId: safeTrim(payload.deviceId || '', 160),
    userId: payload.user?.id || null,
    email: payload.user?.email || null,
    role: payload.user?.role || null,
    registeredAt: existingRecord?.registeredAt || now,
    updatedAt: now,
  };
}

async function registerDevice(payload) {
  const pushToken = safeTrim(payload.pushToken, 5000);
  if (!pushToken) {
    return { success: false, error: 'Push token gerekli', statusCode: 400 };
  }

  const firebaseState = ensureFirebaseApp();
  if (!firebaseState.success) {
    return firebaseState;
  }

  try {
    const topic = safeTrim(payload.topic, 120) || DEFAULT_TOPIC;
    const admin = getFirebaseAdmin();
    await admin.messaging().subscribeToTopic([pushToken], topic);

    const store = readStore();
    store.devices[pushToken] = buildDeviceRecord(store.devices[pushToken], {
      ...payload,
      pushToken,
      topic,
    });
    writeStore(store);

    return {
      success: true,
      topic,
      channelId: DEFAULT_CHANNEL_ID,
      registeredDeviceCount: Object.keys(store.devices).length,
      message: 'Push bildirimi kaydi tamamlandi',
    };
  } catch (error) {
    console.error('[PUSH] Register error:', error.message);
    return {
      success: false,
      error: `Push token kaydi basarisiz: ${error.message}`,
      statusCode: 500,
    };
  }
}

async function unregisterDevice(payload) {
  const pushToken = safeTrim(payload.pushToken, 5000);
  if (!pushToken) {
    return { success: false, error: 'Push token gerekli', statusCode: 400 };
  }

  const firebaseState = ensureFirebaseApp();
  if (!firebaseState.success) {
    return firebaseState;
  }

  try {
    const topic = safeTrim(payload.topic, 120) || DEFAULT_TOPIC;
    const admin = getFirebaseAdmin();
    await admin.messaging().unsubscribeFromTopic([pushToken], topic);

    const store = readStore();
    delete store.devices[pushToken];
    writeStore(store);

    return {
      success: true,
      topic,
      registeredDeviceCount: Object.keys(store.devices).length,
      message: 'Push bildirimi kaydi kaldirildi',
    };
  } catch (error) {
    console.error('[PUSH] Unregister error:', error.message);
    return {
      success: false,
      error: `Push token silinemedi: ${error.message}`,
      statusCode: 500,
    };
  }
}

async function broadcastNotification(payload) {
  const title = safeTrim(payload.title, 120);
  const body = safeTrim(payload.body, 500);

  if (!title || !body) {
    return {
      success: false,
      error: 'Bildirim basligi ve mesaji zorunludur',
      statusCode: 400,
    };
  }

  const firebaseState = ensureFirebaseApp();
  if (!firebaseState.success) {
    return firebaseState;
  }

  try {
    const topic = safeTrim(payload.topic, 120) || DEFAULT_TOPIC;
    const channelId = safeTrim(payload.channelId, 120) || DEFAULT_CHANNEL_ID;
    const pathValue = normalizePath(payload.path);
    const externalUrl = safeTrim(payload.url, 500);

    const data = Object.fromEntries(
      Object.entries({
        path: pathValue && !/^https?:\/\//i.test(pathValue) ? pathValue : '',
        url: /^https?:\/\//i.test(pathValue) ? pathValue : externalUrl,
        senderEmail: safeTrim(payload.sender?.email, 200),
        sentAt: new Date().toISOString(),
      }).filter(([, value]) => value)
    );

    const admin = getFirebaseAdmin();
    const message = {
      topic,
      notification: { title, body },
      data,
      android: {
        priority: 'high',
        notification: {
          channelId,
          sound: 'default',
        },
      },
    };

    const messageId = await admin.messaging().send(message, Boolean(payload.dryRun));

    const store = readStore();
    store.lastBroadcast = {
      title,
      body,
      topic,
      channelId,
      path: data.path || data.url || '',
      dryRun: Boolean(payload.dryRun),
      sentBy: payload.sender?.email || null,
      sentAt: new Date().toISOString(),
      messageId,
    };
    writeStore(store);

    return {
      success: true,
      message: Boolean(payload.dryRun)
        ? 'Deneme bildirimi basariyla hazirlandi'
        : 'Bildirim tum uygulamalara gonderildi',
      messageId,
      topic,
      channelId,
      registeredDeviceCount: Object.keys(store.devices).length,
    };
  } catch (error) {
    console.error('[PUSH] Broadcast error:', error.message);
    return {
      success: false,
      error: `Bildirim gonderilemedi: ${error.message}`,
      statusCode: 500,
    };
  }
}

function getSummary() {
  const store = readStore();
  const firebaseState = ensureFirebaseApp();
  const devices = Object.values(store.devices);

  return {
    success: true,
    configured: firebaseState.success,
    configurationMessage: firebaseState.success
      ? 'Firebase push servisi hazir'
      : firebaseState.error,
    topic: DEFAULT_TOPIC,
    channelId: DEFAULT_CHANNEL_ID,
    registeredDeviceCount: devices.length,
    linkedUserCount: devices.filter((device) => device.userId).length,
    lastRegistrationAt: devices
      .map((device) => device.updatedAt)
      .sort()
      .reverse()[0] || null,
    lastBroadcast: store.lastBroadcast,
  };
}

module.exports = {
  DEFAULT_CHANNEL_ID,
  DEFAULT_TOPIC,
  getSummary,
  registerDevice,
  unregisterDevice,
  broadcastNotification,
};
