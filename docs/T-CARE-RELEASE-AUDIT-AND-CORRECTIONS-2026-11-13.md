# T-CARE — Release audit and correction report

**Audit date:** 13 November 2026  
**Audited source:** Phase 6 project checkpoint, with corrections applied in this archive  
**Production changes:** None. No GitHub push, Netlify/Render deployment or Supabase migration was performed.

## Executive result

The project is structurally coherent at source/configuration level after the corrections below, but it is **not yet release-cleared**. Build-toolchain, Prisma, database migration and live staging checks remain required.

## Defects corrected

1. **Admin product deactivation runtime error.** The `DELETE /api/v1/products/admin/:id` handler referenced an undefined `input` variable. The handler now calls `deactivateProductWithAudit`, which deactivates the product and writes its audit event in one Prisma transaction.
2. **Public catalogue stock filter.** `inStock=false` was parsed but not applied. The new `buildPublicProductWhere` helper now filters to `stockQuantity = 0`; `true` filters `stockQuantity > 0`.
3. **Render Prisma build dependency.** Render sets `NODE_ENV=production`, while `prisma` is a devDependency. The Blueprint now uses `npm ci --include=dev && npm run prisma:generate` so the CLI exists during build.
4. **Render Node version selection.** The service root is `backend`, so the root `.node-version` is not a reliable selector for that service. `NODE_VERSION=22.22.0` is explicitly configured in the Render Blueprint and the backend package declares the supported Node 22 range.
5. **Floating frontend dependencies.** Direct dependencies declared as `latest` now match exact versions already recorded in `package-lock.json`, including root package metadata.
6. **Duplicate Netlify SPA fallback.** The fallback now lives only in `public/_redirects`, alongside the more-specific `/api/*` proxy. `netlify.toml` retains build/publish/runtime settings.
7. **Static-site security headers.** Added `public/_headers` for no-sniff, frame denial, referrer policy and permissions policy. Express continues to set API response headers separately.
8. **Documentation and release instructions.** Corrected the outdated payment scope, clarified that payment backend routes exist while checkout/refund UI and live provider testing remain incomplete, and removed the instruction to blindly run migrations against an existing Supabase database.
9. **Supabase/Prisma connection guidance.** The schema has one `DATABASE_URL` for both the persistent Render API and Prisma CLI. The example and deployment docs now specify Supabase Shared Pooler Session mode on port `5432` (or a direct IPv6-reachable endpoint), and explicitly reject Transaction Pooler port `6543` for this configuration.
10. **Payment feature gate.** Added server-side `PAYMENTS_ENABLED=false` by default. Payment order creation, verification, refunds and webhook processing fail closed until deliberately enabled. The read-only Customer payment ledger remains available.
11. **Application crash recovery.** Added a top-level React error boundary so an unexpected rendering exception shows a recoverable message and reload action instead of leaving the app blank.
12. **Media completion integrity.** The media completion endpoint previously marked an asset `UPLOADED` based on the database row alone. It now performs a Supabase Storage object-info `HEAD` request at `/object/info/{bucket}/{path}` and returns `409 MEDIA_OBJECT_NOT_FOUND` when Storage returns 404. Other provider errors fail visibly rather than being treated as a missing upload.
13. **Runtime and UI structure checks.** Confirmed both package/lock pairs agree on Node 22.22.x and that a static inventory maps all 36 Prisma model names to migration table names. Added a test to prevent runtime version drift.

## Additional review findings / items still required

### Database and deployment

- The project contains five Prisma migration directories. The additive product catalogue migration `20261112000200_add_product_catalogue` has not been applied to production. Compare all local migration names with the existing Supabase `_prisma_migrations` table and rehearse on a separate database before deployment.
- A source-level schema/migration consistency scan matches all 36 Prisma models to 36 `CREATE TABLE` declarations across the five committed migrations. This is a structural name check only, not a substitute for `prisma validate`, Prisma client generation or an actual migration rehearsal. The new automated suite also guards this model/table name parity.
- Render's free plan can sleep; first API call after inactivity can be slow. Health checks do not guarantee database or storage integration.
- Netlify production must leave `VITE_API_BASE_URL` unset so the browser uses the same-origin API proxy. Render `FRONTEND_ORIGIN` must exactly match the production Netlify origin.

