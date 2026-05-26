# GovSignal AI MVP Execution Plan

This plan is derived from `Docs/Master Prompt Government Contracting.txt` and is treated as implementation source of truth.

## Non-negotiable Rules

- Website only (no desktop app).
- AI assists users; it never auto-submits proposals.
- Human review required before submission.
- Use verified company/user data only.
- Explicitly mark uncertainty and missing information.
- Never invent qualifications, certifications, pricing, staffing, or legal claims.

## Current Build Phase

Phase 1: Foundation+

- Auth
- Company profiles
- NAICS/PSC storage
- Opportunities ingestion and storage
- Dashboard and admin oversight
- AI summaries
- Expanded baseline match scoring
- Notifications for new/high-value matches

## Build Order Lock

1. Next.js app
2. Tailwind
3. Supabase
4. Auth
5. Database schema
6. Company profile system
7. Watchlists
8. SAM.gov opportunities integration
9. Opportunity storage
10. Dashboard
11. AI summaries
12. Match scoring
13. Notifications
14. Historical intelligence
15. Proposal generation
16. Exports
17. Stripe
18. Admin

## Decision Policy

When uncertain or scope expands unexpectedly, return to the current MVP phase and ship the smallest working increment.

## Delivered So Far


## Next Build Slice

## Step 14 Progress

- Historical awards intelligence table, fetch helper, and opportunity-page display are implemented.
- Sync now stores awards-history summaries for the highest-priority matches when Contract Awards API settings are available.

## Step 15 Progress

- Proposal preparation foundation is implemented with a server-rendered brief page for each opportunity.
- The new brief uses verified company profile data, opportunity metadata, and stored historical intelligence only.
- AI-assisted research now extracts contact emails and likely supporting documents from the raw SAM payload when available, with a safe fallback when no model is configured.

## Step 16 Progress

- Proposal workspace now supports editable draft sections, AI-generated pre-drafting questions, and DOCX/PDF exports.
- The active pipeline view includes a direct link into the proposal workspace for each active opportunity.

## Next Build Slice

- Step 17: Stripe.
