# T-CARE Phase 5 Code Audit

**Audit date:** 9 November 2026
**Audited package:** `T-CARE-PHASE5-COMPLETION-BUILD-2026-11-09.zip`
**Source basis:** The consolidated Phase 5 build derived from the user's `T-care Final(1).zip`.
**Scope:** Static source review, route/component/import checks, Prisma schema/migration inspection, and syntax checks. This is not a live production certification.

## Executive result

The package is structurally consistent and passes the static checks listed below. The audit found several correctness and workflow defects and applied targeted fixes in this audited copy. A full Vite production build, Prisma CLI validation/generation, database migration deployment, and live Supabase Storage/email/browser flows could not be completed in this environment. Do not treat those as passed.

## Defects corrected in this audit copy

1. **Admin verification fields:** Admin user list/detail queries now select `emailVerifiedAt`, matching the frontend's email-verification display.
2. **Booking price tier consistency:** Frontend price estimation and backend booking calculation now use the same matching and precedence rules (most-specific `minPlants`, then latest `effectiveFrom`; generic tiers last).
3. **Booking schedule input:** The `datetime-local` minimum now uses a local-time value rather than slicing a UTC ISO timestamp.
4. **Cancellation consistency:** Added `CANCELLED` to `AssignmentStatus` and an additive migration. Customer/Admin booking cancellation now cancels the linked Gardener assignment in the same database transaction and records the booking status history/notifications.
5. **Gardener double-booking guard:** Admin assignment checks for an overlapping active booking for the selected Gardener and returns a conflict instead of knowingly assigning overlapping visits.
6. **Account status changes:** Admin account status updates revoke the user's active refresh sessions in the same transaction as the status change and audit entry.
7. **Revenue analytics:** Daily refund reporting now aggregates successful refund records by `Refund.processedAt`, rather than inferring refunds from the payment status field.
8. **Customer profile route:** `/garden/me` now renders a database-backed Customer Profile page instead of the generic placeholder. Customer profile API responses include email verification state.
9. **Analytics error visibility:** Failures loading the daily analytics series now render an error notice rather than silently leaving empty tables.
10. **Delete-conflict handling:** Customer plant/address deletion now returns a clear `409` conflict when booking history references the record, rather than relying on a generic database foreign-key error.
11. **KYC data support:** The prior Phase 5 build's Gardener KYC document model/routes/UI and its additive migration were retained and cross-checked against the Prisma schema.

## Static validation performed

| Check | Result |
|---|---|
| ZIP/archive integrity | Passed before audit edits; final archive is rechecked at packaging |
| Backend JavaScript `node --check` | 28 files passed; zero syntax failures |
| JavaScript/JSX TypeScript transpile parse | 38 files; zero parser errors |
| Relative source imports | 39 source files scanned; zero missing relative imports |
| `Phase5.*` references vs exports | 29 referenced; all 29 exported |
| JSON manifests/config files | 4 parsed; zero JSON errors |
| CSS structural brace check | 4 CSS files; zero unbalanced braces |
| Prisma migration lock | PostgreSQL provider confirmed |
| Prisma migrations in package | Initial + email verification + KYC documents + cancelled assignment status (4 total) |
| Real secret files | No `.env`, `.env.local`, `.dev.vars` included; only example templates |

### Not verified in this audit environment

- `npm ci` did not complete within the available execution window. The Vite production build therefore remains unverified.
- Prisma CLI `validate`, `generate`, and `migrate deploy` were not run successfully in the audit environment.
- No live calls were made to the user's Supabase database, Storage bucket, or Gmail SMTP.
- No full authenticated browser/API integration suite was available in the project scripts.

## Remaining functional and production gaps

These are not silently treated as complete. They should be addressed or explicitly accepted before production release.

### High priority

1. **Storage upload completion is not independently verified.** `POST /api/v1/media/:id/complete` currently changes the `MediaAsset` database status to `UPLOADED` after checking ownership, but does not independently confirm that the binary object exists in the configured Supabase bucket. A failed/misreported browser upload can therefore leave an `UPLOADED` database row for a missing object. Add a server-side Storage object-existence check before changing the status and test real upload/download/delete.
2. **Gardener availability is not enforced during Admin assignment.** The assignment endpoint checks account activity, KYC verification and overlapping bookings, but does not validate the selected visit against the Gardener's `GardenerAvailability` schedule or service-area coverage. The current overlap check is also application-level; concurrent assignment requests can race without a database-level constraint/locking strategy. Define timezone/service-area rules and add production-grade conflict protection before relying on automated/high-volume assignment.
3. **CMS public rendering is not wired.** Admin can create/publish/retire CMS records and the backend exposes a public read endpoint, but the public homepage/marketing pages do not currently consume `/api/v1/cms/public/:key`. CMS persistence/admin management exists; published content is not yet shown on public page slots. Define the content keys and placement rules, then wire the public consumers.

### Medium priority

4. **Plant knowledge is Admin-maintained but not yet consumed by Customer/Gardener care experiences.** The Admin CRUD/API exists, but no customer/gardener UI fetches the shared knowledge records for recommendations/care-plan content.
5. **Customer issue history UI is incomplete.** Customers can submit issues and Admin can review/manage them; the customer-facing UI does not yet provide a dedicated list/detail view for tracking previously submitted issues, although the backend exposes the corresponding read endpoints.
6. **Plant deletion can leave Storage orphans.** A plant with booking history is correctly protected from deletion. If a plant without booking history is deleted, associated PlantPhoto rows cascade, but the corresponding `MediaAsset` rows and Storage objects are not explicitly cleaned up. Add a safe cleanup/archive process.
7. **Historical booking address is mutable.** Bookings reference a Customer Address row. Editing that address later can change the address displayed for historical bookings. If visit-location history must be immutable, snapshot the address fields onto the Booking at creation.
8. **External notification delivery is not implemented.** The shipped notification centre creates and reads IN_APP notifications. Email/SMS/push provider delivery is not implemented in this scope; UI should not imply those channels are delivered.
9. **Access token revocation is not immediate on password/status changes.** Refresh sessions are revoked, but an already-issued access JWT can remain usable until its short expiry (currently up to 15 minutes), subject to account-status checks. This is expected for the current design but is not immediate global logout. Add a token-version/session-id check on protected requests if immediate access-token invalidation is required.

### Maintenance note

Some older demo/mock component definitions remain in `src/main.jsx`, although the current authenticated workspace route table maps the primary Customer/Admin/Gardener pages to the Phase 5 API-backed components. They are legacy cleanup debt, not proof that the current Phase 5 route itself is using mock data. Remove them only in a separate controlled cleanup pass to avoid collateral changes.

## Database migrations to apply in the owner's environment

The audited package contains these migrations:

1. `20261004125945_init`
2. `20261107131341_add_email_verification`
3. `20261109000100_add_gardener_kyc_documents`
4. `20261109000200_add_cancelled_assignment_status`

After extracting this audited package and installing dependencies, from `backend` run:

```bash
npx prisma migrate status
npx prisma migrate deploy
npx prisma generate
npx prisma validate
```

Do not run `prisma migrate reset`. The new migrations are additive. Back up the database before applying production migrations.

## Release recommendation

**Suitable for owner-side staging validation after installing dependencies and applying migrations; not yet production-certified.** Complete the outstanding Storage, Gardener availability, CMS public rendering, and live end-to-end checks before declaring Phase 5 fully verified.
