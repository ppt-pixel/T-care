# T-CARE — Phase 4: Admin Workspace

**Checkpoint date:** 12 November 2026  
**Source baseline:** Phase 3 checkpoint (`/mnt/data/tcare_phase3_work`)  
**Deployment state:** Local checkpoint only; no GitHub push or production deployment.

## Phase objective

Complete the operational Admin workspace with live database-backed records and controls for Customers, Gardeners, bookings, services, subscriptions, plant records, finance visibility and audit activity. Preserve the existing Netlify → Render → Supabase deployment design.

## Implemented

### 1. Admin operations dashboard

- Expanded `/api/v1/admin/overview` with Customers/Gardeners/user counts, active bookings, pending KYC, pending payments, open issues and pending reviews.
- Added a 14-day UTC daily booking series, counting new bookings, completed bookings and cancellations from persisted booking rows.
- Added actual payment collection totals: gross collected, processed refunds, net collected, paid transaction count, paid Gardener payouts and pending Gardener payouts.
- Added active and pending subscription counts.
- Added `/api/v1/admin/recent-activities` backed by `AuditLog` and `/api/v1/admin/popular-services` ranked from non-cancelled booking records.
- Dashboard cards and widgets poll while the page is visible.

**Financial terminology:** The dashboard deliberately uses *gross collected*, *refunded* and *net collected*. It does not label these figures as accounting revenue, profit, or Gardener earnings. Completed booking value is not converted into Gardener earnings because no commission formula has been specified.

### 2. Customer and Gardener records

- Customer account search/status filtering and full profile details remain database-backed.
- Customer detail shows account state, email verification, login dates, addresses and owned plants.
- Gardener records show account status, KYC state, service area, identity documents and review controls.
- Blocking/reactivating an account goes through the Admin API, revokes active refresh sessions and records an audit event.
- KYC review requires at least one submitted document before verification; Gardener receives an in-app status notification.
- User and Gardener views refresh automatically while visible.

### 3. Booking and service administration

- Admin booking view reads persisted bookings, customer identity, service, scheduled time, address, plants, totals and assignment.
- Assignment is limited to active, KYC-verified Gardeners and rejects overlapping assignments.
- Booking transitions use backend transition validation; cancelling paid bookings requires the refund workflow first.
- Service create/update/deactivate and price-tier controls are database-backed and protected by the Admin-only service router.
- Services with booking history are deactivated rather than hard-deleted.

### 4. Subscription plan and subscription administration

- Replaced the deferred `/hq/plans` page with a working Admin subscription workspace.
- Admin can create, edit, activate/deactivate and delete subscription plans.
- Plan durations use the existing validated billing-cycle model, including 1, 3, 6, 12 and 24 months.
- Admin can inspect Customer subscription records and request lifecycle status changes.
- An Admin cannot activate a subscription unless a verified `PAID` payment record exists. No manual payment success control has been added.
- Plans referenced by subscription history are deactivated rather than deleted.
- Existing notification and audit-log behaviour is preserved for subscription status updates.

### 5. Plant database

- Shared plant-care knowledge library remains Admin CRUD.
- Added a separate live, read-only view of Customer-owned plant records, including Customer identity, health status, next-care date and last-updated time.
- Customer-owned plant inventory is not editable or deletable from this tracking view.

### 6. Finance visibility

- Replaced the deferred `/hq/money` page with a read-only payment and payout ledger.
- Shows persisted payment status, customer, booking/subscription reference, amount and paid timestamp.
- Shows persisted Gardener payout records, periods, amounts, status and paid timestamp.
- No payment collection, refund execution or payout status mutation has been added to this UI.

## Security and data-integrity controls

- `/api/v1/admin` router requires authenticated `ADMIN` role.
- Subscription Admin sub-router requires authenticated `ADMIN` role.
- Service management sub-router requires authenticated `ADMIN` role.
- Frontend `/hq/*` routes are gated by the authenticated `ADMIN` role; role is read by the backend from the database-backed session, not trusted from the browser.
- Status changes and operational mutations continue to be written to audit logs.
- Subscription activation cannot bypass verified payment.
- Paid finance and payout data are presented read-only in this phase.
- No Prisma schema change or migration was introduced in Phase 4.

## Validation performed

| Check | Result |
|---|---|
| Backend JavaScript syntax (`src`, `tests`, `scripts`) | Passed — 34 files |
| Backend Node test suite | Passed — 11 tests, 0 failures |
| Frontend JSX/TSX syntax parse (TypeScript `transpileModule`) | Passed — 7 files, 0 syntax errors |
| Root/backend package and lockfile JSON parse | Passed — 4 files |
| Admin/API/frontend-role/security wiring assertions | Passed — 11 checks |
| Prisma schema and migration set comparison against Phase 3 | Unchanged |
| Vite production build | Not run successfully — `vite` executable is not installed in this environment |
| Prisma CLI validation | Not run successfully — `prisma` executable is not installed in this environment |
| Database integration / role-permission E2E / production checks | Not run |

The Vite and Prisma checks are environment blockers, not successful validations. The checkpoint must be installed and verified locally before deployment.

## Local validation commands

From the project root:

```bash
npm ci
npm run build
```

From `backend/`:

```bash
npm ci
npm run prisma:generate
npm test
npm run prisma:validate
```

Phase 4 does not add a database migration. Do not run migrations as part of this phase.

## Explicitly not done

- No changes pushed to GitHub.
- No Netlify or Render deployment.
- No Supabase schema/data changes.
- No payment provider configuration or payment/refund processing changes.
- No payout calculation or Gardener commission formula invented.
- Public website, About page, WhatsApp integration and customer-facing Plant Store remain Phase 5 scope.
- Cross-workspace end-to-end and live production tests remain outstanding.

## Exit assessment

**Phase 4 implementation checkpoint prepared.** Backend tests and static checks pass. Final phase closure still requires a successful local Vite build, Prisma validation and role-based integration tests against a non-production test database.
