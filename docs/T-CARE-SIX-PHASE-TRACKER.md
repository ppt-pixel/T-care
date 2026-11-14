# T-CARE — Six-Phase Delivery Tracker

Updated: 13 November 2026

| Phase | Workstream | Implementation checkpoint | Remaining exit validation |
|---|---|---|---|
| 1 | Audit and foundation | Prepared | Vite production build, Prisma validation and deployment-config confirmation |
| 2 | Customer workspace | Prepared | Vite production build, Prisma validation and Customer end-to-end tests |
| 3 | Gardener workspace | Prepared | Vite production build, Prisma validation and Gardener end-to-end tests |
| 4 | Admin workspace | Prepared | Vite production build, Prisma validation and Admin permission/data end-to-end tests |
| 5 | Public website, About and Plant Store | Prepared; additive product catalogue migration and Admin product manager included | Vite production build, Prisma validation, migration review/application in test DB, public/Admin store tests and verified WhatsApp configuration |
| 6 | Cross-workspace synchronization, security, regression and deployment readiness | Implementation checkpoint prepared; Customer payment history and safe payment projection added; media completion verifies the Supabase object-info endpoint before marking an asset uploaded; same-origin deployment guide corrected; 49 backend tests passing | Vite production build, Prisma validation, migration review in a non-production DB, browser/API E2E across all roles, real provider webhook tests (test mode), storage authorization tests and staging smoke tests |

## Phase 6 implementation notes

- Customer billing is now a read-only view of the authenticated `/api/v1/payments/customer` ledger.
- Media upload completion now verifies that the private Supabase Storage object exists before the database asset status can become `UPLOADED`; missing objects return a conflict instead of creating a false uploaded state.
- The Customer payment response uses an explicit allowlist projection. Provider identifiers, idempotency keys and webhook payloads are not exposed in the Customer ledger response.
- Backend Razorpay order/verify/webhook and Admin refund routes exist but are fail-closed by `PAYMENTS_ENABLED=false`; checkout/refund actions are not surfaced in the Customer/Admin UI and no provider test-mode run has been performed. Keep the gate disabled until payment-order concurrency is fixed and covered. No live payment provider credentials were added or activated.
- Netlify production must leave `VITE_API_BASE_URL` unset so frontend requests use the same-origin `/api/*` proxy. Local development may set it to `http://localhost:4000`.
- Phase 6 adds no Prisma schema changes or database migration.

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
