# T-CARE — Pre-Deployment Technical Audit

**Audit date:** 24 November 2026  
**Audited source:** `T-CARE-Final-Release-Candidate-2026-11-23.zip`  
**Scope:** static source/configuration review and local automated checks only. No production deployment, production database, live provider, GitHub repository, or production environment was accessed or changed.

## Executive result

The source archive is structurally intact. Frontend workspace routes are registered, all statically visible frontend API route groups map to Express route mounts, environment variables referenced by backend source are defined in the validation schema, and the available automated tests pass apart from a backend test file that cannot load because dependencies are not installed in this audit environment.

A Hostinger SPA fallback was added at `public/.htaccess` and is covered by a regression contract test. This fixes direct navigation/refresh routing for Hostinger when the `dist` contents are uploaded at the site document root. It does **not** proxy backend API requests; Hostinger builds must set `VITE_API_BASE_URL` to the actual public HTTPS backend origin before `npm run build`.

**Release status: not yet cleared for deployment.** Clean install/build, the complete backend suite, Prisma validation, staging database migration rehearsal, browser E2E and Razorpay Test Mode checks remain outstanding.

## Checks completed

| Area | Result | Detail |
|---|---|---|
| ZIP archive | PASS | `unzip -t` reports no compressed-data errors. |
| Frontend automated tests | PASS | 64/64 passed after adding four hosting/navigation contract tests. |
| Backend automated tests | PARTIAL | 131/131 passed when excluding `account-management.test.js`. |
| Full backend suite | BLOCKED | `account-management.test.js` cannot load because `bcrypt` is not installed in the audit environment; `bcrypt` is declared in `backend/package.json` and its lockfile. |
| JavaScript syntax | PASS | 81 backend JS files and 21 frontend/test JS files passed `node --check`. |
| Frontend production build | NOT VERIFIED | `vite` is not installed in this environment; `npm run build` stops with `vite: not found`. |
| Node runtime | NOT COMPLIANT HERE | Audit runtime is Node 22.16.0; project requires `>=22.22.0 <23` and `.node-version` specifies 22.22.0. |
| JSON/YAML configuration | PASS | Both package manifests/lockfiles parse as JSON; `render.yaml` parses as YAML. |
| Environment contract | PASS | No backend `env.*`/`process.env.*` reference is missing from the Zod schema; all schema keys exist in `backend/.env.example`. |
| Migration inventory | INVENTORIED | 13 migration directories are present. Production/staging ledger comparison is not possible from the ZIP alone. |
| Sensitive file scan | PASS | No actual `.env`, private key, cookies file, `node_modules`, `.git` or `dist` directory is included. No live credential pattern was found in source files. |
| Static assets | PASS | Referenced T-CARE brand assets exist under `public/brand/`. |

## Route and API wiring

### Frontend routes

The declared React Router configuration covers the public pages, Customer workspace (`/garden/...`), Gardener workspace (`/crew/...`), Admin workspace (`/hq/...`), Plant Store checkout/order pages, payment return routes and a wildcard not-found route.

A new test verifies all sidebar navigation destinations are registered. Protected workspace routes are wrapped in `ProtectedRole`; the API independently enforces roles through backend middleware. Store order detail and checkout are not workspace-wrapped, but their page components explicitly require a signed-in Customer before loading or submitting order data.

### API routes

All statically visible frontend API groups map to registered Express mounts:

- `/auth`
- `/customer`
- `/services`
- `/bookings`
- `/gardener`
- `/media`
- `/reviews-issues`
- `/subscriptions`
- `/payments`
- `/notifications`
- `/admin`
- `/cms`
- `/analytics`
- `/products`
- `/orders`

The backend also exposes `/api/v1/health`. Payment webhooks are registered before JSON parsing so the raw request body remains available for signature validation. No unmatched API root prefix was found in the static frontend request scan.

## Deployment configuration findings

### Netlify target

The package is configured for Netlify + Render:

- `netlify.toml` builds to `dist`.
- `public/_redirects` proxies `/api/*` to `https://t-care-api.onrender.com/api/:splat` before the SPA fallback.
- Production `VITE_API_BASE_URL` should remain unset for this Netlify same-origin proxy pattern.

The actual Render hostname still must be confirmed against the deployed Render service.

### Hostinger target

This project has previously used Hostinger for the frontend and Render for the backend. The archive did not originally contain an Apache SPA fallback. Added:

- `public/.htaccess` — serves real assets/directories normally, excludes `/api/*` from the SPA fallback, and rewrites frontend history routes to `index.html`.
- `docs/T-CARE-HOSTINGER-ROUTING-ADDENDUM-2026-11-24.md` — explains the required build-time API origin and post-publish checks.
- `tests/hosting-routing-contract.test.js` — verifies Hostinger and Netlify routing configuration plus registered workspace routes.

**Hostinger API requirement:** production currently defaults `VITE_API_BASE_URL` to an empty string. Before a Hostinger production build, set it to the actual HTTPS API origin (or a custom API subdomain) in the build environment. A variable added only after uploading the static `dist/` folder will not change the built JavaScript. The `.htaccess` file is not an API reverse proxy.

For Render, set `FRONTEND_ORIGIN` to the exact browser-visible frontend origin, with scheme and host only and no trailing slash. Production auth cookies are `Secure`, `HttpOnly` and `SameSite=None`. Cross-origin browser cookie restrictions can affect a Hostinger-to-Render domain pairing; a custom API subdomain on the same site as the frontend is preferable where available.

### Render operational settings

`render.yaml` currently specifies `plan: free`. This is a configuration choice, not a source-code error, but the owner should select a production-appropriate always-on service plan before accepting production traffic. The service environment also requires real Supabase, JWT and email settings; payment variables remain disabled until their separate checks pass.

## Required before deployment

1. Use Node 22.22.0 and run clean installs from the project root and `backend/`.
2. Run all frontend tests and `npm run build`; confirm `dist/index.html`, `dist/_redirects` (Netlify) and `dist/.htaccess` (Hostinger) are present as applicable.
3. Run the complete backend suite, including `tests/account-management.test.js`, then run `npm run prisma:generate` and `npm run prisma:validate`.
4. Compare all 13 source migrations with the target Supabase `_prisma_migrations` ledger. Back up and rehearse pending migrations against a separate staging database before any production migration.
5. Test Guest, Customer, Gardener and Admin flows on staging, including direct route refresh, auth/session refresh/logout, role isolation, file upload/download, bookings, subscription entitlements, Store inventory, payment/refund and webhook paths.
6. Confirm private `tcare-media` bucket permissions and approved public contact/business data.
7. Complete Razorpay Test Mode checkout, UPI AutoPay, QR, cancellation, expiry, webhook replay/late capture and refund verification. Check merchant feature entitlements.
8. Keep all payment feature flags false until each corresponding database, merchant, staging and owner-approval gate passes.

## Files added by this audit

- `public/.htaccess`
- `docs/T-CARE-HOSTINGER-ROUTING-ADDENDUM-2026-11-24.md`
- `docs/T-CARE-PREDEPLOYMENT-AUDIT-2026-11-24.md`
- `tests/hosting-routing-contract.test.js`

No backend runtime code, database migration, production secret or live integration setting was changed.
