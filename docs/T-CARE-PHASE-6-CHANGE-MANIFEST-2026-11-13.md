# T-CARE — Phase 6 and Release Audit Change Manifest

**Audit build date:** 13 November 2026
**Base:** `T-CARE-PHASE-6-CHECKPOINT-2026-11-13.zip`
**Purpose:** This manifest records every source/document/config file changed or added in the corrected audit build relative to the original Phase 6 checkpoint.

## Changed files

- `README.md` — clarifies payment/store scope, runtime setup, and legacy prototype cleanup note.
- `README-DEPLOY-NETLIFY-RENDER.md` — same-origin proxy guidance, Render build/runtime settings, Supabase session-pooler guidance and guarded release steps.
- `package.json`, `package-lock.json` — exact frontend dependency versions and runtime metadata aligned.
- `render.yaml` — Node.js 22.22.0, Prisma CLI inclusion during build and `PAYMENTS_ENABLED=false`.
- `netlify.toml` — removed redundant fallback; canonical redirect rules remain in `public/_redirects`.
- `docs/T-CARE-SUPABASE-SETUP.md` — documents the supported single-`DATABASE_URL` Prisma connection mode.
- `docs/T-CARE-PHASE-6-INTEGRATION-SECURITY-RELEASE-READINESS-2026-11-13.md` — updates release gates, Customer billing, media upload integrity and audit outcomes.
- `docs/T-CARE-AUTHENTICATION-IMPLEMENTATION.md` — clarifies existing password API versus missing password UI/recovery flow.
- `docs/T-CARE-SIX-PHASE-TRACKER.md` — tracks follow-up audit corrections and 49 passing backend tests.
- `backend/README.md` — aligns runtime, payment and database instructions.
- `backend/.env.example` — adds the fail-closed payment feature flag and corrected DB connection guidance.
- `backend/package.json`, `backend/package-lock.json` — Prisma build/runtime dependency metadata aligned.
- `backend/src/config/env.js` — parses `PAYMENTS_ENABLED` as false unless explicitly true.
- `backend/src/lib/productRules.js` — fixes stock filter semantics and transactional deactivation helper.
- `backend/src/lib/supabaseStorage.js` — adds private Storage object existence verification using the object-info endpoint.
- `backend/src/routes/products.js` — fixes Admin product deactivation handler and public stock filters.
- `backend/src/routes/payments.js` — adds fail-closed payment policy checks to order, verify, refund and webhook mutations.
- `backend/src/routes/media.js` — refuses to mark media `UPLOADED` until the Storage object exists.
- `src/main.jsx` — top-level React error boundary and Customer billing route.
- `backend/tests/product-rules.test.js` — product deactivation and stock filter regressions.
- `backend/tests/phase6-integration-contract.test.js` — deployment, routing and security contract coverage.

## Added files

- `public/_headers` — Netlify static response security headers.

- `backend/src/lib/paymentPolicy.js` — explicit `PAYMENTS_ENABLED` guard.
- `backend/src/lib/mediaUploadRules.js` — media completion existence rule.
- `backend/src/lib/storageObjectProbe.js` — Supabase object-info URL builder and HEAD status handling.
- `backend/tests/payment-policy.test.js` — feature-gate tests.
- `backend/tests/media-upload-rules.test.js` — media completion rule tests.
- `backend/tests/storage-object-probe.test.js` — object-info endpoint/path encoding and HTTP response tests.
- `docs/T-CARE-RELEASE-AUDIT-AND-CORRECTIONS-2026-11-13.md` — comprehensive audit findings, fixes and release blockers.

## No production mutation

- No GitHub commit or push.
- No Netlify or Render deployment.
- No Supabase database migration.
- No live payment keys, `.env` secrets or provider actions.

## Known validation limits

- The working container uses Node.js `v22.16.0`; the project requires `>=22.22.0 <23`. Re-run tests on Node `22.22.x`.
- Vite build and Prisma generate/validate were not run because their package executables were not available after dependency installation timed out.
- Real Supabase private-bucket upload, database migration rehearsal, browser E2E and payment-provider test-mode verification remain outstanding.
