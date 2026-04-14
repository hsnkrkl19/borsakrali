/**
 * Auth Service - BORSA KRALI
 * Makine bagimli sifreleme + JWT kimlik dogrulama
 * Per.Tgm. Hasan KIRKIL
 */

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Makineye ozgu sifreli anahtar
const MACHINE_GUID = '6B226280-2CE2-11ED-B3FC-1D6D8A441B00';
const ENC_KEY = crypto.createHash('sha256')
  .update(MACHINE_GUID + '-BORSA-KRALI-SECURE-2024')
  .digest(); // 32-byte AES-256 key

const JWT_SECRET = crypto.createHash('sha256')
  .update(MACHINE_GUID + '-JWT-SECRET-BORSA-2024')
  .digest('hex');

const USERS_FILE = path.join(__dirname, '../data/users.enc');
const DELETION_REQUESTS_FILE = path.join(__dirname, '../data/account-deletion-requests.json');

// AES-256-CBC ile sifrele
function encryptData(data) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', ENC_KEY, iv);
  const json = JSON.stringify(data);
  const encrypted = Buffer.concat([cipher.update(json, 'utf8'), cipher.final()]);
  return JSON.stringify({
    iv: iv.toString('hex'),
    data: encrypted.toString('hex'),
    _sig: crypto.createHmac('sha256', ENC_KEY).update(encrypted).digest('hex')
  });
}

// AES-256-CBC ile sifre coz
function decryptData(content) {
  try {
    const parsed = JSON.parse(content);
    const encBuf = Buffer.from(parsed.data, 'hex');
    // HMAC dogrulama
    const sig = crypto.createHmac('sha256', ENC_KEY).update(encBuf).digest('hex');
    if (sig !== parsed._sig) throw new Error('HMAC mismatch');
    const decipher = crypto.createDecipheriv('aes-256-cbc', ENC_KEY, Buffer.from(parsed.iv, 'hex'));
    const decrypted = Buffer.concat([decipher.update(encBuf), decipher.final()]);
    return JSON.parse(decrypted.toString('utf8'));
  } catch (e) {
    return null;
  }
}

// Veritabanini oku (sifreli)
function readDB() {
  try {
    if (fs.existsSync(USERS_FILE)) {
      const content = fs.readFileSync(USERS_FILE, 'utf8');
      const decrypted = decryptData(content);
      if (decrypted) return decrypted;
    }
    // Eski duz JSON dosyasindan goc
    const oldFile = path.join(__dirname, '../data/users.json');
    if (fs.existsSync(oldFile)) {
      const oldData = JSON.parse(fs.readFileSync(oldFile, 'utf8'));
      writeDB(oldData);
      return oldData;
    }
  } catch (e) {
    console.error('[AUTH] DB okuma hatasi:', e.message);
  }
  return { users: [] };
}

// Veritabanina yaz (sifreli)
function writeDB(data) {
  const dir = path.dirname(USERS_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(USERS_FILE, encryptData(data), 'utf8');
}

function readDeletionRequests() {
  try {
    if (!fs.existsSync(DELETION_REQUESTS_FILE)) {
      return { requests: [] };
    }

    const raw = fs.readFileSync(DELETION_REQUESTS_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed.requests) ? parsed : { requests: [] };
  } catch (error) {
    console.error('[AUTH] Deletion request okuma hatasi:', error.message);
    return { requests: [] };
  }
}

function writeDeletionRequests(data) {
  const dir = path.dirname(DELETION_REQUESTS_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(DELETION_REQUESTS_FILE, JSON.stringify(data, null, 2), 'utf8');
}

/**
 * Giris - Tek Adim (Sifre kontrolu + JWT donus)
 */
async function initiateLogin(emailOrUsername, password) {
  const db = readDB();

  const user = db.users.find(u =>
    u.email.toLowerCase() === emailOrUsername.toLowerCase()
  );

  if (!user) {
    return { success: false, error: 'Kullanici bulunamadi!' };
  }

  const isValidPassword = await bcrypt.compare(password, user.password);
  if (!isValidPassword) {
    return { success: false, error: 'Sifre hatali!' };
  }

  // JWT token olustur (30 gun)
  const token = jwt.sign(
    { userId: user.id, email: user.email, firstName: user.firstName },
    JWT_SECRET,
    { expiresIn: '30d' }
  );

  return {
    success: true,
    token,
    user: {
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      phone: user.phone || null,
      email: user.email,
      plan: user.plan || 'free',
      planExpiry: user.planExpiry || null,
    }
  };
}

/**
 * Token dogrulama
 */
function verifyToken(token) {
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const db = readDB();
    const user = db.users.find(u => u.id === decoded.userId);

    if (!user) {
      return { success: false, error: 'Kullanici bulunamadi' };
    }

    return {
      success: true,
      user: {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        phone: user.phone || null,
        email: user.email,
        plan: user.plan || 'free',
        planExpiry: user.planExpiry || null,
      }
    };
  } catch (error) {
    return { success: false, error: 'Gecersiz token' };
  }
}

/**
 * E-posta ile kullanici bul
 */
function findUserByEmail(email) {
  const db = readDB();
  return db.users.find(u => u.email.toLowerCase() === email.toLowerCase());
}

/**
 * Tum kullanicilari getir (admin icin)
 */
function getAllUsers() {
  const db = readDB();
  return db.users.map(u => ({
    id: u.id,
    firstName: u.firstName,
    lastName: u.lastName,
    email: u.email,
    verified: true,
    createdAt: u.createdAt
  }));
}

/**
 * Kullanici sayisi
 */
function getUserCount() {
  const db = readDB();
  return db.users.length;
}

/**
 * Web uzerinden kayit (Telegram gerektirmez)
 */
async function registerFromWeb(userData) {
  const db = readDB();
  const { firstName, lastName, phone, email, password } = userData;

  // Email kontrolu (case-insensitive)
  const existingEmail = db.users.find(u => u.email.toLowerCase() === email.toLowerCase());
  if (existingEmail) {
    return { success: false, error: 'Bu e-posta adresi zaten kayıtlı!' };
  }

  // Telefon kontrolu
  if (phone) {
    const existingPhone = db.users.find(u => u.phone === phone);
    if (existingPhone) {
      return { success: false, error: 'Bu telefon numarası zaten kayıtlı!' };
    }
  }

  // Sifre hashleme
  const hashedPassword = await bcrypt.hash(password, 10);
  const userId = 'BK' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).substring(2, 6).toUpperCase();

  // Mail dogrulama kodu (6 haneli, 24 saat gecerli)
  const emailVerifyCode = Math.floor(100000 + Math.random() * 900000).toString();
  const emailVerifyExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  const newUser = {
    id: userId,
    firstName,
    lastName,
    phone: phone || null,
    username: email.split('@')[0],
    email: email.toLowerCase(),
    password: hashedPassword,
    emailVerified: false,
    emailVerifyCode,
    emailVerifyExpiry,
    createdAt: new Date().toISOString(),
    registeredFrom: 'web',
    // Abonelik sistemi
    plan: 'free',
    planExpiry: null,
    planPurchaseDate: null,
    monthlyUsageCount: 0,
    monthlyUsageReset: null,
  };

  db.users.push(newUser);
  writeDB(db);

  return {
    success: true,
    userId: newUser.id,
    message: 'Kayıt başarılı! Giriş yapabilirsiniz.'
  };
}