### Payment scope

- `PAYMENTS_ENABLED` defaults to `false` and is set to `false` in the Render Blueprint. Adding gateway credentials alone cannot activate payment mutations or webhook processing.

- Backend Razorpay order-creation, signature-verification, webhook and Admin refund APIs are present. They have not been tested against a Razorpay test account in this audit.
- Customer subscription UI leaves new paid plans pending; checkout is not surfaced. Customer payment history is read-only. The Plant Store has no checkout or order fulfilment.
- Do not enable `PAYMENTS_ENABLED` or add live payment credentials until the payment-order concurrency defect is resolved and test-mode orders, signature verification, webhook retries/duplicates, refunds and subscription activation have been tested end-to-end.
- Payment order creation still relies on a payment lookup plus unique constraints. Subscription payments do not have a unique database constraint on `subscriptionId`; concurrent order requests with different idempotency keys can race, and concurrent requests can each create a separate remote provider order for the same local payment. The feature gate must remain disabled until this is serialized/uniquely constrained and covered by tests. Do not enable checkout.

### Operations and content

- Set the actual verified WhatsApp number and approved public contact details in Netlify build environment variables before publishing contact actions.
- Replace the Terms/Privacy draft placeholder with approved legal content before collecting public customer data or enabling transactions.
- Add a password-change form to Customer/Gardener/Admin account settings and implement a safe forgotten-password/email recovery flow. The authenticated API change-password route exists, but no frontend form or forgotten-password route is present.
- Admin must seed approved services, pricing, subscription plans, plant knowledge and product inventory; empty catalogues are expected until this is done.
- Product catalogue is not order management: do not advertise purchase/delivery until checkout, stock reservation, order status, tax, shipping, refunds and fulfilment are implemented.
- Gardener payout pages show entered payout records only. A commission formula and payout execution process remain undefined.

### Codebase cleanup and remaining product gaps

- The active route table uses the live API-backed workspace components, but older, unmounted prototype/demo components and sample arrays remain in `src/main.jsx`. They are not part of the current routed flow, but should be removed in a separate cleanup after browser route coverage confirms nothing still imports them. Do not reconnect these prototypes to production navigation.
- A top-level React error boundary now catches route-render exceptions and shows a reload recovery action; it does not catch async event-handler or network failures, which continue to use page-level error states.
- Public social links are now omitted unless approved HTTPS account URLs are supplied; unconfigured social actions are not rendered.

### Security hardening recommended

- Authentication rate limiting uses an in-memory per-process map and is applied to the auth router. Add a shared/persistent rate-limit store before horizontal scaling; consider applying targeted limits to media-intent and future payment endpoints.
- Browser E2E should explicitly test upload-intent ownership, signed upload completion against a real private bucket, and denial of cross-account media downloads/deletes. The completion endpoint now checks object existence, but real Storage integration remains untested.
- Verify Admin provisioning and password-change workflow from first login; a forgotten-password recovery flow is still missing.
- Test customer isolation, Gardener booking assignment ownership, Admin-only write operations and webhook signature/amount/idempotency handling on staging.

## Validation executed after corrections

**Audit runtime note:** The available container runtime was Node.js `v22.16.0`, while the project explicitly requires Node `>=22.22.0 <23` and Render is pinned to `22.22.0`. The 49 backend unit tests and syntax checks passed on Node `22.16.0`, but they were not executed on the declared production runtime. Re-run them on Node `22.22.x` as part of the release gate.


| Check | Result |
|---|---|
| Backend automated tests | **49/49 passed** after final audit corrections |
| `node --check` for backend source/scripts/tests | Passed |
| Four package/lock JSON files | 4/4 parsed |
| Frontend JSX/JS parsing | 11 files, zero syntax diagnostics |
| Relative project imports | All checked imports resolve |
| Node runtime manifest parity | Root/backend package and lock engines match |
| `netlify.toml` parse and redirect assertions | Passed |
| `render.yaml` parse and build/runtime assertions | Passed |
| Product deactivation regression tests | Passed |
| Payment feature-gate and React error-boundary contracts | Passed |
| Prisma model-to-migration table-name parity | 36/36 matched |
| Public product stock-filter regression tests | Passed |
| Media upload completion existence-rule tests | Passed |
| Supabase Storage object-info endpoint and HTTP status tests | Passed |
| Vite production build | Not run — Vite not installed; dependency install unavailable |
| Prisma generate/validate | Not run — Prisma CLI not installed |
| Supabase migration rehearsal | Not run — no database credentials; production untouched |
| Browser/API/Storage/Razorpay staging E2E | Not run — no staging environment/credentials |

