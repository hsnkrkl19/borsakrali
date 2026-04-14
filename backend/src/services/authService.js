/**
 * Auth Service - BORSA KRALI
 * Local encrypted user store + JWT auth helpers
 */

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const MACHINE_GUID = process.env.AUTH_MACHINE_GUID || '6B226280-2CE2-11ED-B3FC-1D6D8A441B00';
const ENC_KEY = crypto.createHash('sha256')
  .update(process.env.AUTH_ENCRYPTION_SECRET || (MACHINE_GUID + '-BORSA-KRALI-SECURE-2024'))
  .digest();

const JWT_SECRET = process.env.JWT_SECRET || crypto.createHash('sha256')
  .update(MACHINE_GUID + '-JWT-SECRET-BORSA-2024')
  .digest('hex');

const USERS_FILE = path.join(__dirname, '../data/users.enc');
const DELETION_REQUESTS_FILE = path.join(__dirname, '../data/account-deletion-requests.json');

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

const ADMIN_EMAILS = new Set(
  String(process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((item) => normalizeEmail(item))
    .filter(Boolean)
);

function sanitizeName(value) {
  return String(value || '').trim();
}

function getUserRole(user) {
  if (!user) return 'user';
  if (user.role) return user.role;
  if (ADMIN_EMAILS.has(normalizeEmail(user.email))) return 'admin';
  return 'user';
}

function buildSafeUser(user) {
  return {
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    phone: user.phone || null,
    email: user.email,
    plan: user.plan || 'free',
    planExpiry: user.planExpiry || null,
    role: getUserRole(user),
  };
}

function createToken(user) {
  return jwt.sign(
    {
      userId: user.id,
      email: user.email,
      firstName: user.firstName,
      role: getUserRole(user),
      sessionVersion: user.sessionVersion || 0,
    },
    JWT_SECRET,
    { expiresIn: '30d' }
  );
}

function validatePasswordStrength(password) {
  const value = String(password || '');

  if (value.length < 8) {
    return 'Sifre en az 8 karakter olmali';
  }

  if (value.length > 128) {
    return 'Sifre en fazla 128 karakter olabilir';
  }

  if (!/[a-z]/.test(value)) {
    return 'Sifre en az bir kucuk harf icermeli';
  }

  if (!/[A-Z]/.test(value)) {
    return 'Sifre en az bir buyuk harf icermeli';
  }

  if (!/\d/.test(value)) {
    return 'Sifre en az bir rakam icermeli';
  }

  return null;
}

function encryptData(data) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', ENC_KEY, iv);
  const json = JSON.stringify(data);
  const encrypted = Buffer.concat([cipher.update(json, 'utf8'), cipher.final()]);

  return JSON.stringify({
    iv: iv.toString('hex'),
    data: encrypted.toString('hex'),
    _sig: crypto.createHmac('sha256', ENC_KEY).update(encrypted).digest('hex'),
  });
}

function decryptData(content) {
  try {
    const parsed = JSON.parse(content);
    const encBuf = Buffer.from(parsed.data, 'hex');
    const sig = crypto.createHmac('sha256', ENC_KEY).update(encBuf).digest('hex');

    if (sig !== parsed._sig) {
      throw new Error('HMAC mismatch');
    }

    const decipher = crypto.createDecipheriv('aes-256-cbc', ENC_KEY, Buffer.from(parsed.iv, 'hex'));
    const decrypted = Buffer.concat([decipher.update(encBuf), decipher.final()]);
    return JSON.parse(decrypted.toString('utf8'));
  } catch (error) {
    return null;
  }
}

function readDB() {
  try {
    if (fs.existsSync(USERS_FILE)) {
      const content = fs.readFileSync(USERS_FILE, 'utf8');
      const decrypted = decryptData(content);
      if (decrypted) {
        return decrypted;
      }
    }

    const oldFile = path.join(__dirname, '../data/users.json');
    if (fs.existsSync(oldFile)) {
      const oldData = JSON.parse(fs.readFileSync(oldFile, 'utf8'));
      writeDB(oldData);
      return oldData;
    }
  } catch (error) {
    console.error('[AUTH] DB okuma hatasi:', error.message);
  }

  return { users: [] };
}