/**
 * Kullanicinin plan durumunu guncelle
 */
function updateUserPlan(userId, plan, expiry = null) {
  const db = readDB();
  const idx = db.users.findIndex(u => u.id === userId);
  if (idx === -1) return { success: false, error: 'Kullanici bulunamadi' };
  db.users[idx].plan = plan;
  db.users[idx].planExpiry = expiry;
  db.users[idx].planPurchaseDate = new Date().toISOString();
  if (plan === 'elite_once' || plan === 'premium_once') {
    db.users[idx].monthlyUsageCount = 0;
    db.users[idx].monthlyUsageReset = new Date().toISOString();
  }
  writeDB(db);
  return { success: true };
}

/**
 * Kullanicinin abonelik durumu
 */
function getSubscriptionStatus(userId) {
  const db = readDB();
  const user = db.users.find(u => u.id === userId);
  if (!user) return null;

  const plan = user.plan || 'free';
  const now = new Date();

  // Monthly plan expiry check
  if ((plan === 'starter_monthly' || plan === 'pro_monthly') && user.planExpiry) {
    const expiry = new Date(user.planExpiry);
    if (now > expiry) {
      // Expired — downgrade to free
      const idx = db.users.findIndex(u => u.id === userId);
      db.users[idx].plan = 'free';
      db.users[idx].planExpiry = null;
      writeDB(db);
      return { plan: 'free', planExpiry: null, isActive: false };
    }
  }

  // Monthly usage reset for once plans
  let monthlyUsage = user.monthlyUsageCount || 0;
  if ((plan === 'elite_once' || plan === 'premium_once') && user.monthlyUsageReset) {
    const resetDate = new Date(user.monthlyUsageReset);
    const currentMonth = now.getFullYear() * 12 + now.getMonth();
    const resetMonth = resetDate.getFullYear() * 12 + resetDate.getMonth();
    if (currentMonth > resetMonth) {
      monthlyUsage = 0;
      const idx = db.users.findIndex(u => u.id === userId);
      db.users[idx].monthlyUsageCount = 0;
      db.users[idx].monthlyUsageReset = now.toISOString();
      writeDB(db);
    }
  }

  return {
    plan,
    planExpiry: user.planExpiry || null,
    planPurchaseDate: user.planPurchaseDate || null,
    monthlyUsageCount: monthlyUsage,
    isActive: true,
  };
}

function createDeletionRequest({ email, note = '' }) {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (!normalizedEmail) {
    return { success: false, error: 'E-posta gerekli' };
  }

  const db = readDB();
  const user = db.users.find(u => u.email.toLowerCase() === normalizedEmail);
  const requests = readDeletionRequests();

  requests.requests.unshift({
    id: `DEL-${Date.now().toString(36).toUpperCase()}`,
    email: normalizedEmail,
    userId: user?.id || null,
    note: String(note || '').trim().slice(0, 1000),
    status: 'pending',
    createdAt: new Date().toISOString()
  });

  writeDeletionRequests(requests);

  return {
    success: true,
    message: 'Hesap silme talebiniz alindi. En kisa surede isleme alinacaktir.'
  };
}

function deleteUserAccount(userId) {
  const db = readDB();
  const idx = db.users.findIndex(u => u.id === userId);

  if (idx === -1) {
    return { success: false, error: 'Kullanici bulunamadi' };
  }

  const [deletedUser] = db.users.splice(idx, 1);
  writeDB(db);

  return {
    success: true,
    userId,
    email: deletedUser.email
  };
}

module.exports = {
  initiateLogin,
  verifyToken,
  findUserByEmail,
  getAllUsers,
  getUserCount,
  registerFromWeb,
  updateUserPlan,
  getSubscriptionStatus,
  createDeletionRequest,
  deleteUserAccount,
  readDB,
  writeDB
};
