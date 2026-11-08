# T-CARE Phase 5 — Completion Checklist

**Build source:** `T-care Final(1).zip` uploaded 9 November 2026.
**Implementation status:** Phase 5 code changes are included in this build. Live verification against the owner's Supabase project is still required before release.
**Excluded:** Payment collection/processing, payment webhooks, refunds, payouts, and payment-dependent subscription billing.

## Ten requested workstreams

| # | Requested workstream | Included implementation | Owner-side verification |
|---:|---|---|---|
| 1 | Service catalogue | Public active catalogue, dynamic categories, Admin service CRUD, create/edit/delete price tiers, effective date and plant-count rules, duration validation, audit records. | **Pending.** Add actual T-CARE service names, descriptions, durations and approved INR prices. No fabricated catalogue or pricing was seeded. Test customer catalogue and Admin changes. |
| 2 | Customer plants and addresses | Customer plant CRUD; address create/edit/default/delete; default reassignment; private plant-photo upload/link/signed view/delete; owner checks. | **Pending.** Test with the Customer account and confirm data persists after refresh. Test cross-customer ID tampering is denied. |
| 3 | Booking management | Server-side active service/price validation, future date validation, customer-owned plant/address checks, price snapshot, duration calculation, overlap conflict protection, cancellation rules, status history and audit. | **Pending.** Requires at least one active service with an applicable price, one owned plant and one owned address. Run the full create/detail/cancel flow. |
| 4 | Gardener assignment | Admin assignment restricted to active, KYC-verified Gardener; Gardener acceptance/rejection; reassignment path; assignment notices and audit. | **Pending.** Use an Admin-approved test Gardener and separate bookings for accept and reject paths. |
| 5 | Job execution | On-the-way/arrived/start transitions, report create/edit, checklist completion, plant-health updates, booking-linked care history, evidence media, completion guard and Customer completion notification. | **Pending.** Complete an assigned job end-to-end and check Customer booking detail, photos and plant care history. |
| 6 | Storage | Signed upload intent, completion, signed download, deletion, private bucket access, target ownership checks. Supports plant photos, service-report photos and KYC PDF/images. | **Pending.** Perform actual binary upload → complete → signed download → delete for each applicable media type. Confirm unauthorized account access fails. |
| 7 | Notifications | In-app event notifications, Customer/Gardener inbox, unread count, mark-one/read-all, Admin inspection and targeted in-app creation. | **Pending.** Verify booking/assignment/progress/KYC notices and read-state persistence. **Email/SMS/push delivery is not implemented by the new Admin notification centre.** |
| 8 | Reviews and issues | Customer completed-booking review eligibility, one review per booking, issue submission/list/detail, Admin review moderation and issue status updates, rating recalculation, audit. | **Pending.** Complete a job first, submit a review and issue, moderate both as Admin, and verify the Gardener rating. |
| 9 | KYC management | New `GardenerKycDocument` model and migration; Gardener upload/list/remove; Admin document viewing and approve/reject/reopen-to-pending; review notes and timestamps; audit and notifications; verified Gardener assignment rule. | **Migration required, then pending.** Apply the new Prisma migration before KYC document endpoints are used. Test PDF/image upload, Admin review, rejection and resubmission using approved test documents. |
| 10 | CMS and analytics | Persistent CMS create/edit/draft/publish/archive and public published-content endpoint; Admin analytics overview, booking trend, revenue summary and Gardener metrics with date-range filters. | **Pending.** Create a draft, publish, confirm public read, archive, then check Analytics filters against actual records. Revenue figures are read-only reporting only. |

## Required database step

This build adds one additive migration:

`backend/prisma/migrations/20261109000100_add_gardener_kyc_documents/migration.sql`

After extracting the build and preserving the existing private environment files, run from `backend`:

```bash
npx prisma migrate status
npx prisma migrate deploy
npx prisma generate
npx prisma validate
```

Do not run `prisma migrate reset` and do not manually execute a replacement schema. The migration is additive and should be applied by Prisma's migration engine.

## Validation performed in this build environment

- `node --check` passed for all 32 JavaScript source/script files in the project (including backend scripts, frontend utility modules, and Vite config).
- JSX transpilation/parser checks passed for `src/main.jsx`, `src/phase5.jsx`, and the three landing JSX modules.
- Static export wiring check passed: every `Phase5.*` component referenced from `src/main.jsx` is exported, including the Customer address page.
- PostCSS parsed the four project stylesheets successfully.
- Root and backend package manifests and lockfiles parse as valid JSON.
- KYC Prisma model and SQL migration were cross-checked for enum/table/index/foreign-key consistency.

## Not verified here — do not treat as passed

- Root and backend `npm ci` did not complete in this environment. The Vite executable was therefore unavailable and a full production build could not be run here.
- Prisma CLI `validate` and `generate` could not be run here because dependencies did not finish installing.
- The new KYC migration has not been applied to the owner's Tokyo Supabase database by this package process.
- No live end-to-end business workflow was executed against the owner's database in this build environment.

## Packaging and security

- Real `.env` files, database credentials, Supabase secret keys, SMTP App Passwords, JWT secrets, browser cookies and signed URLs are not included.
- Keep the existing private `.env` and `backend/.env` files locally; copy values only into the intended private local environment if any settings changed.
- Do not share secret values in chat or commit them to Git.
- The private Supabase Storage bucket should remain non-public. Media is served using short-lived signed URLs after server-side ownership checks.

## Final release checklist

- [ ] Install root dependencies and run `npm run build` successfully.
- [ ] Install backend dependencies, apply the migration, run `prisma generate` and `prisma validate`.
- [ ] Confirm health and database status.
- [ ] Add real service catalogue and approved price tiers in Admin.
- [ ] Customer plants/addresses → booking → Admin assign → Gardener accept → progress → report/checklist/evidence → completion.
- [ ] Verify Customer notifications, review and issue lifecycle.
- [ ] Verify Gardener KYC upload and Admin review; confirm only active, verified Gardeners are assignable.
- [ ] Test Storage binary upload/download/delete and cross-account denial.
- [ ] Verify CMS publishing/archive and Analytics date ranges.
- [ ] Repeat Admin/Customer/Gardener route and API authorization checks.
- [ ] Perform desktop/mobile browser QA and verify secrets are absent from the release archive.

## Explicit payment exclusions

Razorpay checkout/payment processing, payment webhooks, refunds, payout execution, and payment-dependent subscription billing are not Phase 5 deliverables. Existing payment models and read-only revenue summaries are retained but do not constitute a completed payment system.
