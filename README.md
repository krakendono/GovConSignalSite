# GovConSignalSite

Starter web app for surfacing federal contracting opportunities from the GSA public opportunities API:

https://open.gsa.gov/api/get-opportunities-public-api/

This repository is prepared as the baseline for a master prompt driven build process.

## Stack

- Vite
- React
- TypeScript
- ESLint

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

- Project scaffolded and builds successfully.
- Git repository initialized with first baseline commit.
- VS Code task created at `.vscode/tasks.json`.

## Next phase

Use your master prompt to drive implementation of:

- API client for GSA opportunities endpoint
- Criteria-based filtering and ranking
- Results UI and opportunity details view
- Error handling, loading states, and tests
