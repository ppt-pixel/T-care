# T-CARE Phase 2 — Customer Workspace Implementation Checkpoint

Date: 2026-11-12  
Repository baseline: `ppt-pixel/T-care` `main` at `73ff1bef5fdb9beffae6eac4fd1d37931514be9a`  
Working scope: Customer workspace only.  
Production deployment: unchanged; no push to GitHub and no Netlify/Render deployment.

## Phase 2 scope

This phase implements Customer-specific improvements from the owner's requirements:

- Customer-reported plant-health and care updates.
- Care-history records and notifications to Gardeners assigned to active visits for the affected plant.
- More understandable service booking intent and selected-plant count while keeping server-side pricing and booking validation authoritative.
- Live, database-derived most-booked service ranking.
- Customer subscription catalogue, subscription history and supported status actions.
- Correct calendar-aware subscription-period calculation for monthly, six-month, twelve-month, yearly, weekly and daily intervals.
- Visibility-aware polling for relevant Customer dashboard, bookings, plant, subscription and notification data.

## Implementation details

### Backend

- `backend/src/lib/billingPeriod.js` — shared parser and date calculator for subscription billing cycles. Month-end and leap-day values are clamped rather than overflowing into the next month.
- `backend/src/routes/subscriptions.js` — validates new/updated plan billing-cycle strings; preserves unpaid subscription requests as `PENDING`; creates Customer notifications for request, cancellation, pause/resume and Admin status changes; restricts Admin activation until a matching verified `PAID` payment with `paidAt` exists; uses the shared duration helper for renewal dates.
- `backend/src/routes/payments.js` — uses the same duration helper when a verified provider payment activates a pending subscription; a supported duration is required inside the payment transaction. A newly activated Customer subscription also generates an in-app notification after the payment transaction commits.
- `backend/src/routes/customer.js` — accepts validated customer health status and next-care changes; records a plant-care history entry and audit log; notifies Gardeners assigned to active visits involving that plant. Existing ownership checks remain in force.
- `backend/src/routes/services.js` — adds `GET /api/v1/services/popular?range=7d|30d|all`, derived from persisted, non-cancelled booking records and active services.
- `backend/package.json` — adds a Node test-runner command.
- `backend/tests/billing-period.test.js` — five focused billing-period tests.

### Frontend

- `src/phase5.jsx` — Customer dashboard, plants, plant detail, booking, visits, notifications and subscriptions are connected to their corresponding live APIs. Polling is opt-in, visibility-aware, and avoids overlapping requests.
- `src/main.jsx` — `/garden/plan` now uses the Customer subscription page; Customer navigation label reflects subscriptions.
- `src/phase5.css` — responsive styling for the booking-intent summary, popularity panel and subscription cards/history.

## Data safety and migration impact

- No Prisma schema changes were made in Phase 2.
- No database migration is required for this phase.
- No production database or Supabase data was read, written, reset or migrated during this implementation.
- New subscription requests remain `PENDING`; the new UI does not claim payment has happened and does not create a fake successful checkout.
- Plan activation requires a recorded paid payment. Future online checkout remains a separate provider/UI integration step.
- Customer plant ownership checks are retained; Gardener notifications are scoped to Gardeners assigned to active bookings associated with the changed plant.
- Existing Netlify same-origin proxy and Render deployment configuration are preserved.

## Validation evidence

| Check | Result | Evidence |
|---|---|---|
| Backend JavaScript syntax | PASS | `node --check` over backend `src`, `scripts` and `tests` |
| Billing-period unit tests | PASS | `node --test backend/tests/*.test.js` — 5 passed, 0 failed |
| Frontend JSX/JS syntax parse | PASS | TypeScript parser used on 10 frontend JS/JSX files — 0 parse errors |
| Root/backend `package.json` and lockfile JSON parsing | PASS | JSON parse check |
| Customer API/UI wiring assertions | PASS | Static checks for routes, ownership, Gardener/Admin/payment notifications, subscription screen, popularity API and polling |
| Netlify proxy preservation | PASS | `public/_redirects` retains `/api/*` proxy before SPA fallback |
| Vite production build | BLOCKED | `npm run build` returns `vite: not found` because dependencies are absent |
| Dependency installation | BLOCKED | `npm ci --no-audit --no-fund --prefer-online` timed out; offline cache lacks required Vite package |
| Prisma CLI/schema validation | NOT RUN | Prisma CLI is not installed in this working environment; no schema changes were made |
| Live Customer workflow | NOT RUN | Requires local dependency installation and a safe test environment; production was not modified |

## Exact build verification required to close Phase 2

From the project root on a machine with network access:

```bash
npm ci
npm run build
```

Then from `backend`:

```bash
npm ci
npm run prisma:generate
npm test
```

`npm run prisma:validate` may also be run from `backend` as a schema integrity check. There are no new migrations to apply for Phase 2.

After those pass, test using a non-production/test account and a non-production/test database where possible:

1. Update a Customer-owned plant's health and notes; confirm the PlantCareRecord persists after refresh.
2. Confirm only Gardeners assigned to active bookings involving that plant receive the update.
3. Confirm `/services/popular` returns booking-derived data, including an empty result where no bookings exist.
4. Request a Customer subscription; verify it remains `PENDING` without a verified paid payment.
5. Verify an Admin cannot activate that unpaid subscription.
6. Verify a valid paid provider event activates the subscription with the correct six- or twelve-month renewal date.
7. Verify Dashboard, plant detail, bookings, visits, subscriptions and notifications refresh without a hard reload and stop polling when the tab is hidden/unmounted.

## Phase status

**Implementation checkpoint prepared; Phase 2 is not yet release-complete.** The application code checks that can run without installed dependencies pass. The production Vite build and Prisma CLI checks remain blocked by dependency installation in the current environment. Phase 3 has subsequently been implemented in a separate isolated work copy at the owner's explicit direction. Phase 2 remains release-validation blocked; neither Phase 2 nor Phase 3 should be merged or deployed until the build and applicable integration checks have passed.
