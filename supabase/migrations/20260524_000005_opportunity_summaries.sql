-- GovSignal AI opportunity summaries

create table if not exists public.opportunity_summaries (
  opportunity_id uuid primary key references public.opportunities(id) on delete cascade,
  summary_text text not null,
  key_points text[] not null default '{}',
  pursue_steps text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists set_opportunity_summaries_updated_at on public.opportunity_summaries;
create trigger set_opportunity_summaries_updated_at
before update on public.opportunity_summaries
for each row execute function public.set_updated_at();

alter table public.opportunity_summaries enable row level security;

drop policy if exists "opportunity_summaries_read_authenticated" on public.opportunity_summaries;
create policy "opportunity_summaries_read_authenticated" on public.opportunity_summaries
for select to authenticated using (true);

drop policy if exists "opportunity_summaries_write_authenticated" on public.opportunity_summaries;
create policy "opportunity_summaries_write_authenticated" on public.opportunity_summaries
for all to authenticated using (true) with check (true);
