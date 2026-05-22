-- GovSignal AI Phase 1 schema
-- Source: Docs/Master Prompt Government Contracting.txt

create extension if not exists pgcrypto;

create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  primary_company_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  website text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint companies_owner_user_id_unique unique (owner_user_id)
);

alter table public.users
  add constraint users_primary_company_id_fkey
  foreign key (primary_company_id) references public.companies(id) on delete set null;

create table if not exists public.company_profiles (
  company_id uuid primary key references public.companies(id) on delete cascade,
  capability_statement text,
  certifications text[] not null default '{}',
  past_performance text,
  team_size text,
  geographic_coverage text,
  preferred_agencies text[] not null default '{}',
  keywords text[] not null default '{}',
  excluded_industries text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.naics_codes (
  code text primary key,
  title text,
  created_at timestamptz not null default now()
);

create table if not exists public.psc_codes (
  code text primary key,
  title text,
  created_at timestamptz not null default now()
);

create table if not exists public.company_naics_codes (
  company_id uuid not null references public.companies(id) on delete cascade,
  naics_code text not null references public.naics_codes(code) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (company_id, naics_code)
);

create table if not exists public.company_psc_codes (
  company_id uuid not null references public.companies(id) on delete cascade,
  psc_code text not null references public.psc_codes(code) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (company_id, psc_code)
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_users_updated_at
before update on public.users
for each row execute function public.set_updated_at();

create trigger set_companies_updated_at
before update on public.companies
for each row execute function public.set_updated_at();

create trigger set_company_profiles_updated_at
before update on public.company_profiles
for each row execute function public.set_updated_at();

alter table public.users enable row level security;
alter table public.companies enable row level security;
alter table public.company_profiles enable row level security;
alter table public.company_naics_codes enable row level security;
alter table public.company_psc_codes enable row level security;
alter table public.naics_codes enable row level security;
alter table public.psc_codes enable row level security;

create policy "users_select_own" on public.users
for select using (id = auth.uid());

create policy "users_insert_own" on public.users
for insert with check (id = auth.uid());

create policy "users_update_own" on public.users
for update using (id = auth.uid()) with check (id = auth.uid());

create policy "companies_select_own" on public.companies
for select using (owner_user_id = auth.uid());

create policy "companies_insert_own" on public.companies
for insert with check (owner_user_id = auth.uid());

create policy "companies_update_own" on public.companies
for update using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());

create policy "company_profiles_select_own" on public.company_profiles
for select using (
  exists (
    select 1 from public.companies c
    where c.id = company_profiles.company_id and c.owner_user_id = auth.uid()
  )
);

create policy "company_profiles_insert_own" on public.company_profiles
for insert with check (
  exists (
    select 1 from public.companies c
    where c.id = company_profiles.company_id and c.owner_user_id = auth.uid()
  )
);

create policy "company_profiles_update_own" on public.company_profiles
for update using (
  exists (
    select 1 from public.companies c
    where c.id = company_profiles.company_id and c.owner_user_id = auth.uid()
  )
) with check (
  exists (
    select 1 from public.companies c
    where c.id = company_profiles.company_id and c.owner_user_id = auth.uid()
  )
);

create policy "company_naics_select_own" on public.company_naics_codes
for select using (
  exists (
    select 1 from public.companies c
    where c.id = company_naics_codes.company_id and c.owner_user_id = auth.uid()
  )
);

create policy "company_naics_write_own" on public.company_naics_codes
for all using (
  exists (
    select 1 from public.companies c
    where c.id = company_naics_codes.company_id and c.owner_user_id = auth.uid()
  )
) with check (
  exists (
    select 1 from public.companies c
    where c.id = company_naics_codes.company_id and c.owner_user_id = auth.uid()
  )
);

create policy "company_psc_select_own" on public.company_psc_codes
for select using (
  exists (
    select 1 from public.companies c
    where c.id = company_psc_codes.company_id and c.owner_user_id = auth.uid()
  )
);

create policy "company_psc_write_own" on public.company_psc_codes
for all using (
  exists (
    select 1 from public.companies c
    where c.id = company_psc_codes.company_id and c.owner_user_id = auth.uid()
  )
) with check (
  exists (
    select 1 from public.companies c
    where c.id = company_psc_codes.company_id and c.owner_user_id = auth.uid()
  )
);

-- Reference tables are readable by authenticated users and writable by service role/backoffice.
create policy "naics_read_authenticated" on public.naics_codes
for select to authenticated using (true);

create policy "psc_read_authenticated" on public.psc_codes
for select to authenticated using (true);
