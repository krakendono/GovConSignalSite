-- GovSignal AI admin + audit foundation

create table if not exists public.admin_user_status (
  user_id uuid primary key references public.users(id) on delete cascade,
  account_status text not null default 'active' check (account_status in ('active', 'restricted')),
  notes text,
  updated_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth.users(id) on delete set null,
  target_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity_type text,
  entity_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

drop trigger if exists set_admin_user_status_updated_at on public.admin_user_status;
create trigger set_admin_user_status_updated_at
before update on public.admin_user_status
for each row execute function public.set_updated_at();

alter table public.admin_user_status enable row level security;
alter table public.audit_logs enable row level security;

drop policy if exists "admin_user_status_read_admin" on public.admin_user_status;
create policy "admin_user_status_read_admin" on public.admin_user_status
for select using (
  lower(coalesce(auth.jwt() ->> 'email', '')) = any (
    array['admin@govsignal.local']
  )
);

drop policy if exists "admin_user_status_write_admin" on public.admin_user_status;
create policy "admin_user_status_write_admin" on public.admin_user_status
for all using (
  lower(coalesce(auth.jwt() ->> 'email', '')) = any (
    array['admin@govsignal.local']
  )
) with check (
  lower(coalesce(auth.jwt() ->> 'email', '')) = any (
    array['admin@govsignal.local']
  )
);

drop policy if exists "audit_logs_insert_authenticated" on public.audit_logs;
create policy "audit_logs_insert_authenticated" on public.audit_logs
for insert to authenticated with check (true);

drop policy if exists "audit_logs_read_admin" on public.audit_logs;
create policy "audit_logs_read_admin" on public.audit_logs
for select using (
  lower(coalesce(auth.jwt() ->> 'email', '')) = any (
    array['admin@govsignal.local']
  )
);
