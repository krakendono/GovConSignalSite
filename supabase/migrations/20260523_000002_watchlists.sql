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

drop trigger if exists set_watchlists_updated_at on public.watchlists;

create trigger set_watchlists_updated_at
before update on public.watchlists
for each row execute function public.set_updated_at();

alter table public.watchlists enable row level security;
alter table public.watchlist_keywords enable row level security;
alter table public.watchlist_naics enable row level security;
alter table public.watchlist_psc enable row level security;
alter table public.watchlist_exclusions enable row level security;

drop policy if exists "watchlists_select_own" on public.watchlists;
create policy "watchlists_select_own" on public.watchlists
for select using (
  exists (
    select 1 from public.companies c
    where c.id = watchlists.company_id and c.owner_user_id = auth.uid()
  )
);

drop policy if exists "watchlists_insert_own" on public.watchlists;
create policy "watchlists_insert_own" on public.watchlists
for insert with check (
  exists (
    select 1 from public.companies c
    where c.id = watchlists.company_id and c.owner_user_id = auth.uid()
  )
);

drop policy if exists "watchlists_update_own" on public.watchlists;
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

drop policy if exists "watchlists_delete_own" on public.watchlists;
create policy "watchlists_delete_own" on public.watchlists
for delete using (
  exists (
    select 1 from public.companies c
    where c.id = watchlists.company_id and c.owner_user_id = auth.uid()
  )
);

drop policy if exists "watchlist_keywords_own" on public.watchlist_keywords;
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

drop policy if exists "watchlist_naics_own" on public.watchlist_naics;
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

drop policy if exists "watchlist_psc_own" on public.watchlist_psc;
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

drop policy if exists "watchlist_exclusions_own" on public.watchlist_exclusions;
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

drop policy if exists "naics_read_authenticated" on public.naics_codes;
create policy "naics_read_authenticated" on public.naics_codes
for select to authenticated using (true);

drop policy if exists "naics_insert_authenticated" on public.naics_codes;
create policy "naics_insert_authenticated" on public.naics_codes
for insert to authenticated with check (true);

drop policy if exists "naics_update_authenticated" on public.naics_codes;
create policy "naics_update_authenticated" on public.naics_codes
for update to authenticated using (true) with check (true);

drop policy if exists "psc_read_authenticated" on public.psc_codes;
create policy "psc_read_authenticated" on public.psc_codes
for select to authenticated using (true);

drop policy if exists "psc_insert_authenticated" on public.psc_codes;
create policy "psc_insert_authenticated" on public.psc_codes
for insert to authenticated with check (true);

drop policy if exists "psc_update_authenticated" on public.psc_codes;
create policy "psc_update_authenticated" on public.psc_codes
for update to authenticated using (true) with check (true);

insert into public.naics_codes (code, title)
values ('336413', 'Other Aircraft Parts and Auxiliary Equipment Manufacturing')
on conflict (code) do update
set title = excluded.title;