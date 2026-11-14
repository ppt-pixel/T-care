# T-CARE Phase 6 — Integration, Security and Release Readiness

**Checkpoint date:** 13 November 2026  
**Base:** `T-CARE-PHASE-5-CHECKPOINT-2026-11-12.zip`  
**Deployment status:** No GitHub push or production deployment performed.

## Scope completed in this checkpoint

### 1. Cross-workspace routing and role contracts

- Revalidated the React route wrapper for `/garden/*` (Customer), `/crew/*` (Gardener) and `/hq/*` (Admin).
- Added source-contract tests for server-side role guards on Customer, Gardener, Admin and payment endpoints.
- Added an Express router-mount contract test for the core application API modules.
- Verified that the payment webhook raw-body route is registered before `express.json()`.

These are static integration-contract checks. They do not replace browser-based authorization tests against a running API/database.

### 2. Customer billing history

- Replaced the `/garden/billing` deferred placeholder with a read-only Customer payment/refund history page.
- The page calls the authenticated `/api/v1/payments/customer` endpoint and displays recorded payment state, booking/subscription reference and refund state.
- The page does not initiate charges or refunds. It explicitly states that invoice PDF downloads are not currently available.
- Summary values are derived from the Customer's returned payment/refund records, not sample figures.

### 3. Payment response data minimization

- Added `backend/src/lib/paymentView.js` with an explicit Customer-facing payment projection.
- The projection allows only payment identifiers internal to T-CARE, amount/currency/method/status/timestamps, relevant booking or plan labels, and selected refund details.
- Provider IDs, provider name, idempotency keys, provider refund IDs and payment-event payloads are excluded.
- Customer payment list/detail queries select only the relation fields needed by the UI and remain scoped to the authenticated Customer profile.
- Added unit tests that assert the allowlist projection strips the prohibited fields.

### 4. Deployment consistency

- Corrected `README-DEPLOY-NETLIFY-RENDER.md`: do not set `VITE_API_BASE_URL` in Netlify production. Leave it unset so `/api/v1` uses the checked-in same-origin proxy in `public/_redirects`.
- Pinned frontend dependencies to the exact lockfile versions, documented the Node 22.22.0 runtime, fixed Render's Prisma CLI installation command, and removed the redundant Netlify SPA fallback from `netlify.toml`.
- Clarified that the current Prisma schema has a single database URL: use Supabase Session Pooler port `5432` or a direct IPv6 URL; the transaction pooler port `6543` is not the configured choice.
- Added Netlify static-site security headers in `public/_headers`.
- Kept `VITE_API_BASE_URL=http://localhost:4000` as a local Vite-development example in `.env.example`.
- Added a regression test to keep the README and source routing model aligned.
- Preserved the existing Netlify Free, Render Free, Supabase and Brevo deployment architecture.

### 5. Media storage completion integrity

- Media upload completion now checks Supabase Storage object metadata via `HEAD /object/info/{bucket}/{path}` before persisting `UPLOADED`. A missing object (404) returns `409 MEDIA_OBJECT_NOT_FOUND`; malformed requests, authorization errors and provider failures are not misclassified as missing objects.
- The upload-completion rule and Storage probe URL/status behavior have unit coverage. A real private-bucket upload remains an outstanding staging test.

### 6. Database and payment boundary

- Phase 6 introduces no Prisma schema change and no database migration.
- The additive Phase 5 product catalogue migration remains outstanding and must be reconciled against the existing Supabase `_prisma_migrations` history before it is applied.
- No Razorpay credentials were supplied or activated in this checkpoint. `PAYMENTS_ENABLED` is false by default in the backend configuration and Render Blueprint. Payment-order concurrency still needs correction and testing before the gate can be enabled. The Customer page is read-only; no test or live charges were attempted. Backend order/verify/webhook/refund endpoints exist, but test-mode provider validation and Customer checkout UI remain outstanding.

## Validation performed

The audit container had Node.js `v22.16.0`, below the project-declared `>=22.22.0 <23` range. Tests and syntax checks passed on that available runtime, but must be repeated on Node `22.22.x` before release.

| Check | Result |
|---|---|
| Backend JavaScript syntax (`node --check`) | Passed for all backend source, scripts and tests |
| Backend automated tests | **49/49 passed** |
| Frontend JSX/TSX parse (TypeScript `transpileModule`) | Passed for all 11 frontend JS/JSX files; zero syntax diagnostics |
| Package and lockfile JSON parsing | Passed |
| Integration contract tests | Passed as part of backend tests |
| Vite production build | Not run — `npm ci` timed out and Vite is not installed in this environment |
| Prisma generate/validate | Not run — Prisma CLI is not installed in this environment |
| Database migration deployment | Not run — production Supabase must not be modified from this environment |
| Live browser, API, storage and payment-provider E2E | Not run — no staging credentials/environment supplied |

## Required release gates

1. On a machine with dependency access, run from project root: `npm ci && npm run build`.
2. From `backend`: `npm ci --include=dev && npm run prisma:generate && npm test && npm run prisma:validate`.
3. Compare every migration directory with the existing Supabase `_prisma_migrations` history. Test the pending additive product migration on a separate non-production database first. Never reset production.
4. Configure Netlify with `VITE_API_BASE_URL` unset. Confirm `public/_redirects` points to the actual existing Render hostname.
5. Confirm Render `FRONTEND_ORIGIN` exactly matches the production Netlify origin, with no trailing slash.
6. Run role-based staging tests: guest denial, Customer isolation, Gardener assignment ownership, Admin-only management, notification ownership, KYC document access, payment ownership, webhook signature verification and product stock concurrency.
7. Verify actual public business contact variables, including the official WhatsApp number, before publishing contact links.
8. Only after all gates pass, review the final diff and decide on a controlled GitHub commit/deployment.

## Important limitations

- Passing source-contract tests does not prove that Prisma can generate a client, that the database schema is in sync, or that API/database operations work end-to-end.
- No production environment, GitHub `main`, Netlify site, Render service or Supabase database was changed.
- Do not treat this ZIP as an approved production release until the gates above are completed.


## Post-checkpoint audit corrections (13 November 2026)

A follow-up audit identified and corrected additional issues before this archive was frozen:

- Fixed the Admin product deactivation handler, which referenced an undefined `input` variable and would have failed at runtime. Deactivation now uses a transaction helper that saves the `INACTIVE` state and audit entry together.
- Corrected the public products API so `inStock=false` filters to zero-stock products instead of silently omitting the filter.
- Pinned frontend direct dependencies to exact versions already present in the lockfile.
- Updated Render's Blueprint to pin Node.js `22.22.0` and include devDependencies during build; Prisma CLI is a devDependency and would otherwise be omitted when `NODE_ENV=production`.
- Added Netlify `_headers` security policy for static files and consolidated the SPA fallback in `public/_redirects`.
- Added a top-level React error boundary with a reload recovery state.
- Confirmed frontend/backend package engines match their lockfile root metadata; all 36 Prisma model names match migration table declarations (static check only).
- Corrected README scope and migration instructions to distinguish backend payment endpoints from unavailable checkout UI and to prevent blind production migrations.

Post-correction validation: 49/49 backend tests passed; all backend JS files passed `node --check`; 36 Prisma model names match 36 migration table declarations; all JSON manifests parsed; TOML, YAML and deployment contract checks passed. Vite build, Prisma CLI validation and live staging E2E remain unverified because dependencies/provider credentials are not available in this environment.
