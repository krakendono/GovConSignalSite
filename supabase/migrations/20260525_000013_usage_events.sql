-- GovSignal AI dedicated usage telemetry events

create table if not exists public.usage_events (
  id bigserial primary key,
  actor_user_id uuid references auth.users(id) on delete set null,
  company_id uuid references public.companies(id) on delete set null,
  opportunity_id uuid references public.opportunities(id) on delete set null,
  action text not null,
  provider text,
  model text,
  status text not null default 'success' check (status in ('success', 'error')),
  duration_ms integer,
  input_tokens integer,
  output_tokens integer,
  total_tokens integer,
  estimated_cost_usd numeric(12, 6),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists usage_events_created_at_idx on public.usage_events (created_at desc);
create index if not exists usage_events_action_created_at_idx on public.usage_events (action, created_at desc);
create index if not exists usage_events_provider_model_created_at_idx on public.usage_events (provider, model, created_at desc);
create index if not exists usage_events_status_created_at_idx on public.usage_events (status, created_at desc);
create index if not exists usage_events_actor_created_at_idx on public.usage_events (actor_user_id, created_at desc);
create index if not exists usage_events_company_created_at_idx on public.usage_events (company_id, created_at desc);
create index if not exists usage_events_opportunity_created_at_idx on public.usage_events (opportunity_id, created_at desc);

alter table public.usage_events enable row level security;

drop policy if exists "usage_events_insert_authenticated" on public.usage_events;
create policy "usage_events_insert_authenticated" on public.usage_events
for insert to authenticated with check (
  actor_user_id is null or actor_user_id = auth.uid()
);

drop policy if exists "usage_events_read_admin" on public.usage_events;
create policy "usage_events_read_admin" on public.usage_events
for select using (
  lower(coalesce(auth.jwt() ->> 'email', '')) = any (
    array['admin@govsignal.local']
  )
);

drop policy if exists "usage_events_read_own" on public.usage_events;
create policy "usage_events_read_own" on public.usage_events
for select using (
  actor_user_id = auth.uid()
  or exists (
    select 1
    from public.companies c
    where c.id = usage_events.company_id and c.owner_user_id = auth.uid()
  )
);
