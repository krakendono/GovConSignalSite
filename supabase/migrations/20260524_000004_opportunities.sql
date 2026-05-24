-- GovSignal AI opportunities ingestion and matching

create table if not exists public.opportunities (
  id uuid primary key default gen_random_uuid(),
  source_notice_id text not null unique,
  source text not null default 'sam.gov',
  title text not null,
  synopsis text,
  agency text,
  naics_code text references public.naics_codes(code) on delete set null,
  psc_code text references public.psc_codes(code) on delete set null,
  posted_at timestamptz,
  response_deadline_at timestamptz,
  notice_url text,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.opportunity_matches (
  company_id uuid not null references public.companies(id) on delete cascade,
  opportunity_id uuid not null references public.opportunities(id) on delete cascade,
  watchlist_id uuid references public.watchlists(id) on delete set null,
  match_score numeric(5,2) not null default 0,
  match_reason text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (company_id, opportunity_id)
);

drop trigger if exists set_opportunities_updated_at on public.opportunities;
create trigger set_opportunities_updated_at
before update on public.opportunities
for each row execute function public.set_updated_at();

drop trigger if exists set_opportunity_matches_updated_at on public.opportunity_matches;
create trigger set_opportunity_matches_updated_at
before update on public.opportunity_matches
for each row execute function public.set_updated_at();

alter table public.opportunities enable row level security;
alter table public.opportunity_matches enable row level security;

drop policy if exists "opportunities_read_authenticated" on public.opportunities;
create policy "opportunities_read_authenticated" on public.opportunities
for select to authenticated using (true);

drop policy if exists "opportunities_write_authenticated" on public.opportunities;
create policy "opportunities_write_authenticated" on public.opportunities
for all to authenticated using (true) with check (true);

drop policy if exists "opportunity_matches_select_own" on public.opportunity_matches;
create policy "opportunity_matches_select_own" on public.opportunity_matches
for select using (
  exists (
    select 1 from public.companies c
    where c.id = opportunity_matches.company_id and c.owner_user_id = auth.uid()
  )
);

drop policy if exists "opportunity_matches_write_own" on public.opportunity_matches;
create policy "opportunity_matches_write_own" on public.opportunity_matches
for all using (
  exists (
    select 1 from public.companies c
    where c.id = opportunity_matches.company_id and c.owner_user_id = auth.uid()
  )
) with check (
  exists (
    select 1 from public.companies c
    where c.id = opportunity_matches.company_id and c.owner_user_id = auth.uid()
  )
);
