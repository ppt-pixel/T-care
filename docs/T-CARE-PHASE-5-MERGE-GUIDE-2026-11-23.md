# T-CARE Phase 5 — Merge Guide

## Package relationship

This package was created as a separate Phase 5 continuation from the Phase 4 Plant Store ZIP, which itself contains the Phase 3 booking/UPI AutoPay baseline. It is not a replacement archive for the original Phase 3 project and has not been pushed to GitHub or deployed.

The archive root is `tcare/`. Preserve your current project backup before merging. Diff the Phase 5 package against the exact Phase 4 ZIP you intend to continue from; do not merge against an older Phase 3 archive and do not overwrite unrelated later work.

## New files

- `backend/src/lib/razorpayQrRules.js`
- `backend/src/lib/razorpayQrApi.js`
- `backend/prisma/migrations/20261123000600_qr_payment_sessions/migration.sql`
- `backend/tests/razorpay-qr-rules.test.js`
- `tests/phase5-qr-payment-contract.test.js`
- `docs/T-CARE-PHASE-5-UPI-QR-PAYMENTS-2026-11-23.md`
- `docs/T-CARE-PHASE-5-IMPLEMENTATION-REPORT-2026-11-23.md`
- `docs/T-CARE-PHASE-5-MERGE-GUIDE-2026-11-23.md`

## Existing files modified

- `backend/prisma/schema.prisma`
- `backend/src/config/env.js`
- `backend/src/lib/paymentView.js`
- `backend/src/routes/payments.js`
- `backend/src/routes/bookings.js`
- `backend/src/routes/orders.js`
- `backend/.env.example`
- `backend/tests/phase6-integration-contract.test.js`
- `render.yaml`
- `src/phase5.jsx`
- `src/phase5.css`
- `src/store/StoreCheckout.jsx`
- `src/store/storeCheckout.css`
- `tests/phase5-qr-payment-contract.test.js`
- `README.md`
- `docs/T-CARE-BOOKING-STORE-IMPLEMENTATION-PROGRESS-2026-11-23.md`

## Merge order

1. Start from the exact Phase 4 source tree and back it up.
2. Diff and merge schema plus migration first. Keep `20261123000600_qr_payment_sessions` additive; preserve all earlier migrations.
3. Merge payment helpers and then `payments.js`. This is the central integration point and includes provider API calls, exact payment verification, QR cancellation/expiry reconciliation and `qr_code.credited` webhook handling.
4. Merge `bookings.js` and `orders.js` together with `payments.js`; they import the shared QR lifecycle functions. Preserve the booking/entitlement cancellation guard and Store inventory reservation/release rules.
5. Merge the Customer booking UI and Store checkout/order UI. Do not remove existing Razorpay Checkout or UPI AutoPay paths.
6. Keep `RAZORPAY_QR_ENABLED` unset or explicitly false in the backend environment until merchant QR capability, migration and Test Mode checks are complete; backend config defaults it to false. The Render Blueprint uses `sync: false` so it does not overwrite a deliberate owner activation later.
7. Update the Render environment through the owner's normal controlled process only after approval. Preserve the existing owner-managed `PAYMENTS_ENABLED` and `RAZORPAY_SUBSCRIPTIONS_ENABLED` values; do not copy blank example values over live secrets/settings.
8. Apply the migration only after backup, history comparison, review and non-production rehearsal.
9. Register the `qr_code.credited` Test Mode webhook to `POST /api/v1/payments/webhook`, with the existing backend webhook secret.
10. Run the full tests and build on Node 22.22.x, then perform the Test Mode cases listed in the Phase 5 implementation document.

## Important integration conflicts to resolve carefully

- `backend/src/routes/payments.js`: preserve existing payment signature verification, raw-body webhook validation, event deduplication, receipts, refunds and subscription lifecycle. Do not replace the router with the Phase 5 file wholesale if the base has legitimate later work.
- `backend/src/routes/bookings.js`: preserve customer ownership, idempotent booking creation, subscription visit-credit restore rules and the pending/paid cancellation restrictions.
- `backend/src/routes/orders.js`: preserve Phase 4 server-side price calculation, stock reservation, expiry/release safeguards, idempotency and Admin fulfilment/refund functions.
- `backend/src/lib/paymentView.js`: keep customer-safe projections; never expose `providerQrCodeId`, API credentials or webhook payloads.
- `backend/prisma/schema.prisma`: merge the `Payment.qrSessions` relation and `PaymentQrSession` model without removing any later project models or fields.
- `render.yaml`: do not overwrite existing Render secrets or owner-controlled live flags with example settings. The new QR flag is intentionally false by default.

## Do not do during merge

- Do not run `prisma migrate reset`.
- Do not enable QR based only on successful compilation or API documentation.
- Do not enable QR before merchant account capability and Test Mode payment/webhook behaviour are confirmed.
- Do not use a screenshot, user-entered UPI reference or client callback as payment verification.
- Do not route recurring UPI AutoPay subscriptions through this one-time QR flow.
- Do not deploy or change the live Razorpay, Render, Netlify or Supabase state as part of this merge without a separate release approval.
