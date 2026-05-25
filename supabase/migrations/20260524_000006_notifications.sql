-- GovSignal AI notifications for opportunity matches

create table if not exists public.watchlist_notifications (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  opportunity_id uuid references public.opportunities(id) on delete cascade,
  notification_type text not null check (notification_type in ('new_match', 'high_match')),
  title text not null,
  body text not null,
  is_read boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, opportunity_id, notification_type)
);

drop trigger if exists set_watchlist_notifications_updated_at on public.watchlist_notifications;
create trigger set_watchlist_notifications_updated_at
before update on public.watchlist_notifications
for each row execute function public.set_updated_at();

alter table public.watchlist_notifications enable row level security;

drop policy if exists "watchlist_notifications_select_own" on public.watchlist_notifications;
create policy "watchlist_notifications_select_own" on public.watchlist_notifications
for select using (
  exists (
    select 1 from public.companies c
    where c.id = watchlist_notifications.company_id and c.owner_user_id = auth.uid()
  )
);

drop policy if exists "watchlist_notifications_write_own" on public.watchlist_notifications;
create policy "watchlist_notifications_write_own" on public.watchlist_notifications
for all using (
  exists (
    select 1 from public.companies c
    where c.id = watchlist_notifications.company_id and c.owner_user_id = auth.uid()
  )
) with check (
  exists (
    select 1 from public.companies c
    where c.id = watchlist_notifications.company_id and c.owner_user_id = auth.uid()
  )
);
