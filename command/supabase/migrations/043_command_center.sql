-- Gather command center — the three tables it adds on top of the portal's
-- schema. Numbered to follow the portal's 042 so it can be dropped into
-- gather/portal/supabase/migrations unchanged; run it in the same Supabase
-- project (Legacy Pulse) after 001–042. Nothing here holds player data:
-- spend is money the company spent, sales are Apple's daily totals, and
-- settings are prices. All three are RLS-locked to the service role like
-- every other gather_ table.

-- Marketing spend, entered by hand or pasted as CSV from the command
-- center. One row per (day, channel, campaign) line item; several rows a
-- day per channel are fine. installs_attributed is what the ad network
-- claims, used only for per-channel CAC — blended CAC divides by
-- gather_installs instead and never trusts the network.
create table if not exists public.gather_marketing_spend (
  id uuid primary key default gen_random_uuid(),
  day date not null,
  channel text not null check (channel ~ '^[a-z0-9][a-z0-9-]{0,39}$'),
  campaign text check (char_length(campaign) <= 120),
  spend_cents bigint not null check (spend_cents >= 0),
  currency text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  impressions bigint check (impressions >= 0),
  clicks bigint check (clicks >= 0),
  installs_attributed integer check (installs_attributed >= 0),
  notes text check (char_length(notes) <= 500),
  created_at timestamptz not null default now()
);

create index if not exists gather_marketing_spend_day_idx
  on public.gather_marketing_spend (day desc, channel);

alter table public.gather_marketing_spend enable row level security;
revoke all on public.gather_marketing_spend from public, anon, authenticated;
grant select, insert, update, delete on public.gather_marketing_spend to service_role;

-- App Store Connect daily sales, cached from the Sales Reports API
-- (SALES / SUMMARY / DAILY) by POST /api/appstore/sales/refresh. Units are
-- Apple's; proceeds are the developer's share in the vendor currency.
create table if not exists public.gather_appstore_sales_daily (
  day date primary key,
  downloads integer not null default 0,
  updates integer not null default 0,
  redownloads integer not null default 0,
  iap_units integer not null default 0,
  trial_starts integer not null default 0,
  proceeds_cents bigint not null default 0,
  proceeds_currency text check (proceeds_currency ~ '^[A-Z]{3}$'),
  countries integer not null default 0,
  fetched_at timestamptz not null default now()
);

alter table public.gather_appstore_sales_daily enable row level security;
revoke all on public.gather_appstore_sales_daily from public, anon, authenticated;
grant select, insert, update, delete on public.gather_appstore_sales_daily to service_role;

-- Command-center settings (subscription list prices for the MRR estimate,
-- Apple's commission rate). Key/value so a new setting needs no migration.
create table if not exists public.gather_command_settings (
  key text primary key check (key ~ '^[a-z][a-z0-9_]{0,63}$'),
  value jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.gather_command_settings enable row level security;
revoke all on public.gather_command_settings from public, anon, authenticated;
grant select, insert, update, delete on public.gather_command_settings to service_role;
