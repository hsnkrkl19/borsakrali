/**
 * Quick sanity check that the Supabase admin client is wired up correctly.
 * Run: node scripts/test-supabase.js
 */

require('dotenv').config();
const { supabaseAdmin, isSupabaseEnabled } = require('../src/lib/supabase');

(async () => {
  if (!isSupabaseEnabled()) {
    console.error('❌ Supabase not enabled — check SUPABASE_URL and SUPABASE_SECRET_KEY in .env');
    process.exit(1);
  }

  console.log('→ Supabase URL:', process.env.SUPABASE_URL);
  console.log('→ Calling auth.admin.listUsers (paginated)...');

  const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1 });

  if (error) {
    console.error('❌ Connection failed:', error.message);
    process.exit(1);
  }

  console.log('✅ Auth API reachable. Total users in project:', data?.users?.length ?? 0);

  // Try to query the profiles table — will fail gracefully if schema not yet applied
  const { error: profilesErr, count } = await supabaseAdmin
    .from('profiles')
    .select('*', { count: 'exact', head: true });

  if (profilesErr) {
    console.warn('⚠️  profiles table not found yet:', profilesErr.message);
    console.warn('   → Run backend/sql/001_initial_schema.sql in Supabase Dashboard.');
  } else {
    console.log(`✅ profiles table reachable. Row count: ${count ?? 0}`);
  }

  process.exit(0);
})().catch((err) => {
  console.error('❌ Unexpected error:', err);
  process.exit(1);
});
