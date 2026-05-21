# GovConSignalSite

Starter web app for surfacing federal contracting opportunities from the GSA public opportunities API:

https://open.gsa.gov/api/get-opportunities-public-api/

This repository is prepared as the baseline for a master-prompt driven build process.

## Stack

- Next.js
- React
- TypeScript
- Tailwind CSS

## Local development

1. Install Node.js LTS.
2. Install dependencies:

```bash
npm install
```

3. Start development server:

```bash
npm run dev
```

4. Build for production:

```bash
npm run build
```

## Current status

- Next.js + Tailwind baseline is in place.
- Root route is configured in the app router.
- VS Code task created at `.vscode/tasks.json` as `dev: next`.

## Master Prompt Alignment

Development follows [Docs/Master Prompt Government Contracting.txt](Docs/Master%20Prompt%20Government%20Contracting.txt) as source of truth.
Execution sequencing is tracked in [Docs/MVP_EXECUTION_PLAN.md](Docs/MVP_EXECUTION_PLAN.md).

Current execution target is MVP Phase 1:

- Auth
- Company profiles
- NAICS/PSC storage
- Pull opportunities
- Opportunity dashboard
- Basic filtering
