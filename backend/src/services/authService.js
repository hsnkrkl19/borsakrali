/**
 * Auth Service - BORSA KRALI (Supabase-backed)
 *
 * Wraps the Supabase admin client. Public API kept compatible with the
 * previous file-encrypted implementation so callers don't need rewrites
 * beyond awaiting verifyToken().
 *
 * - User identity: stored in auth.users (Supabase Auth)
 * - User profile (plan, role, name, phone): stored in public.profiles
 *   (auto-created via trigger on signup; see backend/sql/001_initial_schema.sql)
 */

const { supabaseAdmin, isSupabaseEnabled } = require('../lib/supabase');

function ensureSupabase() {
  if (!isSupabaseEnabled()) {
    const err = new Error('Supabase is not configured. Set SUPABASE_URL and SUPABASE_SECRET_KEY.');
    err.code = 'SUPABASE_DISABLED';
    throw err;
  }
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function sanitizeName(value) {
  return String(value || '').trim();
}

const ADMIN_EMAILS = new Set(
  String(process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((item) => normalizeEmail(item))
    .filter(Boolean)
);

function getUserRole(user) {
  if (!user) return 'user';
  if (user.role && user.role !== 'user') return user.role;
  if (ADMIN_EMAILS.has(normalizeEmail(user.email))) return 'admin';
  return user.role || 'user';
}

function buildSafeUser(authUser, profile) {
  const meta = authUser?.user_metadata || {};
  const firstName = profile?.first_name || meta.first_name || meta.firstName || '';
  const lastName  = profile?.last_name  || meta.last_name  || meta.lastName  || '';
  const phone     = profile?.phone      || meta.phone      || null;

  const merged = {
    id: authUser.id,
    email: authUser.email,
    firstName,
    lastName,
    phone,
    plan: profile?.plan || 'free',
    planExpiry: profile?.plan_expiry || null,
    role: profile?.role || 'user',
  };

  return {
    ...merged,
    role: getUserRole(merged),
  };
}

function validatePasswordStrength(password) {
  const value = String(password || '');
  if (value.length < 8) return 'Sifre en az 8 karakter olmali';
  if (value.length > 128) return 'Sifre en fazla 128 karakter olabilir';
  if (!/[a-z]/.test(value)) return 'Sifre en az bir kucuk harf icermeli';
  if (!/[A-Z]/.test(value)) return 'Sifre en az bir buyuk harf icermeli';
  if (!/\d/.test(value)) return 'Sifre en az bir rakam icermeli';
  return null;
}

async function fetchProfile(userId) {
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    console.error('[AUTH] profile fetch error:', error.message);
    return null;
  }
  return data;
}

async function registerFromWeb(userData) {
  ensureSupabase();

  const email = normalizeEmail(userData.email);
  const firstName = sanitizeName(userData.firstName);
  const lastName = sanitizeName(userData.lastName);
  const phone = userData.phone || null;
  const password = String(userData.password || '');

  const passwordError = validatePasswordStrength(password);
  if (passwordError) return { success: false, error: passwordError };

  if (!userData.acceptTerms || !userData.acceptPrivacy) {
    return {
      success: false,
      error: 'Kayit icin kullanim kosullari ve gizlilik politikasini onaylamalisiniz',
    };
  }

  if (phone) {
    const { data: dupPhone } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('phone', phone)
      .maybeSingle();

    if (dupPhone) {
      return { success: false, error: 'Bu telefon numarasi zaten kayitli!' };
    }
  }

  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      first_name: firstName,
      last_name: lastName,
      phone,
    },
  });

  if (error) {
    if (/already registered|already been registered|duplicate/i.test(error.message)) {
      return { success: false, error: 'Bu e-posta adresi zaten kayitli!' };
    }
    return { success: false, error: error.message };
  }

  return {
    success: true,
    userId: data.user.id,
    message: 'Kayit basarili! Giris yapabilirsiniz.',
  };
}

async function initiateLogin(emailOrUsername, password) {
  ensureSupabase();

  const email = normalizeEmail(emailOrUsername);

  const { data, error } = await supabaseAdmin.auth.signInWithPassword({
    email,
    password,
  });

  if (error || !data?.session) {
    if (/invalid login credentials/i.test(error?.message || '')) {
      return { success: false, error: 'E-posta veya sifre hatali!' };
    }
    if (/email not confirmed/i.test(error?.message || '')) {
      return { success: false, error: 'E-posta adresiniz dogrulanmamis.' };
    }
    return { success: false, error: error?.message || 'Giris basarisiz' };
  }

  const profile = await fetchProfile(data.user.id);

  return {
    success: true,
    token: data.session.access_token,
    refreshToken: data.session.refresh_token,
    expiresAt: data.session.expires_at,
    user: buildSafeUser(data.user, profile),
  };
}

async function verifyToken(token) {
  ensureSupabase();

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data?.user) {
    return { success: false, error: 'Gecersiz token' };
  }

  const profile = await fetchProfile(data.user.id);
  return {
    success: true,
    user: buildSafeUser(data.user, profile),
  };
}

async function findUserByEmail(email) {
  ensureSupabase();
  const normalized = normalizeEmail(email);

  // listUsers + filter is the supported approach (no admin getUserByEmail in JS SDK)
  const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) return null;

  const authUser = data.users.find((u) => normalizeEmail(u.email) === normalized);
  if (!authUser) return null;

  const profile = await fetchProfile(authUser.id);
  return buildSafeUser(authUser, profile);
}

