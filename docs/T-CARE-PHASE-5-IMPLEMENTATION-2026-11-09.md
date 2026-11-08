# T-CARE Phase 5 — Business Functionality Implementation

**Source of truth:** `T-care Final(1).zip` uploaded on 9 November 2026.
**Scope:** Phase 5 business functionality from the owner's ten-item checklist.
**Payment scope:** Payment processing, payment webhooks, refunds, payouts, and payment-dependent subscription billing remain excluded.

## Implementation summary

This build connects the Customer, Gardener, and Admin workspaces to the PostgreSQL-backed API modules already present in the project, fills missing backend/frontend integration gaps, and adds persistent Gardener KYC document records. It preserves the existing T-CARE visual system and cookie-based authentication model.

### 1. Service catalogue, categories, and pricing

- Public service catalogue returns active services and currently effective price tiers.
- Admin service CRUD supports create, edit, and safe deletion/deactivation. Services with booking history are deactivated instead of physically deleted.
- Service categories are stored on each service and exposed as customer filters.
- Price tiers support amount, plant-count bands, effective-from/effective-to dates, and validation of plant ranges and effective periods.
- Service duration in minutes is now accepted by the backend input schema, fixing a frontend/backend payload mismatch.
- Service and price-tier changes are written to the audit log.

### 2. Customer plants and addresses

- Customer plant CRUD and address CRUD use the authenticated Customer profile.
- Ownership is enforced in backend queries for plants, addresses, bookings, and plant media; a Customer cannot reference another Customer's records by changing an ID.
- The address editor supports default-address selection. Deleting the default address promotes the most recently created remaining address.
- Plant photos use private Storage assets, upload-intent/completion, ownership checks, short-lived signed download URLs, and deletion.
- Customer profile, plant, and address data is retrieved from PostgreSQL rather than being treated as local demo state.

### 3. Booking lifecycle

- Customer booking creation validates active service, future schedule, Customer-owned address, and ownership of every selected plant.
- The server calculates the effective price for the selected service and plant count, snapshots subtotal/convenience fee/total, and calculates scheduled end time from service duration.
- A Customer overlapping active booking is rejected with `409 BOOKING_TIME_CONFLICT`.
- Customer booking list/detail and cancellation are connected to the API.
- Status transitions are validated by the shared booking state machine; status-history and audit records are written.
- Cancellation remains blocked where a processed payment would require a refund workflow (refund processing itself remains excluded).

### 4. Gardener assignment

- Admin can assign only an active, KYC-verified Gardener.
- Assignment creation/update records booking history and audit activity.
- Gardener can accept or reject an assignment; rejection returns the booking to the confirmed pool for reassignment.
- Customers and Gardeners receive in-app assignment/progress notifications.

### 5. Job execution, completion, and evidence

- Gardener workspaces expose assigned jobs, job detail, progress transitions, report creation/editing, checklist items, plant condition, and completed history.
- A service report is required before completion; all checklist items must be complete.
- Report plant health is synchronized to the customer's plant record, and a booking-linked plant care history record is created or updated.
- Report evidence photos use private Storage, signed URLs, upload completion, owner/assignment checks, and deletion.
- Customer booking detail can display signed service-evidence photos.
- Completion sends an in-app notification to the Customer.

### 6. Storage

- Media upload intent, signed upload URL, upload completion, signed download URL, and object deletion are implemented.
- Media kinds include plant photos, service report photos, and KYC documents.
- Target ownership is checked server-side for plants, service reports, bookings, profiles, and Gardener KYC.
- KYC documents accept PDF or supported images, up to 10 MB. Images have a 10 MB limit; supported videos have a 100 MB limit.
- Media records are marked deleted after object deletion; private-bucket access is through short-lived signed URLs.

### 7. Notifications

- Customer/Gardener inbox supports paginated retrieval, unread filtering/counts, marking one item read, and mark-all-read.
- Booking creation/cancellation, assignment, job progress/completion, KYC review, and account status changes create in-app notifications.
- Admin API supports notification inspection and controlled in-app notification creation.
- An Admin Notification Centre screen was added at `/hq/notifications` to inspect notifications and send an in-app update to an active account.
- Email/SMS/push delivery is not represented as implemented by this in-app workflow.

### 8. Reviews and issues

- Customer can submit a review only after the booking is completed, and only one review is allowed per booking.
- Customer can submit and list issue reports; booking-linked issues must reference that Customer's own booking.
- Admin can list/filter and moderate reviews (`PENDING`, `PUBLISHED`, `HIDDEN`) and update issues (`OPEN`, `IN_REVIEW`, `RESOLVED`, `CLOSED`).
- Publishing/hiding reviews recalculates the assigned Gardener's published-review rating.
- Submission and moderation actions are audited.

### 9. Gardener KYC documents and Admin decisions

