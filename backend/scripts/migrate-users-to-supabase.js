/**
 * One-shot migration: legacy users.enc / users.json → Supabase Auth + profiles
 *
 * - Reads the encrypted local user store (same format as the old authService)
 * - For each user, creates a Supabase Auth user using the existing bcrypt hash
 *   (so users keep their current passwords)
 * - Updates the profile row (auto-created by the on_auth_user_created trigger)
 *   with plan, role, and timestamps
 *
 * Run:  node scripts/migrate-users-to-supabase.js [--dry-run]
 *
 * Idempotent: skips users that already exist in Supabase by email.
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { supabaseAdmin, isSupabaseEnabled } = require('../src/lib/supabase');

const DRY_RUN = process.argv.includes('--dry-run');

// --- Legacy decryption (matches the previous authService.js) ----------------

const MACHINE_GUID = process.env.AUTH_MACHINE_GUID || '6B226280-2CE2-11ED-B3FC-1D6D8A441B00';
const ENC_KEY = crypto.createHash('sha256')
  .update(process.env.AUTH_ENCRYPTION_SECRET || (MACHINE_GUID + '-BORSA-KRALI-SECURE-2024'))
  .digest();

const USERS_ENC = path.join(__dirname, '../src/data/users.enc');
const USERS_JSON = path.join(__dirname, '../src/data/users.json');

function decryptData(content) {
  try {
    const parsed = JSON.parse(content);
    const encBuf = Buffer.from(parsed.data, 'hex');
    const sig = crypto.createHmac('sha256', ENC_KEY).update(encBuf).digest('hex');
    if (sig !== parsed._sig) throw new Error('HMAC mismatch');
    const decipher = crypto.createDecipheriv('aes-256-cbc', ENC_KEY, Buffer.from(parsed.iv, 'hex'));
    const decrypted = Buffer.concat([decipher.update(encBuf), decipher.final()]);
    return JSON.parse(decrypted.toString('utf8'));
  } catch (err) {
    console.error('[migrate] decrypt failed:', err.message);
    return null;
  }
}

function readLegacyDB() {
  if (fs.existsSync(USERS_ENC)) {
    const decrypted = decryptData(fs.readFileSync(USERS_ENC, 'utf8'));
    if (decrypted) return decrypted;
    console.warn('[migrate] users.enc could not be decrypted — check AUTH_ENCRYPTION_SECRET');
  }
  if (fs.existsSync(USERS_JSON)) {
    return JSON.parse(fs.readFileSync(USERS_JSON, 'utf8'));
  }
  return { users: [] };
}

// --- Migration ---------------------------------------------------------------

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

async function findExistingByEmail(email) {
  // listUsers + filter (no admin getUserByEmail in JS SDK)
  const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw error;
  return data.users.find((u) => normalizeEmail(u.email) === normalizeEmail(email)) || null;
}

async function migrateUser(legacy) {
  const email = normalizeEmail(legacy.email);
  if (!email) {
    return { status: 'skipped', reason: 'no email' };
  }

  const existing = await findExistingByEmail(email);
  if (existing) {
    return { status: 'skipped', reason: 'already in supabase', userId: existing.id };
  }

  if (DRY_RUN) {
    return { status: 'dry-run', email };
  }

  // createUser with password_hash preserves the original bcrypt hash so the
  // user can keep using their current password.
  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password_hash: legacy.password,
    email_confirm: true,
    user_metadata: {
      first_name: legacy.firstName || '',
      last_name:  legacy.lastName  || '',
      phone:      legacy.phone     || null,
      legacy_id:  legacy.id        || null,
      registered_from: legacy.registeredFrom || 'legacy',
    },
  });

  if (error) {
    return { status: 'error', email, error: error.message };
  }

  const newUserId = data.user.id;

  // Update the profile (auto-created by trigger) with plan/role data
  const profileUpdate = {
    first_name: legacy.firstName || '',
    last_name:  legacy.lastName  || '',
    phone:      legacy.phone     || null,
    plan:       legacy.plan      || 'free',
    plan_expiry:        legacy.planExpiry        || null,
    plan_purchase_date: legacy.planPurchaseDate  || null,
    monthly_usage_count: legacy.monthlyUsageCount || 0,
    monthly_usage_reset: legacy.monthlyUsageReset || null,
    role: legacy.role || 'user',
    terms_accepted_at:   legacy.termsAcceptedAt   || legacy.createdAt || null,
    privacy_accepted_at: legacy.privacyAcceptedAt || legacy.createdAt || null,
  };

  const { error: profileErr } = await supabaseAdmin
    .from('profiles')
    .update(profileUpdate)
    .eq('id', newUserId);

  if (profileErr) {
    return { status: 'partial', email, userId: newUserId, profileError: profileErr.message };
  }

  return { status: 'migrated', email, userId: newUserId };
}

(async () => {
  if (!isSupabaseEnabled()) {
    console.error('Supabase not configured — set SUPABASE_URL and SUPABASE_SECRET_KEY');
    process.exit(1);
  }

  const db = readLegacyDB();
  const users = Array.isArray(db.users) ? db.users : [];
  console.log(`[migrate] legacy users found: ${users.length}${DRY_RUN ? ' (dry run)' : ''}`);
  console.log('');

  const summary = { migrated: 0, skipped: 0, error: 0, partial: 0, 'dry-run': 0 };

  for (const legacy of users) {
    const result = await migrateUser(legacy);
    summary[result.status] = (summary[result.status] || 0) + 1;

    const tag = ({
      migrated: '✅',
      skipped:  '⏭️ ',
      error:    '❌',
      partial:  '⚠️ ',
      'dry-run': '🔍',
    })[result.status] || '? ';

    const line = [
      tag,
      result.email || legacy.email || '(no email)',
      result.status,
      result.reason || result.error || result.profileError || '',
    ].filter(Boolean).join(' ');

    console.log(line);
  }

  console.log('');
  console.log('[migrate] summary:', summary);
})().catch((err) => {
  console.error('[migrate] fatal:', err);
  process.exit(1);
});
