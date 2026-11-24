# T-CARE GitHub Phase 6 / Hostinger Release Reconciliation

**Repository:** `ppt-pixel/T-care`  
**Production frontend:** `https://t-care.in/` on Hostinger  
**Backend:** existing Render service  
**Production database:** existing Supabase project  
**Release base reviewed:** `main` at `3da07641ee79f85ec52fa00b59e188353db20349` (20 Nov 2026)  
**Release source:** `T-CARE-Predeployment-Audited-2026-11-24.zip`

## Actions and constraints

- The current GitHub repository and `main` were inspected read-only.
- No commit, file write, branch update, pull request, merge or deployment was performed.
- Creating `release/phase-6-hostinger` through the connected GitHub integration was attempted but GitHub returned HTTP 403 `Resource not accessible by integration`. The connected integration can read the repository but does not have the required ref-write permission in this session.
- The repository's `main` remains unchanged. Create/push the release branch with the user's local Git credentials using the supplied PowerShell helper, or create it in GitHub UI and check it out locally.

## Reconciliation findings

### Existing repository customizations confirmed present in the release ZIP

The following Git blob hashes matched between current `main` and the audited release source, demonstrating preservation of the project-specific branding/contact assets and several established modules:

- `.gitignore`
- `.node-version`
- `backend/.gitignore`
- `backend/package.json` and `backend/package-lock.json`
- root `package.json` and `package-lock.json`
- `src/landing/content.js` (including `support@t-care.in`)
- `src/landing/Scenes.jsx`
- `src/landing/publicData.js`
- `src/Backgrounds.jsx`, `src/HeroPlant.jsx`, `src/heroPlant.js`
- `src/authNavigation.js`, `src/notificationStore.js`
- `backend/src/server.js`
- `backend/src/middleware/auth.js`, `error.js`, `security.js`
- all three brand image files and `public/favicon.svg`

### Expected Phase 6 implementation additions

The audited ZIP contains the six missing migration directories required for the newer booking, subscription, Plant Store order and QR-payment model; related backend helpers/routes/tests; Phase 6 UI changes; updated release documentation; and Hostinger routing support.

Current `main` has 7 Prisma migrations. The audited source has 13. In particular, it adds:

- `backend/src/routes/orders.js`
- booking idempotency, payment reconciliation, Store order, Subscription plan and Razorpay QR helpers
- six migrations numbered `20261123000100` through `20261123000600`
- backend regression tests for these features
- Phase 6 frontend tests and the Hostinger routing test
- `public/.htaccess`

### Preserved existing public office-address setting

The current repository's `.env.example` and README documented `VITE_PUBLIC_OFFICE_ADDRESS`, while the audited archive's root `.env.example` and README did not. The candidate was reconciled locally to restore this documented setting without changing its code or actual public value. The README was also corrected to identify Hostinger + Render as the active production topology rather than presenting Netlify as the current frontend host.

### Deployment-sensitive settings retained

- `render.yaml` retains `plan: free`, as in the current repository. This is not a production recommendation; the owner must select the correct Render plan in the Render dashboard.
- The newer blueprint keeps owner-managed payment settings `sync: false` and defaults new Store checkout to false. Do not allow a blueprint sync to overwrite existing live values.
- Hostinger must build with `VITE_API_BASE_URL` set to the actual HTTPS Render API origin. `public/.htaccess` provides React Router history fallback only; it is not an API reverse proxy.
- Keep `.env`, backend `.env`, database passwords, Supabase secret keys, JWT secrets and Razorpay secrets out of the repository.

## Supplied local branch preparation

`Prepare-TCARE-Phase6-Hostinger-Branch.ps1`:

1. Verifies the local clone's `origin` is `ppt-pixel/T-care`.
2. Requires a clean worktree and the reviewed `main` commit.
3. Creates local branch `release/phase-6-hostinger` from `main`.
4. Verifies every currently tracked file exists in the audited ZIP before copying.
5. Copies the audited release files without deleting any repository-only extras and without overwriting `.env` secrets, `.git`, `node_modules` or `dist`.
6. Checks the 13 migration directories, Hostinger `.htaccess`, official customer-care email and restored `VITE_PUBLIC_OFFICE_ADDRESS` setting.
7. Runs `git diff --check` and shows the changes.

The helper does not commit, push, merge, or deploy. After reviewing the diff, the owner may commit and push the new branch. Confirm Render is configured to deploy from `main`, not from the release branch, before pushing if Render auto-deploy is enabled.

## No production mutation

No changes were made to GitHub, Render, Hostinger, DNS, Supabase, Razorpay or production customer data by this reconciliation session.
