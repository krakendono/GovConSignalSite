# GovConSignal CRM Revamp Plan

This document resets the product direction from broad AI-driven opportunity ingestion to a CRM-first contract tracking workflow.

## Why The Product Is Changing

The current implementation assumes the platform will:

- pull large batches of SAM.gov opportunities with a platform-managed API key
- generate summaries and research across many records
- expand toward proposal drafting and other higher-cost AI workflows

That direction creates two problems:

- API and model usage costs scale before users have clear day-to-day value
- the product is doing too much automation before the contract tracking workflow is mature

The next version should focus on helping users manage contracts they care about, not trying to analyze the full market for them.

## New Product Direction

GovConSignal should operate as a contract CRM and workflow helper.

Core principles:

- Users upload or import the contract data they want to manage first.
- Users provide and consume their own API key only to monitor tracked contracts for changes.
- Data refresh should happen only for records the user explicitly added to their pipeline.
- The primary value is organization, follow-up, status tracking, deadlines, notes, and next actions.
- AI should be optional, narrow, and manual.
- AI should assist with a single tracked record at a time after the CRM flow is stable.

## Product Outcome

The app should help a user do the following:

1. Save their company profile and targeting criteria.
2. Connect their own API key.
3. Upload or import a specific contract they want to monitor.
4. Add that contract to a tracked pipeline.
5. Use the API to check whether that tracked contract changed.
6. Record status, owner, notes, deadlines, and next steps.
7. Review a dashboard that shows what needs attention.
8. Optionally use AI later for a specific tracked contract, not for broad unattended ingestion.

## Features To Remove Or Defer

These should be removed from the near-term roadmap or converted into manual, user-triggered tools:

- platform-owned bulk SAM.gov sync using a shared backend key
- automatic pulling of large opportunity batches for all users
- AI summaries generated during broad sync runs
- automatic award-intelligence enrichment during sync
- proposal generation as a default workflow
- export-heavy proposal tooling as a primary product focus
- billing work until the CRM workflow and user retention loop are proven

## Features To Keep And Strengthen

These fit the CRM-first direction and should remain:

- authentication
- company profile
- watchlists and targeting preferences
- tracked opportunity statuses such as active, taken, and closed
- dashboard views
- audit logging

These should be expanded:

- contract notes
- follow-up reminders
- ownership and pipeline stages
- user activity history per tracked contract
- uploaded source data and change history
- manual refresh for tracked records
- lightweight contact and document tracking

## Required Product Changes

### 1. Shift From Syncing Opportunities To Tracking Opportunities

Current behavior is centered on syncing a shared pool of opportunities and then ranking them.

Target behavior:

- a user uploads contract data or imports a specific contract record they already care about
- the user decides which contracts to track
- the system stores the uploaded record as the source of truth for the CRM workflow
- the API is used only to check tracked records for status, deadline, or content changes

This means the contract record becomes the center of the workflow, not the sync job.

### 2. Move API Ownership To The User

The SAM.gov key should no longer be treated as a platform-wide operating dependency for core usage.

Target behavior:

- each user can securely save their own API key
- the key is used only for that user's tracked contracts
- refresh jobs operate only against user-selected records
- usage language in the UI makes it clear that API consumption comes from the user's key

### 3. Make Uploaded Contract Data The Starting Point

The product should not depend on a broad search session before a user gets value.

Target behavior:

- the user can upload contract details, paste structured contract data, or import a single identified contract
- the initial record is saved immediately into the CRM
- the app stores the original source data so later refreshes can detect what changed
- change detection becomes a first-class feature: deadline moved, notice updated, status changed, attachments changed, or record closed

### 4. Reposition AI As A Later Helper

AI should not be the engine that drives ingestion.

Initial AI scope after the CRM workflow is stable:

- summarize one tracked contract on demand
- extract action items from one tracked contract on demand
- draft internal notes or follow-up checklists from stored contract data

AI should not yet:

- analyze large result sets automatically
- generate drafts for every opportunity in the database
- run continuously in the background across all tracked users

## Implementation Plan

