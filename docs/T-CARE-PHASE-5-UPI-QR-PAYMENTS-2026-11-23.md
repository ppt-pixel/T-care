# T-CARE Phase 5 — Razorpay UPI QR Payments

**Baseline:** Phase 4 Plant Store e-commerce package, built on the supplied Phase 3 booking/UPI AutoPay source.  
**Scope:** Add Razorpay-generated, single-use UPI QR as an alternative for one-time service booking payments and Plant Store orders.  
**Isolation:** This is a separate Phase 5 source package. It is not merged into the original Phase 3 archive. No GitHub, production database, Render, Netlify or live Razorpay changes were made.

## 1. Payment design

Phase 5 uses Razorpay's Payments QR Code API. T-CARE asks Razorpay to create a QR with:

- `type: upi_qr`
- `usage: single_use`
- `fixed_amount: true`
- `payment_amount`: exact amount in integer paise, calculated from the server-owned Payment record
- `close_by`: a bounded expiry, normally 20 minutes
- provider notes that associate the QR with the internal T-CARE payment ID and purpose

The backend does not accept a screenshot, UPI transaction reference, browser callback or user assertion as evidence of payment. It accepts a QR payment only after retrieving the QR and its payment list from Razorpay, then independently retrieving the specific provider Payment and verifying all of the following: exact QR association, captured status, `captured === true`, UPI method, INR currency and exact amount in paise.

The `qr_code.credited` webhook triggers the same provider-side reconciliation path. Webhook signatures continue to use the existing raw-body HMAC verification and `RAZORPAY_WEBHOOK_SECRET`. The webhook is an acceleration signal, not a substitute for verification against Razorpay's API.

## 2. Customer workflows

### Service bookings

- The Customer booking payment panel offers Razorpay Checkout and UPI QR only when the backend availability endpoint reports QR enabled.
- A Customer can generate a QR for their own unpaid booking. Amount, currency and booking ownership come from database records.
- The booking detail shows the QR image, expiry, an external QR link, manual status check and QR close action.
- Closing a QR for a payment-method change closes the provider QR but leaves the booking payment pending. Full booking cancellation closes the QR and marks the payment cancelled before completing the existing booking cancellation/entitlement checks.

### Plant Store orders

- The Store checkout form offers UPI QR as a separate payment method where the Store checkout and QR feature flags are both enabled.
- The QR is generated against the existing persisted ShopOrder Payment. Repeating the same checkout request does not create another order.
- The order page supports status reconciliation, QR closure and retrying an unpaid order with the available payment method.
- Closing a QR for a payment-method change does not cancel the underlying order payment or release reserved inventory. Cancelling the whole unpaid order closes any active QR before releasing the stock reservation.

### Excluded from this QR flow

UPI AutoPay recurring subscriptions are unchanged. A one-time QR payment cannot authorise or replace a recurring UPI mandate. Existing Razorpay Subscription and mandate lifecycle handling remains on its own path. One-Time Service plans continue through the booking payment workflow.

## 3. Payment/session states and safeguards

`PaymentQrSession` stores the provider QR identifier privately, safe image/link URLs, expiry and one of `ACTIVE`, `PAID`, `EXPIRED` or `CANCELLED`.

- A payment remains `PENDING` until provider API verification confirms a captured UPI payment.
- QR expiry triggers provider closure and a second payment-list check before the QR session is marked expired.
- QR cancellation checks the payment list, closes the QR, then checks the payment list again before returning. If a capture is found, T-CARE records/reconciles it and refuses to report a successful cancellation.
- The QR provider identifier is not included in Customer API responses.
- Amount conversion is decimal-string to integer paise using `BigInt`; binary floating-point is not used for provider amounts.
- QR creation is serialized under the local Payment row lock. If the provider QR is created but the database transaction fails, T-CARE attempts to close the orphan provider QR.
- Existing Checkout and QR methods cannot remain active against the same local payment simultaneously. The UI does not offer QR after a Razorpay Checkout Order has already been created.
- If an expired/unresolved Store QR cannot be verified or closed, the existing order expiry logic keeps the order in review and does not release inventory.

## 4. New environment setting