function writeDB(data) {
  const dir = path.dirname(USERS_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

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
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(DELETION_REQUESTS_FILE, JSON.stringify(data, null, 2), 'utf8');
}

async function initiateLogin(emailOrUsername, password) {
  const db = readDB();
  const normalizedEmail = normalizeEmail(emailOrUsername);
  const user = db.users.find((item) => item.email.toLowerCase() === normalizedEmail);

  if (!user) {
    return { success: false, error: 'Kullanici bulunamadi!' };
  }

  const isValidPassword = await bcrypt.compare(password, user.password);
  if (!isValidPassword) {
    return { success: false, error: 'Sifre hatali!' };
  }

  return {
    success: true,
    token: createToken(user),
    user: buildSafeUser(user),
  };
}

function verifyToken(token) {
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const db = readDB();
    const user = db.users.find((item) => item.id === decoded.userId);

    if (!user) {
      return { success: false, error: 'Kullanici bulunamadi' };
    }

    const currentSessionVersion = user.sessionVersion || 0;
    const tokenSessionVersion = decoded.sessionVersion || 0;

    if (tokenSessionVersion !== currentSessionVersion) {
      return { success: false, error: 'Oturumun suresi doldu. Lutfen tekrar giris yapin' };
    }

    return {
      success: true,
      user: buildSafeUser(user),
    };
  } catch (error) {
    return { success: false, error: 'Gecersiz token' };
  }
}

function findUserByEmail(email) {
  const db = readDB();
  const normalizedEmail = normalizeEmail(email);
  return db.users.find((item) => item.email.toLowerCase() === normalizedEmail);
}

function getUserByToken(token) {
  const result = verifyToken(token);
  return result.success ? result.user : null;
}

function getAllUsers() {
  const db = readDB();
  return db.users.map((user) => ({
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    verified: true,
    createdAt: user.createdAt,
  }));
}

function getUserCount() {
  const db = readDB();
  return db.users.length;
}

async function registerFromWeb(userData) {
  const db = readDB();
  const normalizedEmail = normalizeEmail(userData.email);
  const firstName = sanitizeName(userData.firstName);
  const lastName = sanitizeName(userData.lastName);
  const phone = userData.phone || null;
  const password = String(userData.password || '');
  const passwordError = validatePasswordStrength(password);

  if (passwordError) {
    return { success: false, error: passwordError };
  }

  if (!userData.acceptTerms || !userData.acceptPrivacy) {
    return {
      success: false,
      error: 'Kayit icin kullanim kosullari ve gizlilik politikasini onaylamalisiniz',
    };
  }

  const existingEmail = db.users.find((user) => user.email.toLowerCase() === normalizedEmail);
  if (existingEmail) {
    return { success: false, error: 'Bu e-posta adresi zaten kayitli!' };
  }

  if (phone) {
    const existingPhone = db.users.find((user) => user.phone === phone);
    if (existingPhone) {
      return { success: false, error: 'Bu telefon numarasi zaten kayitli!' };
    }
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  const userId = 'BK' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).substring(2, 6).toUpperCase();
  const emailVerifyCode = Math.floor(100000 + Math.random() * 900000).toString();
  const emailVerifyExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const acceptedAt = new Date().toISOString();

  const newUser = {
    id: userId,
    firstName,
    lastName,
    phone,
    username: normalizedEmail.split('@')[0],
    email: normalizedEmail,
    password: hashedPassword,
    emailVerified: false,
    emailVerifyCode,
    emailVerifyExpiry,
    createdAt: acceptedAt,
    passwordChangedAt: null,
    sessionVersion: 0,
    termsAcceptedAt: acceptedAt,
    privacyAcceptedAt: acceptedAt,
    registeredFrom: 'web',
    plan: 'free',
    planExpiry: null,
    planPurchaseDate: null,
    monthlyUsageCount: 0,
    monthlyUsageReset: null,
    role: 'user',
  };

  db.users.push(newUser);
  writeDB(db);

  return {
    success: true,
    userId: newUser.id,
    message: 'Kayit basarili! Giris yapabilirsiniz.',
  };
}

