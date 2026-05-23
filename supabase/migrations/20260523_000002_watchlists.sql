-- GovSignal AI watchlists phase

create table if not exists public.watchlists (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.watchlist_keywords (
  id uuid primary key default gen_random_uuid(),
  watchlist_id uuid not null references public.watchlists(id) on delete cascade,
  keyword text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.watchlist_naics (
  watchlist_id uuid not null references public.watchlists(id) on delete cascade,
  naics_code text not null references public.naics_codes(code) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (watchlist_id, naics_code)
);

create table if not exists public.watchlist_psc (
  watchlist_id uuid not null references public.watchlists(id) on delete cascade,
  psc_code text not null references public.psc_codes(code) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (watchlist_id, psc_code)
);

create table if not exists public.watchlist_exclusions (
  id uuid primary key default gen_random_uuid(),
  watchlist_id uuid not null references public.watchlists(id) on delete cascade,
  exclusion text not null,
  created_at timestamptz not null default now()
);

create trigger set_watchlists_updated_at
before update on public.watchlists
for each row execute function public.set_updated_at();

alter table public.watchlists enable row level security;
alter table public.watchlist_keywords enable row level security;
alter table public.watchlist_naics enable row level security;
alter table public.watchlist_psc enable row level security;
alter table public.watchlist_exclusions enable row level security;

create policy "watchlists_select_own" on public.watchlists
for select using (
  exists (
    select 1 from public.companies c
    where c.id = watchlists.company_id and c.owner_user_id = auth.uid()
  )
);

create policy "watchlists_insert_own" on public.watchlists
for insert with check (
  exists (
    select 1 from public.companies c
    where c.id = watchlists.company_id and c.owner_user_id = auth.uid()
  )
);

create policy "watchlists_update_own" on public.watchlists
for update using (
  exists (
    select 1 from public.companies c
    where c.id = watchlists.company_id and c.owner_user_id = auth.uid()
  )
) with check (
  exists (
    select 1 from public.companies c
    where c.id = watchlists.company_id and c.owner_user_id = auth.uid()
  )
);

create policy "watchlists_delete_own" on public.watchlists
for delete using (
  exists (
    select 1 from public.companies c
    where c.id = watchlists.company_id and c.owner_user_id = auth.uid()
  )
);

create policy "watchlist_keywords_own" on public.watchlist_keywords
for all using (
  exists (
    select 1
    from public.watchlists w
    join public.companies c on c.id = w.company_id
    where w.id = watchlist_keywords.watchlist_id and c.owner_user_id = auth.uid()
  )
) with check (
  exists (
    select 1
    from public.watchlists w
    join public.companies c on c.id = w.company_id
    where w.id = watchlist_keywords.watchlist_id and c.owner_user_id = auth.uid()
  )
);

create policy "watchlist_naics_own" on public.watchlist_naics
for all using (
  exists (
    select 1
    from public.watchlists w
    join public.companies c on c.id = w.company_id
    where w.id = watchlist_naics.watchlist_id and c.owner_user_id = auth.uid()
  )
) with check (
  exists (
    select 1
    from public.watchlists w
    join public.companies c on c.id = w.company_id
    where w.id = watchlist_naics.watchlist_id and c.owner_user_id = auth.uid()
  )
);

create policy "watchlist_psc_own" on public.watchlist_psc
for all using (
  exists (
    select 1
    from public.watchlists w
    join public.companies c on c.id = w.company_id
    where w.id = watchlist_psc.watchlist_id and c.owner_user_id = auth.uid()
  )
) with check (
  exists (
    select 1
    from public.watchlists w
    join public.companies c on c.id = w.company_id
    where w.id = watchlist_psc.watchlist_id and c.owner_user_id = auth.uid()
  )
);

create policy "watchlist_exclusions_own" on public.watchlist_exclusions
for all using (
  exists (
    select 1
    from public.watchlists w
    join public.companies c on c.id = w.company_id
    where w.id = watchlist_exclusions.watchlist_id and c.owner_user_id = auth.uid()
  )
) with check (
  exists (
    select 1
    from public.watchlists w
    join public.companies c on c.id = w.company_id
    where w.id = watchlist_exclusions.watchlist_id and c.owner_user_id = auth.uid()
  )
);