- Added Prisma model `GardenerKycDocument` and enum `KycDocumentStatus` with a dedicated migration:
  `backend/prisma/migrations/20261109000100_add_gardener_kyc_documents/migration.sql`.
- Gardener can upload, submit, list, and remove unverified documents.
- Document metadata, review status, review note, reviewer identity, and review timestamps persist in PostgreSQL.
- Admin can view submitted documents through short-lived signed URLs and approve/reject/return a submission to pending.
- Approval is rejected if no eligible submitted documents exist.
- KYC status changes are audited and notify the Gardener.
- A verified Gardener cannot silently reset their verified status by uploading another document; Admin/support must first reopen the review state.
- Booking assignment is restricted to active, KYC-verified Gardeners.

### 10. CMS and analytics

- Admin CMS supports persistent create/edit, draft/publish/archive, search and status filtering; a public endpoint returns only published content.
- Analytics screens call live overview, booking, revenue-summary, and Gardener-performance APIs with selectable reporting ranges.
- Revenue/paid-volume values are read-only operational reporting; this does not implement payment collection or payouts.

## Important frontend notes

- The existing main navigation now routes Customer addresses, Customer visit history, Gardener KYC submission and completed reports, Admin user details, and Admin notifications to live Phase 5 screens.
- Payment/payout/subscription-billing pages that would otherwise imply working payment operations are explicitly marked out of scope instead of displaying mock controls.
- Existing authentication uses HTTP-only cookies with `credentials: include`; no JWT is placed in browser localStorage.
- API responses are marked private/no-store to avoid reusing user-specific or authorization-sensitive responses from browser caches.

## Database migration required

This build adds the Gardener KYC document table. After preserving the existing local environment files, run these commands from `backend`:

```bash
npx prisma migrate status
npx prisma migrate deploy
npx prisma generate
npx prisma validate
```

Do **not** run `prisma migrate reset`, and do not manually recreate the schema in SQL. `migrate deploy` should apply only the new KYC document migration if it is pending; otherwise it should report no pending migrations.

## Owner-side install and run

From the project root:

```bash
npm ci
npm run build
npm run dev
```

In a second terminal, from `backend`:

```bash
npm ci
npm run dev
```

Retain your current private `.env` and `backend/.env` files locally. They are intentionally not included in the ZIP. Never upload them or paste secret values into chat.

## Validation performed for this package

- `node --check` passed for all 32 JavaScript source/script files in the project (including backend scripts, frontend utility modules, and Vite config).
- TypeScript JSX transpile/parser checks passed for `src/main.jsx`, `src/phase5.jsx`, and the three landing-page JSX modules with zero syntax diagnostics. A static route/export check confirmed that every `Phase5.*` component referenced by `src/main.jsx` is exported.
- PostCSS parsing passed for `src/styles.css` and `src/phase5.css`.
- Root/backend package manifests and lockfiles parse as valid JSON.
- The new Prisma migration and schema additions were reviewed for matching table, enum, index, and foreign-key definitions.

## Validation not completed in this build environment

- Full `npm ci` timed out for both root frontend and backend during package installation. Consequently, Vite production build and Prisma CLI `validate`/`generate` could not be run here.
- The new migration has **not** been applied to the owner's Tokyo Supabase database by this build process.
- No live end-to-end booking, binary Storage, KYC upload/review, notification, review/issue, CMS, or analytics browser workflow was executed against the owner's database in this package environment.
- Static checks are not proof of runtime or production success. Complete the owner-side migration and live smoke tests below before release.

## Owner-side live smoke-test order

1. Apply the migration and regenerate Prisma Client.
2. Add the agreed real service names, categories, duration, and price tiers in Admin. No business prices have been invented or seeded.
3. As Customer, create/update a plant and address, then create a future booking using those owned records.
4. As Admin, assign an active KYC-verified Gardener. Confirm the in-app notices appear for both parties.
5. As Gardener, accept/reject in separate test bookings; for the accepted path, move through on-the-way, arrived, start, save report, complete every checklist item, upload evidence, and complete the job.
6. As Customer, confirm booking status, service evidence, plant health/care history, notifications, review submission, and issue submission.
7. Test private Storage upload, signed download from owner/authorized Admin, rejection of unauthorized access, and deletion for each media type.
8. Test KYC PDF/image upload, Admin view/review, rejection and resubmission; use approved test material in development and real identity documents only in a properly authorized production verification process.
9. Test CMS draft/publish/archive and analytics filters.
10. Repeat Customer/Gardener/Admin RBAC checks and verify audit entries.

## Payment exclusions retained

Do not treat the presence of existing payment database models, read-only payment summary fields, or legacy payment routes as a completed payment implementation. Razorpay/payment processing, webhooks, refunds, payouts, and payment-dependent subscription billing are not part of this Phase 5 build.