async function getUserByToken(token) {
  const result = await verifyToken(token);
  return result.success ? result.user : null;
}

async function getAllUsers() {
  ensureSupabase();
  const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) return [];

  return data.users.map((u) => ({
    id: u.id,
    firstName: u.user_metadata?.first_name || u.user_metadata?.firstName || '',
    lastName:  u.user_metadata?.last_name  || u.user_metadata?.lastName  || '',
    email: u.email,
    verified: !!u.email_confirmed_at,
    createdAt: u.created_at,
  }));
}

async function getUserCount() {
  ensureSupabase();
  const { count, error } = await supabaseAdmin
    .from('profiles')
    .select('*', { count: 'exact', head: true });

  if (error) return 0;
  return count || 0;
}

async function changePassword(userId, currentPassword, newPassword) {
  ensureSupabase();

  const passwordError = validatePasswordStrength(newPassword);
  if (passwordError) return { success: false, error: passwordError };

  // Verify current password by re-authenticating
  const { data: authUser, error: getErr } = await supabaseAdmin.auth.admin.getUserById(userId);
  if (getErr || !authUser?.user) {
    return { success: false, error: 'Kullanici bulunamadi' };
  }

  const { error: signInErr } = await supabaseAdmin.auth.signInWithPassword({
    email: authUser.user.email,
    password: currentPassword,
  });

  if (signInErr) {
    return { success: false, error: 'Mevcut sifre hatali' };
  }

  if (currentPassword === newPassword) {
    return { success: false, error: 'Yeni sifre mevcut sifre ile ayni olamaz' };
  }

  const { data, error } = await supabaseAdmin.auth.admin.updateUserById(userId, {
    password: newPassword,
  });

  if (error) return { success: false, error: error.message };

  // Re-issue session with the new password
  const fresh = await initiateLogin(authUser.user.email, newPassword);
  if (!fresh.success) {
    return {
      success: true,
      message: 'Sifreniz guncellendi. Lutfen tekrar giris yapin.',
    };
  }

  return {
    success: true,
    token: fresh.token,
    refreshToken: fresh.refreshToken,
    user: fresh.user,
    message: 'Sifreniz basariyla guncellendi',
  };
}

async function updateUserPlan(userId, plan, expiry = null) {
  ensureSupabase();

  const update = {
    plan,
    plan_expiry: expiry,
    plan_purchase_date: new Date().toISOString(),
  };

  if (plan === 'elite_once' || plan === 'premium_once') {
    update.monthly_usage_count = 0;
    update.monthly_usage_reset = new Date().toISOString();
  }

  const { error } = await supabaseAdmin
    .from('profiles')
    .update(update)
    .eq('id', userId);

  if (error) return { success: false, error: error.message };
  return { success: true };
}

async function getSubscriptionStatus(userId) {
  ensureSupabase();
  const profile = await fetchProfile(userId);
  if (!profile) return null;

  const plan = profile.plan || 'free';
  const now = new Date();

  if ((plan === 'starter_monthly' || plan === 'pro_monthly') && profile.plan_expiry) {
    if (now > new Date(profile.plan_expiry)) {
      await supabaseAdmin
        .from('profiles')
        .update({ plan: 'free', plan_expiry: null })
        .eq('id', userId);
      return { plan: 'free', planExpiry: null, isActive: false };
    }
  }

  let monthlyUsage = profile.monthly_usage_count || 0;
  if ((plan === 'elite_once' || plan === 'premium_once') && profile.monthly_usage_reset) {
    const resetDate = new Date(profile.monthly_usage_reset);
    const currentMonth = now.getFullYear() * 12 + now.getMonth();
    const resetMonth = resetDate.getFullYear() * 12 + resetDate.getMonth();

    if (currentMonth > resetMonth) {
      monthlyUsage = 0;
      await supabaseAdmin
        .from('profiles')
        .update({ monthly_usage_count: 0, monthly_usage_reset: now.toISOString() })
        .eq('id', userId);
    }
  }

  return {
    plan,
    planExpiry: profile.plan_expiry || null,
    planPurchaseDate: profile.plan_purchase_date || null,
    monthlyUsageCount: monthlyUsage,
    isActive: true,
  };
}

async function createDeletionRequest({ email, note = '' }) {
  ensureSupabase();
  const normalized = normalizeEmail(email);
  if (!normalized) return { success: false, error: 'E-posta gerekli' };

  const user = await findUserByEmail(normalized);

  const { error } = await supabaseAdmin
    .from('account_deletion_requests')
    .insert({
      email: normalized,
      user_id: user?.id || null,
      note: String(note || '').trim().slice(0, 1000),
      status: 'pending',
    });

  if (error) return { success: false, error: error.message };

  return {
    success: true,
    message: 'Hesap silme talebiniz alindi. En kisa surede isleme alinacaktir.',
  };
}

async function deleteUserAccount(userId) {
  ensureSupabase();

  const { data: existing } = await supabaseAdmin.auth.admin.getUserById(userId);
  if (!existing?.user) {
    return { success: false, error: 'Kullanici bulunamadi' };
  }

  const email = existing.user.email;
  const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);
  if (error) return { success: false, error: error.message };

  return { success: true, userId, email };
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
};
