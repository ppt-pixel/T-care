# T-CARE — Six-Phase Delivery Tracker

Updated: 23 November 2026

| Phase | Workstream | Implementation checkpoint | Remaining exit validation |
|---|---|---|---|
| 1 | Audit and foundation | Prepared | Vite production build, Prisma validation and deployment-config confirmation |
| 2 | Customer workspace | Prepared | Vite production build, Prisma validation and Customer end-to-end tests |
| 3 | Gardener workspace | Prepared | Vite production build, Prisma validation and Gardener end-to-end tests |
| 4 | Admin workspace | Prepared | Vite production build, Prisma validation and Admin permission/data end-to-end tests |
| 5 | Public website, About and Plant Store | Plant Store catalogue, product detail, browser-persistent cart, server-priced checkout, order workflow, Admin fulfilment and Razorpay UPI QR implementation are included in separate Phase 4/5 packages | Vite production build, Prisma validation, migration review/rehearsal in a test DB, public/Admin Store tests, verified WhatsApp configuration and Razorpay Test Mode QR/checkout/refund/webhook checks |
| 6 | Cross-workspace synchronization, security, regression and deployment readiness | Final source checkpoint prepared: Customer billing ledger and safe payment projection, media object completion checks, deployment guidance, abortable loaders, busy/form locks, skeleton loading states, reduced-motion support and release-readiness contracts; 60 frontend and 131 runnable backend tests passed | Clean Node 22.22.x install, Vite production build, Prisma generate/validate, complete backend tests, migration-ledger review/rehearsal, browser/API E2E across all roles, real provider webhook tests (Test Mode), storage authorization tests and staging smoke tests |

## Phase 6 implementation notes

The 23 November final checkpoint supersedes the older 13 November status below for current implementation scope and test counts. Earlier audit details are retained as historical context.

- Customer billing is now a read-only view of the authenticated `/api/v1/payments/customer` ledger.
- Media upload completion now verifies that the private Supabase Storage object exists before the database asset status can become `UPLOADED`; missing objects return a conflict instead of creating a false uploaded state.
- The Customer payment response uses an explicit allowlist projection. Provider identifiers, idempotency keys and webhook payloads are not exposed in the Customer ledger response.
- Backend Razorpay order/verify/webhook and Admin refund routes exist but are fail-closed by `PAYMENTS_ENABLED=false`; checkout/refund actions are not surfaced in the Customer/Admin UI and no provider test-mode run has been performed. Keep the gate disabled until payment-order concurrency is fixed and covered. No live payment provider credentials were added or activated.
- Netlify production must leave `VITE_API_BASE_URL` unset so frontend requests use the same-origin `/api/*` proxy. Local development may set it to `http://localhost:4000`.
- Phase 6 adds no Prisma schema changes or database migration. The Phase 4/5 additive migrations remain subject to migration-ledger review and test-database rehearsal.

## Release rule

An implementation checkpoint is not a production release. Do not push or deploy until frontend build and Prisma checks pass, the additive Phase 5 migration has been reviewed against the existing Supabase migration history and applied safely in a test environment, and role-based browser/API testing succeeds. Netlify, Render and Supabase production resources have not been modified by these phase checkpoints. Never run `prisma migrate reset` against production.

## Follow-up audit corrections (13 November 2026)

- Fixed Admin product deactivation's undefined variable/runtime error; deactivation and audit logging now run transactionally.
- Added a React top-level error boundary and recovery action.
- Corrected Supabase connection guidance for the current Prisma single-URL setup: Session Pooler port 5432 or direct IPv6 URL, not transaction pooler port 6543.
- Added a `PAYMENTS_ENABLED=false` default gate so gateway credentials alone cannot activate payment mutation/webhook routes.
- Fixed public catalogue `inStock=false` filtering and added coverage for both stock-filter values.
- Pinned frontend package versions to lockfile versions, corrected Render Node/Prisma build configuration, added static Netlify security headers, and removed the duplicated SPA fallback.
- Reconciled documentation about payment endpoints versus absent checkout UI, and made production migration instructions require migration-status review and a non-production rehearsal.
- Follow-up backend suite: 49/49 passing after the final audit changes; Prisma model/table names match 36/36.

## 23 November 2026 final checkpoint

- Frontend suite: 60/60 passed, including six Phase 6 release-readiness contracts.
- Backend suite: 131/131 passed with `account-management.test.js` excluded because `bcrypt` is unavailable in the validation container.
- Frontend parser: 16 JS/JSX files, zero syntax diagnostics; backend `node --check`: 81 JS files passed.
- The container runtime is Node 22.16.0, below the required Node 22.22.x range. Production Vite build, Prisma Client generation/validation, full backend suite, live browser/API E2E and payment provider Test Mode are not verified.
- Phase 6 is an implementation checkpoint only; all release gates remain mandatory. No GitHub, production database, provider account or deployment service was changed.