### Phase 1. Product And Data Model Reset

Goal: align the schema and routes with CRM-first behavior.

Tasks:

1. Define the new primary workflow around tracked contracts instead of synced opportunity batches.
2. Add a secure user API credential model for per-user external API access.
3. Add or revise tables for tracked contracts, uploaded source data, change events, notes, reminders, activity history, and refresh metadata.
4. Decide which current tables stay as-is, which are repurposed, and which are deprecated.
5. Update navigation and copy to use CRM language instead of AI platform language.

Likely existing surfaces to revise:

- `app/opportunities/page.tsx`
- `app/opportunities/actions.ts`
- `lib/samgov.ts`
- opportunity status and dashboard pages

### Phase 2. Replace Bulk Sync With Upload-First Tracking And Selective Refresh

Goal: make uploaded or individually imported contracts the primary workflow, then refresh only those records.

Tasks:

1. Add intake flows for uploaded contract files, pasted structured contract data, and single-record import.
2. Refactor SAM.gov fetch helpers so they can accept a user-scoped key instead of relying only on environment configuration.
3. Replace the current sync action with a tracked-record refresh flow that checks for changes against the stored contract.
4. Store refresh timestamps, source references, fetch errors, and field-level change summaries per tracked contract.
5. Remove or disable bulk sync controls from the UI.

### Phase 3. Build The CRM Workflow

Goal: make the app valuable even with minimal AI usage.

Tasks:

1. Create a tracked contract detail view.
2. Add fields for pipeline stage, owner, next action, due date, and notes.
3. Add reminders and dashboard summaries for overdue follow-up.
4. Add a history log for status changes, refresh events, and detected contract changes.
5. Keep watchlists as targeting helpers, not as autonomous automation drivers.

### Phase 4. De-Scope Expensive AI Paths

Goal: remove accidental cost centers.

Tasks:

1. Turn off automatic AI summary generation during sync or refresh.
2. Turn off automatic award-intelligence enrichment during broad fetches.
3. Mark proposal generation and export features as deferred unless they directly support a tracked-contract workflow.
4. Document exactly where AI adds value and where standard product logic is enough.

### Phase 5. Reintroduce AI Carefully

Goal: only add AI where the ROI is obvious.

Tasks:

1. Add one manual AI action for a tracked contract summary.
2. Measure usage before adding more AI actions.
3. Add clear per-action usage logging.
4. Expand only after users rely on the CRM workflow consistently.

## Recommended Order Of Code Changes

1. Update product copy and planning docs.
2. Add the user API credential data model.
3. Refactor external fetch code to accept user-scoped credentials.
4. Replace bulk sync actions with upload/import plus tracked-record refresh.
5. Add CRM fields and screens for notes, reminders, and next actions.
6. Disable automatic AI enrichment paths.
7. Reassess proposal-prep and export routes after the CRM workflow is stable.

## Existing Areas Most Affected

The current implementation already shows where the pivot needs to happen:

- `lib/samgov.ts` currently requires a shared `SAM_GOV_API_KEY`
- `app/opportunities/actions.ts` currently treats opportunities as a large sync-and-score workflow
- `app/opportunities/page.tsx` currently centers the experience on syncing and ranked match results
- summary, award-intelligence, and proposal-prep flows assume downstream automation after ingestion

## Decisions To Make Before Implementation

1. Should user API keys be stored encrypted in the database, or entered per session until secure storage is added?
2. Which upload formats should be supported first: manual form entry, pasted JSON/text, file upload, or solicitation-number import?
3. Which current proposal-prep features should be hidden immediately versus left in place but marked as deferred?
4. Should watchlists remain broad saved filters, or become simple collections of tracked targets?

## Definition Of Success

This revamp is successful when:

- a user can connect their own API key
- a user can upload or import the contracts they care about
- the API is used only to detect changes on tracked contracts
- the dashboard helps them manage pipeline work without requiring AI
- AI usage becomes deliberate and low-volume instead of automatic and expensive

At that point, the product has a stable foundation for adding higher-value AI features later.