`RAZORPAY_QR_ENABLED` is a separate boolean flag. It defaults to `false` in `backend/src/config/env.js` and `backend/.env.example`. The Render Blueprint declares the variable owner-managed (`sync: false`) so later Blueprint syncs cannot overwrite an approved activation; if it is unset, the backend default remains false.

Turning this flag on does not override `PAYMENTS_ENABLED`; both must be true and Razorpay server credentials must be configured. Store QR also requires `STORE_CHECKOUT_ENABLED=true`. Existing `PAYMENTS_ENABLED` and `RAZORPAY_SUBSCRIPTIONS_ENABLED` remain owner-managed in the Render Blueprint; this phase does not change those settings.

## 5. API and provider integration

Relevant endpoints:

- `POST /api/v1/payments/customer/booking/:bookingId/qr` — create/reuse a booking QR; requires `Idempotency-Key`.
- `GET /api/v1/payments/customer/:paymentId` — retrieve the safe customer payment projection, including the current QR session.
- `POST /api/v1/payments/customer/:paymentId/reconcile` — verify the QR or existing Checkout payment with Razorpay.
- `POST /api/v1/payments/customer/:paymentId/qr/cancel` — close only the QR; keep the underlying one-time payment pending for a possible method change.
- `POST /api/v1/orders/customer/checkout` — create/reuse a Plant Store order and select `paymentMode: "QR"` or `"CHECKOUT"`.
- `POST /api/v1/orders/customer/:orderId/payment` — retry an existing unpaid Store order with a selected payment method.
- `POST /api/v1/payments/webhook` — existing signed Razorpay webhook endpoint; handles `qr_code.credited` in addition to the existing payment, subscription and refund events.

Configure the Razorpay Test Mode webhook to send `qr_code.credited` to the existing webhook endpoint. Retain the same webhook secret in the backend environment. The code also continues to acknowledge unrelated QR lifecycle events without treating them as settlement.

## 6. Database migration

Added additive migration:

`backend/prisma/migrations/20261123000600_qr_payment_sessions/migration.sql`

It adds the `QrPaymentSessionStatus` enum, `PaymentQrSession` table, unique provider QR identifier, payment/status indexes and a cascading foreign key to `Payment`. The Prisma `Payment` model gains the inverse relation. No existing payment columns are rewritten.

This migration is source-only and has **not** been applied to Supabase or any other database. Review the actual migration history and take a backup before rehearsal/application. Do not run `prisma migrate reset` against production.

## 7. Merchant prerequisites and release sequence

Razorpay QR Codes API capability must be available for the T-CARE merchant account. API documentation alone does not confirm that a specific merchant account has QR Codes enabled. Before activating the flag:

1. Confirm QR Codes API access with Razorpay for the relevant Test and Live account.
2. Deploy the reviewed source and apply the migration only after backup and non-production rehearsal.
3. Configure the signed `qr_code.credited` webhook in Razorpay Test Mode.
4. Keep `RAZORPAY_QR_ENABLED=false` until API credentials, webhook secret, migration and provider feature access are confirmed.
5. In Test Mode, test successful scan, pending payment, failed payment, expired QR, explicit close, duplicate webhook delivery, webhook delay, wrong amount/currency/provider payment, browser refresh, Checkout fallback, booking cancellation and Store stock protection.
6. Only after successful Test Mode results, configure the Live webhook and enable `RAZORPAY_QR_ENABLED=true` for the Live backend. Keep normal payment flags and the separate Store checkout flag under their existing owner controls.

Do not put Razorpay secrets or webhook secrets in frontend environment variables.

## 8. Validation completed in the package

- Root frontend tests: 54 passed.
- Backend tests: 131 passed, excluding `backend/tests/account-management.test.js` because the `bcrypt` dependency did not finish installing in this environment.
- Phase 5 focused contracts/rules: 16 passed (8 frontend contracts and 8 backend QR rules).
- Backend JavaScript syntax checks and frontend JSX/TSX parse checks are recorded in the accompanying implementation report.
- Prisma model/migration table-parity contract includes the new QR-session table.

Limitations: the environment has Node 22.16.0, while the project declares Node `>=22.22.0 <23`. The production Vite build, Prisma CLI validate/generate and database migration were not completed. There was no browser E2E, no live or Test Mode Razorpay call, no QR scan, no webhook delivery test and no production deployment. Merchant enablement remains unverified.