## Release checklist

- [ ] Run root `npm ci && npm run build` on Node 22.22.x.
- [ ] Use the Supabase Session Pooler URI on port `5432` (or direct IPv6 URL) for the current single-`DATABASE_URL` Prisma configuration; do not use transaction pooler port `6543`.
- [ ] Run backend `npm ci --include=dev && npm run prisma:generate && npm test && npm run prisma:validate`.
- [ ] Compare migration history, backup and rehearse product migration against non-production database.
- [ ] Configure Render and Netlify environment variables; verify exact origin/proxy path.
- [ ] Test Customer, Gardener and Admin flows in a staging deployment.
- [ ] Test private Supabase Storage uploads and ownership checks.
- [ ] Test Razorpay in test mode before considering live credentials.
- [ ] Add approved legal pages, real business contact values, services, plans and product data.
- [ ] Review final Git diff and only then merge/deploy a single consolidated release.

**Release decision:** Hold. The source-level corrections are complete, but build, database and staging gates must pass before production deployment.


## Follow-up: dedicated cleanup (14 November 2026)

The cleanup checkpoint is documented in [`T-CARE-DEDICATED-CLEANUP-2026-11-14.md`](T-CARE-DEDICATED-CLEANUP-2026-11-14.md). It removes the previously identified unmounted prototype/demo workspace components and static sample records from `src/main.jsx`, along with state and helper functions used only by those components. It also removes non-functional App Store/Play Store, Remember me, Forgot password, and unconfigured social/WhatsApp action controls. The browsing cart no longer exposes a fake Checkout button, and 476 unused CSS selector branches for retired screens were removed. Optional social links now render only for owner-supplied HTTPS URLs.

The Terms & Privacy page remains visibly marked as a draft because approved legal content was not supplied; it has not been invented or presented as a final policy. Configuration examples and user-input placeholders remain by design. The final cleanup validation recorded 49/49 backend tests passing on Node.js 22.16.0, zero frontend syntax diagnostics, valid route-export/import references, and no production build because dependency installation could not complete; Node 22.22.x and the Vite build remain release gates.

## Follow-up hardening (15 November 2026)

The following source findings were corrected after the 13 November audit. No production migration or external service was run:

- Subscription payment creation now locks its target row, uses a partial unique database index for pending/authorized subscription payments, and serializes provider-order creation for a local payment. Booking and subscription cancellations now reject while a payment is pending or authorized. The migration `20261115000100_harden_active_subscription_payments` must be reviewed and rehearsed before deployment.
- Gardener dashboards, assigned-job/history routes, service reports and assigned-work media now require the current KYC status to be `VERIFIED`. Profile and KYC-document workflows remain available for onboarding and resubmission.
- Media completion now requires Storage object-info size and content type to match the upload intent; unavailable metadata fails closed.
- Refund overview analytics now include full as well as partial refunds. Protected-route login restores only a destination under the authenticated role workspace; public Green Makeover links use the public route; the verification return action switches back to sign-in.
- Admin notification requests for EMAIL/SMS/PUSH now receive an explicit unavailable response rather than a success-shaped persisted record. The Admin provisioning message now accurately describes the existing password-change API and missing UI/recovery flow.

Validation on the available Node runtime: frontend production build passed with the existing large-chunk warning; Prisma schema validation passed; backend tests passed 55/55 after deployment-contract tests were updated to reference maintained documentation instead of the already-deleted `README-DEPLOY-NETLIFY-RENDER.md`. That deletion was preserved. The runtime was Node 25.3.0 rather than the declared Node 22.x line. No database migration, Supabase Storage, SMTP, Razorpay, or deployed-environment test was performed. Payments must remain disabled until the new migration and provider flows are verified in staging.
