-- GovSignal AI contract document uploads for proposal context

create table if not exists public.proposal_contract_documents (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  opportunity_id uuid not null references public.opportunities(id) on delete cascade,
  file_name text not null,
  mime_type text,
  extracted_text text not null default '',
  uploaded_at timestamptz not null default now()
);

create index if not exists idx_proposal_contract_documents_company_opportunity
  on public.proposal_contract_documents(company_id, opportunity_id, uploaded_at desc);

alter table public.proposal_contract_documents enable row level security;

drop policy if exists "proposal_contract_documents_select_own" on public.proposal_contract_documents;
create policy "proposal_contract_documents_select_own" on public.proposal_contract_documents
for select using (
  exists (
    select 1 from public.companies c
    where c.id = proposal_contract_documents.company_id and c.owner_user_id = auth.uid()
  )
);

drop policy if exists "proposal_contract_documents_write_own" on public.proposal_contract_documents;
create policy "proposal_contract_documents_write_own" on public.proposal_contract_documents
for all using (
  exists (
    select 1 from public.companies c
    where c.id = proposal_contract_documents.company_id and c.owner_user_id = auth.uid()
  )
) with check (
  exists (
    select 1 from public.companies c
    where c.id = proposal_contract_documents.company_id and c.owner_user_id = auth.uid()
  )
);