async function changePassword(userId, currentPassword, newPassword) {
  const db = readDB();
  const userIndex = db.users.findIndex((user) => user.id === userId);

  if (userIndex === -1) {
    return { success: false, error: 'Kullanici bulunamadi' };
  }

  const user = db.users[userIndex];
  const currentMatches = await bcrypt.compare(currentPassword, user.password);

  if (!currentMatches) {
    return { success: false, error: 'Mevcut sifre hatali' };
  }

  const passwordError = validatePasswordStrength(newPassword);
  if (passwordError) {
    return { success: false, error: passwordError };
  }

  const isSamePassword = await bcrypt.compare(newPassword, user.password);
  if (isSamePassword) {
    return { success: false, error: 'Yeni sifre mevcut sifre ile ayni olamaz' };
  }

  db.users[userIndex].password = await bcrypt.hash(newPassword, 10);
  db.users[userIndex].passwordChangedAt = new Date().toISOString();
  db.users[userIndex].sessionVersion = (db.users[userIndex].sessionVersion || 0) + 1;
  writeDB(db);

  const updatedUser = db.users[userIndex];

  return {
    success: true,
    token: createToken(updatedUser),
    user: buildSafeUser(updatedUser),
    message: 'Sifreniz basariyla guncellendi',
  };
}

function updateUserPlan(userId, plan, expiry = null) {
  const db = readDB();
  const index = db.users.findIndex((user) => user.id === userId);

  if (index === -1) {
    return { success: false, error: 'Kullanici bulunamadi' };
  }

  db.users[index].plan = plan;
  db.users[index].planExpiry = expiry;
  db.users[index].planPurchaseDate = new Date().toISOString();

  if (plan === 'elite_once' || plan === 'premium_once') {
    db.users[index].monthlyUsageCount = 0;
    db.users[index].monthlyUsageReset = new Date().toISOString();
  }

  writeDB(db);
  return { success: true };
}

function getSubscriptionStatus(userId) {
  const db = readDB();
  const user = db.users.find((item) => item.id === userId);

  if (!user) {
    return null;
  }

  const plan = user.plan || 'free';
  const now = new Date();

  if ((plan === 'starter_monthly' || plan === 'pro_monthly') && user.planExpiry) {
    const expiry = new Date(user.planExpiry);
    if (now > expiry) {
      const index = db.users.findIndex((item) => item.id === userId);
      db.users[index].plan = 'free';
      db.users[index].planExpiry = null;
      writeDB(db);
      return { plan: 'free', planExpiry: null, isActive: false };
    }
  }

  let monthlyUsage = user.monthlyUsageCount || 0;
  if ((plan === 'elite_once' || plan === 'premium_once') && user.monthlyUsageReset) {
    const resetDate = new Date(user.monthlyUsageReset);
    const currentMonth = now.getFullYear() * 12 + now.getMonth();
    const resetMonth = resetDate.getFullYear() * 12 + resetDate.getMonth();

    if (currentMonth > resetMonth) {
      monthlyUsage = 0;
      const index = db.users.findIndex((item) => item.id === userId);
      db.users[index].monthlyUsageCount = 0;
      db.users[index].monthlyUsageReset = now.toISOString();
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
  const normalizedEmail = normalizeEmail(email);

  if (!normalizedEmail) {
    return { success: false, error: 'E-posta gerekli' };
  }

  const db = readDB();
  const user = db.users.find((item) => item.email.toLowerCase() === normalizedEmail);
  const requests = readDeletionRequests();

  requests.requests.unshift({
    id: `DEL-${Date.now().toString(36).toUpperCase()}`,
    email: normalizedEmail,
    userId: user?.id || null,
    note: String(note || '').trim().slice(0, 1000),
    status: 'pending',
    createdAt: new Date().toISOString(),
  });

  writeDeletionRequests(requests);

  return {
    success: true,
    message: 'Hesap silme talebiniz alindi. En kisa surede isleme alinacaktir.',
  };
}

function deleteUserAccount(userId) {
  const db = readDB();
  const index = db.users.findIndex((user) => user.id === userId);

  if (index === -1) {
    return { success: false, error: 'Kullanici bulunamadi' };
  }

  const [deletedUser] = db.users.splice(index, 1);
  writeDB(db);

  return {
    success: true,
    userId,
    email: deletedUser.email,
  };
}

module.exports = {
  initiateLogin,
  verifyToken,
  findUserByEmail,
  getUserByToken,
  getAllUsers,
  getUserCount,
  getUserRole,
  validatePasswordStrength,
  registerFromWeb,
  changePassword,
  updateUserPlan,
  getSubscriptionStatus,
  createDeletionRequest,
  deleteUserAccount,
  readDB,
  writeDB,
};
