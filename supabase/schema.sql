-- CreatorLaunch AI: run this once in the Supabase SQL editor.
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

alter table public.stores enable row level security;
alter table public.generations enable row level security;

-- Activation metrics straight from the tables (no extra analytics needed for v1):
--   publish rate:      select count(*) filter (where published_at is not null)::float / count(*) from stores;
--   minutes to publish: select percentile_cont(0.5) within group (order by extract(epoch from published_at - created_at)/60) from stores where published_at is not null;
--   AI failure rate:   select count(*) filter (where status = 'error')::float / count(*) from generations;
