-- GovSignal AI richer proposal section builder support

alter table public.proposal_drafts
  add column if not exists proposal_sections jsonb not null default '{"scope":[],"approach":[],"pastPerformanceClaims":[]}'::jsonb;
