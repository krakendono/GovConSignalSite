-- GovSignal AI historical intelligence tracking

create table if not exists public.opportunity_award_intelligence (
  opportunity_id uuid primary key references public.opportunities(id) on delete cascade,
  award_count integer not null default 0,
  incumbent_vendor text,
  last_award_date date,
  total_award_value numeric(18,2),
  rebid_signal text,
  summary_text text not null default '',
  source_payload jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists set_opportunity_award_intelligence_updated_at on public.opportunity_award_intelligence;
create trigger set_opportunity_award_intelligence_updated_at
before update on public.opportunity_award_intelligence
for each row execute function public.set_updated_at();

alter table public.opportunity_award_intelligence enable row level security;

drop policy if exists "opportunity_award_intelligence_read_authenticated" on public.opportunity_award_intelligence;
create policy "opportunity_award_intelligence_read_authenticated" on public.opportunity_award_intelligence
for select to authenticated using (true);

drop policy if exists "opportunity_award_intelligence_write_authenticated" on public.opportunity_award_intelligence;
create policy "opportunity_award_intelligence_write_authenticated" on public.opportunity_award_intelligence
for all to authenticated using (true) with check (true);
