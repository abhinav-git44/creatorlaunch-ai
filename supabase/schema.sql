-- Sell Sphere: run this in the Supabase SQL editor. Safe to re-run (idempotent):
-- running it again after an upgrade adds the new tables/functions without touching data.
-- The app talks to these tables only from the server, with the service-role key.
-- RLS is ON with no policies, so the public anon key can read or write nothing.

create extension if not exists pgcrypto;

create table if not exists public.stores (
  id             uuid primary key default gen_random_uuid(),
  edit_key_hash  text not null,                       -- sha256 of the secret edit key
  slug           text unique,                         -- public link: /s/<slug>
  status         text not null default 'draft' check (status in ('draft', 'published')),
  input          jsonb not null,                      -- what the creator typed (mode, name, handle, description, niche, language, audienceSize)
  content        jsonb not null,                      -- the storefront: creator, theme, language, products[]
  published_at   timestamptz,                         -- first publish time (kept on re-publish)
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint slug_format check (slug is null or slug ~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$')
);

create index if not exists stores_status_published_at_idx on public.stores (status, published_at);

create table if not exists public.generations (
  id           uuid primary key default gen_random_uuid(),
  store_id     uuid references public.stores(id) on delete cascade,
  kind         text not null,                         -- storefront | all | bio | product | add_product | price
  model        text,
  status       text not null check (status in ('ok', 'error')),
  error_code   text,
  latency_ms   integer,
  attempts     integer,
  created_at   timestamptz not null default now()
);

create index if not exists generations_created_at_idx on public.generations (created_at);

-- Product analytics (v2). id doubles as the de-duplication key. No IPs, names or free text.
create table if not exists public.events (
  id          text primary key,
  name        text not null,
  session_id  text,                                    -- anonymous browser session (random UUID)
  store_id    uuid references public.stores(id) on delete set null,
  slug        text,
  meta        jsonb not null default '{}'::jsonb,      -- small whitelisted metadata
  created_at  timestamptz not null default now()
);
create index if not exists events_name_created_idx on public.events (name, created_at);
create index if not exists events_session_idx on public.events (session_id);
create index if not exists events_created_idx on public.events (created_at);

-- Profile pictures and cover images (v3). Stored as base64 next to the store so the app needs no
-- separate file storage; the browser crops/compresses first (avatar ≤400 KB, cover ≤900 KB).
-- id = sha256(store id + image bytes), first 40 hex chars; served at /api/assets/<id> with an
-- immutable cache header, so each image is read from the database roughly once per CDN region.
create table if not exists public.store_assets (
  id          text primary key check (id ~ '^[a-f0-9]{40}$'),
  store_id    uuid not null references public.stores(id) on delete cascade,
  kind        text not null check (kind in ('avatar', 'cover')),
  source      text not null default 'upload' check (source in ('upload', 'ai')),
  mime        text not null check (mime in ('image/jpeg', 'image/png', 'image/webp')),
  bytes       integer not null,
  data        text not null,
  created_at  timestamptz not null default now()
);
create index if not exists store_assets_store_idx on public.store_assets (store_id);

-- Shared rate limiting across serverless instances (fixed windows, hashed IP buckets).
create table if not exists public.rate_limits (
  bucket        text not null,
  window_start  timestamptz not null,
  hits          integer not null default 0,
  primary key (bucket, window_start)
);

create or replace function public.hit_rate_limit(p_bucket text, p_window_seconds integer)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  w timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  n integer;
begin
  insert into public.rate_limits (bucket, window_start, hits)
  values (p_bucket, w, 1)
  on conflict (bucket, window_start) do update set hits = public.rate_limits.hits + 1
  returning hits into n;
  -- opportunistic cleanup of old windows (~1% of calls)
  if random() < 0.01 then
    delete from public.rate_limits where window_start < now() - interval '1 day';
  end if;
  return n;
end;
$$;

revoke all on function public.hit_rate_limit(text, integer) from public, anon, authenticated;
grant execute on function public.hit_rate_limit(text, integer) to service_role;

alter table public.stores enable row level security;
alter table public.generations enable row level security;
alter table public.events enable row level security;
alter table public.store_assets enable row level security;
alter table public.rate_limits enable row level security;
-- No policies on purpose: the anon/authenticated roles can read or write nothing.
-- The server uses the service_role/secret key, which bypasses RLS.

-- Reporting queries live in supabase/metrics.sql; the same numbers are served (aggregated only)
-- by GET /api/metrics when METRICS_TOKEN is configured.
