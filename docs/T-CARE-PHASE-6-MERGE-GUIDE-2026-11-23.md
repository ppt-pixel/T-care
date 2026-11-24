# T-CARE Phase 6 — Merge Guide

**Target package:** `T-CARE-Phase-6-Final-Integration-Release-Readiness-2026-11-23.zip`  
**Baseline embedded in ZIP:** Phase 5 UPI QR payment implementation dated 23 November 2026.

## Important package behaviour

The ZIP contains the complete source tree from the Phase 5 package plus Phase 6 changes. It is not a patch-only archive. It already includes Phase 3 booking/AutoPay, Phase 4 Plant Store checkout/order processing and Phase 5 UPI QR work. Do not apply the earlier phase ZIPs over this package again.

## 1. Preserve the active project

1. Make a separate backup of the currently active project folder and database migration history.
2. Extract this ZIP into a new directory. The archive root contains `tcare/`.
3. Do not unpack over the live working directory until the source baseline has been compared.
4. Do not copy `.env`, credentials, cookies, signed URLs or `node_modules` from another workspace into the package.

## 2. Confirm the baseline

The intended base is the exact Phase 5 package named in the report. If the target project has changes made after that Phase 5 ZIP, compare and reconcile those changes manually before importing Phase 6 files. Avoid replacing newer fixes with stale package copies.

Use a folder diff or source-control diff to compare the target with the Phase 5 baseline. Then apply only the following Phase 6 changes when the target already contains the same Phase 5 baseline:

### Modified source and documentation files

- `src/main.jsx`
- `src/phase5.jsx`
- `src/phase5.css`
- `src/styles.css`
- `src/store/StoreCheckout.jsx`
- `src/store/storeCheckout.css`
- `src/landing/Pages.jsx`
- `src/landing/Sections.jsx`
- `src/landing/pages.css`
- `README.md`
- `docs/T-CARE-BOOKING-STORE-IMPLEMENTATION-PROGRESS-2026-11-23.md`
- `docs/T-CARE-SIX-PHASE-TRACKER.md`

### Added files

- `tests/phase6-release-readiness-contract.test.js`
- `docs/T-CARE-PHASE-6-FINAL-CHECKPOINT-2026-11-23.md`
- `docs/T-CARE-PHASE-6-STAGING-SMOKE-TESTS-2026-11-23.md`

Phase 6 changes only the frontend source, tests and documentation. It adds no backend runtime changes, Prisma schema changes, migration or environment variable.

## 3. Install and validate on the required runtime

Use Node `22.22.x` (both packages specify `>=22.22.0 <23`). From the project root:

```bash
npm ci
npm test
npm run build
```

From `backend/`:

```bash
npm ci --include=dev
npm run prisma:generate
npm test
npm run prisma:validate
```

Do not ignore any failed test. This container could not run the bcrypt-dependent backend test because `bcrypt` was unavailable; the complete backend suite must pass on the merge candidate.

## 4. Database and provider gates

Phase 6 adds no migration. The package includes existing Phase 4/5 additive migrations:

- `20261123000500_plant_store_orders`
- `20261123000600_qr_payment_sessions`

Before applying either migration, compare the full migration directory set with the actual Supabase `_prisma_migrations` ledger. Take a backup, rehearse on a separate non-production database and inspect the exact pending SQL. Never run `prisma migrate reset` against production.

Payment flags remain false by default. Do not enable `PAYMENTS_ENABLED`, `RAZORPAY_SUBSCRIPTIONS_ENABLED`, `STORE_CHECKOUT_ENABLED` or `RAZORPAY_QR_ENABLED` merely because the code is present. First validate the relevant Test Mode provider events, signed webhooks, cancellations, expiry, late capture and refund handling. Merchant QR API eligibility must be confirmed separately.

## 5. Staging sign-off

Execute every applicable test in:

`docs/T-CARE-PHASE-6-STAGING-SMOKE-TESTS-2026-11-23.md`

The test matrix covers Guest, Customer, Gardener and Admin permissions; auth/session recovery; bookings and subscription credits; media storage; Plant Store cart/stock/checkout; order fulfilment; payment and QR reconciliation; refund handling; and responsive layouts.

Record the exact build hash, Node version, test output and provider event references. Resolve failures and repeat the full matrix after the final merge.

## 6. Deployment boundary

This package has not been pushed to GitHub or deployed. Do not point production Netlify/Render at it until the checks above pass and an authorized release decision is made. Keep production database and payment flags unchanged during merge review.

## 7. Production release candidate correction (23 November 2026)

The production runbook added after the initial Phase 6 package includes a small backend configuration hardening change so Razorpay Test Mode can be exercised on a production-like staging service without disabling production cookie and trusted-origin security behaviour.

Additional modified files in the release-candidate archive:

- `backend/src/config/env.js` — validates optional `RAZORPAY_MODE` (`test` or `live`).
- `backend/src/lib/paymentPolicy.js` — validates Razorpay key prefixes against `RAZORPAY_MODE`, independent of `NODE_ENV`; defaults to `live` in production and `test` elsewhere; rejects live mode outside production.
- `backend/.env.example` — local/staging example uses `RAZORPAY_MODE=test`.
- `render.yaml` — declares `RAZORPAY_MODE` as owner-managed (`sync: false`).
- `backend/tests/payment-policy.test.js` and `backend/tests/phase6-integration-contract.test.js` — cover production-like staging with test credentials and the deployment setting.
- `README.md` and `docs/T-CARE-PAYMENT-SECURITY.md` — describe the separated provider mode.
- `docs/T-CARE-PRODUCTION-RELEASE-RUNBOOK-2026-11-23.md` — exact staging and production procedure.

For an isolated staging service set `NODE_ENV=production` and `RAZORPAY_MODE=test` with `rzp_test_` credentials. This retains HTTPS Secure cookies, HSTS, proxy awareness and trusted-origin enforcement. For the actual production service set `NODE_ENV=production` and `RAZORPAY_MODE=live` with matching `rzp_live_` credentials. Keep all four feature flags false until individually approved. No payment secret is included in the archive.
