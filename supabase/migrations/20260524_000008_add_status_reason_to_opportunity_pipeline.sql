-- Backfill for opportunity pipeline reason tracking

alter table public.company_opportunity_statuses
add column if not exists status_reason text;
