# T-CARE Phase 3 — Gardener Workspace Implementation Checkpoint

Date: 2026-11-12  
Repository baseline: `ppt-pixel/T-care` `main` at `73ff1bef5fdb9beffae6eac4fd1d37931514be9a`  
Working scope: Gardener workspace only.  
Production deployment: unchanged; no push to GitHub and no Netlify/Render deployment.

## Phase 3 scope

Implements Gardener requirements from the owner-provided `Pending worktxt.txt`:

- Live dashboard for today's jobs, next visit, Gardener rating, KYC/service-area summary and gross completed booking value.
- Automatic refresh of the dashboard, job list, job detail, availability and payout ledger while their pages are open and the browser tab is visible.
- Visibility of Customer-submitted plant health/care updates that relate to plants in this Gardener's active assigned visits.
- Gardener ability to add/remove existing Customer-owned plants from an assigned visit before service starts.
- Per-plant health condition, observation notes and care recommendations in the service report.
- Real payout ledger view, including total paid, pending amount and last paid payout.
- Availability schedule creation, editing, pausing/resuming and deletion.
- Existing accept/reject, on-the-way, arrived, start-service, report, photo evidence and completion workflow retained.

## Implementation details

### Backend

- `backend/src/routes/gardener.js`
  - `GET /api/v1/gardener/dashboard` returns today's jobs using client-local day boundaries, monthly completed job count and gross completed booking value, next scheduled visit, recent Customer care updates tied to active assignments, rating/KYC/service area and count of active availability slots.
  - `GET /api/v1/gardener/payouts` returns only the authenticated Gardener's payout records, paid/pending totals and latest paid payout.
  - `GET /api/v1/gardener/jobs/:id/plants/available` lists other plants from the same Customer profile that can be added to this assigned visit.
  - `POST /api/v1/gardener/jobs/:id/plants` and `DELETE /api/v1/gardener/jobs/:id/plants/:plantId` update only the BookingPlant join records for the assigned visit; they require ownership through the assigned Booking and Customer profile, and are locked once service work starts.
  - Plant-list changes are audit logged and notify the Customer.
  - Existing route-level `requireAuth` and `requireRole('GARDENER')` remain in force.
- `backend/src/lib/gardenerRules.js` — pure visit-edit permission and completed-service-value helpers.
- `backend/tests/gardener-rules.test.js` — verifies permitted and denied visit plant-list states and confirms gross booking value is not converted into a commission estimate.
- `backend/src/routes/serviceExecution.js` persists per-plant health, condition notes and care recommendations; creates/updates plant care history; notifies the Customer when a Gardener saves plant-health updates; and now explicitly clears `Plant.nextCareAt` when the report submits a null date. Existing report/photo/completion validation remains in force.

### Frontend

- `src/phase5.jsx`
  - Gardener dashboard replaced the basic assignment count with API-backed metrics, next visit, today's job list, customer plant updates, rating and availability summary.
  - Job list/detail polling is visibility-aware. Job detail includes the safe visit plant-list editor.
  - Plant-specific service report inputs include condition status, notes and care recommendations.
  - Availability supports edit, pause/resume and delete, not only create/delete.
  - Payout page reads the authenticated Gardener payout endpoint instead of the old out-of-scope placeholder.
- `src/main.jsx` — `/crew/pay` now resolves to `GardenerPayoutsPage`.

## Data ownership and financial rules

- A Gardener may only add/remove an existing plant from their own assigned Booking's visit list. This does not create, rename or delete the Customer's permanent Plant record.
- Visit plant-list edits are disabled after service starts. Reports may update plant health/care details for plants associated with that Booking.
- Customer notifications use the related Customer profile's `userId`, not the Customer profile ID.
- `grossCompletedBookingValue` is the sum of completed Booking totals in the selected local month. It is a gross service-volume metric, **not** Gardener take-home earnings.
- The payouts page shows only actual `Payout` records. No commission percentage, deduction or earning formula has been invented.
- Weekly availability is a schedule the Gardener maintains. This phase does not pretend to provide GPS tracking or an online/offline presence signal.

## Data migration impact

- No Prisma schema changes were made.
- No SQL migration is required.
- No production database, Supabase data or live deployment was modified.
- Netlify same-origin API proxy, Render configuration, Supabase and Brevo settings are preserved.

## Validation evidence

| Check | Result | Evidence |
|---|---|---|
| Backend JavaScript syntax | PASS | `node --check` over backend `src`, `scripts` and `tests` |
| Backend unit tests | PASS | `npm test` from `backend` — 8 passed, 0 failed |
| Gardener rule tests | PASS | 3 focused tests for visit-list permission and gross service value |
| Frontend JS/JSX parsing | PASS | TypeScript parser checked all 10 JS/JSX files under `src`; 0 parse errors |
| Root/backend package JSON | PASS | Parsed successfully |
| Gardener route/UI wiring | PASS | 15/15 static checks confirmed role guard, dashboard, payouts, plant-list ownership/lock, reports, notifications, availability, `/crew/pay`, proxy and no migration/secret changes |
| Role and ownership guards | PASS — static review | Router requires authenticated GARDENER; plant lookup is constrained to assigned Booking's Customer; list edits locked after service start |
| Prisma CLI validation | NOT RUN | Prisma CLI is not installed in this working environment |
| Vite production build | BLOCKED | Vite/dependencies are not installed in this working environment; prior `npm ci` attempts timed out |
| Live Gardener workflow | NOT RUN | Requires local dependency install and a safe test database/account; production was not modified |

## Manual integration checklist

Use a test Gardener account assigned to a test Customer Booking and a non-production database where possible:

1. Open `/crew`; confirm today's jobs, next scheduled visit, rating, active availability count and monthly completed value load from API records.
2. Update a Customer plant's health/notes while it is attached to an active assigned visit; confirm the Gardener's dashboard displays the update and its timestamp.
3. Before service starts, add another existing plant from the same Customer collection to the visit. Confirm the Customer receives a notification and the Customer's master plant collection is unchanged.
4. Remove a plant from the visit. Confirm it remains in the Customer's master plant collection.
5. Attempt to add/remove after the assignment enters `IN_PROGRESS`; the API must return `409 VISIT_PLANT_LIST_LOCKED`.
6. Save service report with per-plant health, condition notes, recommendations and next-care date; confirm the Customer's Plant and care history update after refresh.
7. Complete all report checklist items, complete the job, then confirm it appears in completed history.
8. Open `/crew/pay`; verify only this Gardener's actual Payout records and the last paid payout are shown. With no payout rows, the page should show an empty state, not fabricated values.
9. Add, edit, pause, activate and delete weekly availability slots; overlapping intervals should continue to be rejected by the server.
10. Try a Customer/Admin token against Gardener routes; the role guard must reject it.

## Phase status

**Implementation checkpoint prepared; Phase 3 is not yet release-complete.** Backend syntax, unit tests and frontend parse checks pass. Prisma CLI validation, Vite production build and live integration checks remain outstanding because dependencies and a safe test environment are unavailable here. Do not merge or deploy this checkpoint to production until those gates pass and the owner reviews the checkpoint.
