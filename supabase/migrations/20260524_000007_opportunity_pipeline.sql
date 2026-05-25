-- GovSignal AI opportunity pipeline tracking

create table if not exists public.company_opportunity_statuses (
  company_id uuid not null references public.companies(id) on delete cascade,
  opportunity_id uuid not null references public.opportunities(id) on delete cascade,
  status text not null check (status in ('active', 'closed', 'taken')),
  status_source text not null default 'manual' check (status_source in ('manual', 'sync')),
  status_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (company_id, opportunity_id)
);

drop trigger if exists set_company_opportunity_statuses_updated_at on public.company_opportunity_statuses;
create trigger set_company_opportunity_statuses_updated_at
before update on public.company_opportunity_statuses
for each row execute function public.set_updated_at();

alter table public.company_opportunity_statuses enable row level security;

drop policy if exists "company_opportunity_statuses_select_own" on public.company_opportunity_statuses;
create policy "company_opportunity_statuses_select_own" on public.company_opportunity_statuses
for select using (
  exists (
    select 1 from public.companies c
    where c.id = company_opportunity_statuses.company_id and c.owner_user_id = auth.uid()
  )
);

drop policy if exists "company_opportunity_statuses_write_own" on public.company_opportunity_statuses;
create policy "company_opportunity_statuses_write_own" on public.company_opportunity_statuses
for all using (
  exists (
    select 1 from public.companies c
    where c.id = company_opportunity_statuses.company_id and c.owner_user_id = auth.uid()
  )
) with check (
  exists (
    select 1 from public.companies c
    where c.id = company_opportunity_statuses.company_id and c.owner_user_id = auth.uid()
  )
);
