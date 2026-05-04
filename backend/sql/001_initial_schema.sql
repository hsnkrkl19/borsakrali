-- BORSA KRALI — Supabase initial schema
-- Run this in Supabase Dashboard → SQL Editor → New Query → Paste → Run
--
-- Creates: profiles, notes, feature_requests, feature_request_votes,
--          account_deletion_requests, plus RLS policies and a trigger
--          that auto-creates a profile row when a user signs up.

-- ============================================================================
-- 1. PROFILES — extends auth.users with plan/subscription data
-- ============================================================================

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  first_name text,
  last_name text,
  phone text unique,
  plan text not null default 'free'
    check (plan in ('free','starter_monthly','pro_monthly','elite_once','premium_once','lifetime')),
  plan_expiry timestamptz,
  plan_purchase_date timestamptz,
  monthly_usage_count int not null default 0,
  monthly_usage_reset timestamptz,
  role text not null default 'user' check (role in ('user','admin')),
  terms_accepted_at timestamptz,
  privacy_accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists profiles_role_idx on public.profiles(role);
create index if not exists profiles_plan_idx on public.profiles(plan);

-- Auto-update updated_at on row change
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Auto-create profile when a new user signs up via Supabase Auth
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, first_name, last_name, phone, terms_accepted_at, privacy_accepted_at)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'first_name', new.raw_user_meta_data->>'firstName', ''),
    coalesce(new.raw_user_meta_data->>'last_name',  new.raw_user_meta_data->>'lastName',  ''),
    new.raw_user_meta_data->>'phone',
    now(),
    now()
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================================
-- 2. NOTES — finansal-notlar (per user)
-- ============================================================================

create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  symbol text not null,
  title text,
  body text not null default '',
  tags text[] default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists notes_user_idx on public.notes(user_id);
create index if not exists notes_symbol_idx on public.notes(symbol);

drop trigger if exists notes_set_updated_at on public.notes;
create trigger notes_set_updated_at
  before update on public.notes
  for each row execute function public.set_updated_at();

-- ============================================================================
-- 3. FEATURE REQUESTS — istek-paneli
-- ============================================================================

create table if not exists public.feature_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  title text not null,
  description text not null default '',
  status text not null default 'open'
    check (status in ('open','planned','in_progress','done','rejected')),
  vote_count int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists feature_requests_status_idx on public.feature_requests(status);
create index if not exists feature_requests_votes_idx on public.feature_requests(vote_count desc);

drop trigger if exists feature_requests_set_updated_at on public.feature_requests;
create trigger feature_requests_set_updated_at
  before update on public.feature_requests
  for each row execute function public.set_updated_at();

create table if not exists public.feature_request_votes (
  request_id uuid not null references public.feature_requests(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (request_id, user_id)
);

-- Keep vote_count denormalized (cheap reads)
create or replace function public.recount_feature_votes()
returns trigger language plpgsql as $$
declare target_id uuid;
begin
  target_id := coalesce(new.request_id, old.request_id);
  update public.feature_requests
     set vote_count = (select count(*) from public.feature_request_votes where request_id = target_id)
   where id = target_id;
  return null;
end;
$$;

drop trigger if exists feature_votes_recount on public.feature_request_votes;
create trigger feature_votes_recount
  after insert or delete on public.feature_request_votes
  for each row execute function public.recount_feature_votes();

-- ============================================================================
-- 4. ACCOUNT DELETION REQUESTS
-- ============================================================================

create table if not exists public.account_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  user_id uuid references auth.users(id) on delete set null,
  note text default '',
  status text not null default 'pending' check (status in ('pending','processed','rejected')),
  created_at timestamptz not null default now()
);

create index if not exists account_deletion_status_idx on public.account_deletion_requests(status);

-- ============================================================================
-- 5. ROW LEVEL SECURITY
-- ============================================================================

alter table public.profiles                  enable row level security;
alter table public.notes                     enable row level security;
alter table public.feature_requests          enable row level security;
alter table public.feature_request_votes     enable row level security;
alter table public.account_deletion_requests enable row level security;

-- Profiles: user can read/update own profile; admins can do anything
drop policy if exists profiles_select_self on public.profiles;
create policy profiles_select_self on public.profiles
  for select using (auth.uid() = id);

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles
  for update using (auth.uid() = id)
  with check (auth.uid() = id and role = (select role from public.profiles where id = auth.uid()));
  -- ^ user cannot escalate their own role; only secret-key (backend) can

-- Notes: user can CRUD own notes
drop policy if exists notes_all_self on public.notes;
create policy notes_all_self on public.notes
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Feature requests: anyone authenticated can read; only the author can update; admins via secret key
drop policy if exists feature_requests_select_all on public.feature_requests;
create policy feature_requests_select_all on public.feature_requests
  for select using (auth.role() = 'authenticated');

drop policy if exists feature_requests_insert_self on public.feature_requests;
create policy feature_requests_insert_self on public.feature_requests
  for insert with check (auth.uid() = user_id);

drop policy if exists feature_requests_update_self on public.feature_requests;
create policy feature_requests_update_self on public.feature_requests
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Feature request votes: user can vote/unvote on behalf of self
drop policy if exists feature_votes_select_all on public.feature_request_votes;
create policy feature_votes_select_all on public.feature_request_votes
  for select using (auth.role() = 'authenticated');

drop policy if exists feature_votes_insert_self on public.feature_request_votes;
create policy feature_votes_insert_self on public.feature_request_votes
  for insert with check (auth.uid() = user_id);

drop policy if exists feature_votes_delete_self on public.feature_request_votes;
create policy feature_votes_delete_self on public.feature_request_votes
  for delete using (auth.uid() = user_id);

-- Account deletion requests: anyone authenticated can insert (request own deletion); reads via secret key only
drop policy if exists deletion_insert_any on public.account_deletion_requests;
create policy deletion_insert_any on public.account_deletion_requests
  for insert with check (auth.role() = 'authenticated');
