-- GovSignal AI proposal workspace drafts

create table if not exists public.proposal_drafts (
  company_id uuid not null references public.companies(id) on delete cascade,
  opportunity_id uuid not null references public.opportunities(id) on delete cascade,
  proposal_summary text not null default '',
  response_strategy text not null default '',
  compliance_checklist text not null default '',
  risk_notes text not null default '',
  question_answers jsonb not null default '[]'::jsonb,
  export_ready boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (company_id, opportunity_id)
);

drop trigger if exists set_proposal_drafts_updated_at on public.proposal_drafts;
create trigger set_proposal_drafts_updated_at
before update on public.proposal_drafts
for each row execute function public.set_updated_at();

alter table public.proposal_drafts enable row level security;

drop policy if exists "proposal_drafts_select_own" on public.proposal_drafts;
create policy "proposal_drafts_select_own" on public.proposal_drafts
for select using (
  exists (
    select 1 from public.companies c
    where c.id = proposal_drafts.company_id and c.owner_user_id = auth.uid()
  )
);

drop policy if exists "proposal_drafts_write_own" on public.proposal_drafts;
create policy "proposal_drafts_write_own" on public.proposal_drafts
for all using (
  exists (
    select 1 from public.companies c
    where c.id = proposal_drafts.company_id and c.owner_user_id = auth.uid()
  )
) with check (
  exists (
    select 1 from public.companies c
    where c.id = proposal_drafts.company_id and c.owner_user_id = auth.uid()
  )
);
