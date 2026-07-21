-- Run this in the Supabase SQL editor (Project → SQL Editor → New query)

create table if not exists clients (
  id text primary key,
  data jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists invoices (
  id text primary key,
  data jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists items (
  id text primary key,
  data jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists settings (
  id int primary key,
  data jsonb not null
);

-- Row Level Security ------------------------------------------------------
-- These tables are enabled with RLS. The policies below allow full access
-- using the anon/public key, which matches how the app currently connects
-- (no login screen). This is fine for a private tool only you/your team use,
-- but ANYONE with your NEXT_PUBLIC_SUPABASE_ANON_KEY and URL could read/write
-- this data (e.g. if the site is public). If that matters, add Supabase Auth
-- and scope these policies to auth.uid() instead of "true".

alter table clients enable row level security;
alter table invoices enable row level security;
alter table items enable row level security;
alter table settings enable row level security;

create policy "public read/write clients" on clients
  for all using (true) with check (true);

create policy "public read/write invoices" on invoices
  for all using (true) with check (true);

create policy "public read/write items" on items
  for all using (true) with check (true);

create policy "public read/write settings" on settings
  for all using (true) with check (true);
