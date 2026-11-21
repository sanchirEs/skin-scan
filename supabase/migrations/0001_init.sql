-- Skin Check phase 1. Only the server (service role) writes; nobody reads
-- through the public API. Staff read rows in the Supabase dashboard.

create table if not exists public.orders (
  id uuid primary key,
  created_at timestamptz not null default now(),
  name text not null check (char_length(name) between 1 and 80),
  phone text not null check (char_length(phone) between 5 and 25),
  address text check (char_length(address) <= 200),
  note text check (char_length(note) <= 500),
  items jsonb not null,
  total numeric(12, 2) not null check (total >= 0),
  currency text not null,
  scan_scores jsonb not null,   -- numbers only, never an image
  quiz jsonb not null,          -- without the pregnancy answer
  consent boolean not null check (consent),
  utm_source text,
  utm_medium text,
  utm_campaign text
);

-- Scan numbers with no name, photo or contact details. Orders never store a
-- scan id; `ordered` only counts conversions. An order keeps the same readings
-- (with consent), so a scan row is not guaranteed to be unlinkable.
create table if not exists public.scans (
  id uuid primary key,
  created_at timestamptz not null default now(),
  readings jsonb not null,
  tone jsonb not null,
  ai jsonb,                     -- AI check numbers (id, severity, level); never images
  quality jsonb not null,
  device_os text,
  device_browser text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  ordered boolean not null default false
);

alter table public.orders enable row level security;
alter table public.scans enable row level security;
-- No policies on purpose: anon and authenticated roles get no access.

create index if not exists orders_created_at_idx on public.orders (created_at desc);
create index if not exists scans_created_at_idx on public.scans (created_at desc);
