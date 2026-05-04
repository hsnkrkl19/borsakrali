/**
 * Supabase server-side client (admin)
 *
 * Uses the SECRET key — bypasses Row Level Security.
 * Only import this from backend code. Never expose the secret key to frontend.
 */

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;

if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) {
  console.warn('[SUPABASE] SUPABASE_URL or SUPABASE_SECRET_KEY missing — Supabase disabled');
}

const supabaseAdmin = (SUPABASE_URL && SUPABASE_SECRET_KEY)
  ? createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })
  : null;

function isSupabaseEnabled() {
  return supabaseAdmin !== null;
}

module.exports = {
  supabaseAdmin,
  isSupabaseEnabled,
};
