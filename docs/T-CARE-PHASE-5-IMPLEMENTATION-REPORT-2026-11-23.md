# T-CARE Phase 5 — Implementation Report

**Date:** 23 November 2026  
**Starting point:** T-CARE Phase 4 Plant Store ZIP, containing the supplied Phase 3 booking and UPI AutoPay baseline  
**Delivery:** Separate Phase 5 ZIP; not merged into the original Phase 3 archive  
**GitHub / deployment / production database:** Not used or changed

## 1. Result

Implemented Razorpay-generated single-use UPI QR as an additional payment method for:

- One-time Customer service booking payments.
- Plant Store orders created by Phase 4.

The existing Razorpay Checkout flow remains available. Recurring UPI AutoPay is unchanged and cannot be authorised through this one-time QR flow.

## 2. Provider verification model

The backend creates a Razorpay `upi_qr` with `single_use`, `fixed_amount`, amount in exact paise and a bounded `close_by` timestamp. The default QR lifetime is 20 minutes, subject to the Store order's own reservation expiry.

T-CARE does not mark an order or booking as paid based on the QR being shown, a screenshot, a client callback or a user-supplied UPI reference. Reconciliation fetches the QR and its payments from Razorpay, then independently fetches the identified payment and requires:

- Exact QR and T-CARE payment association.
- `status === captured` and `captured === true`.
- `method === upi`.
- Exact server-owned amount in paise.
- Expected INR currency.

The signed `qr_code.credited` webhook invokes this same provider-side reconciliation. The existing webhook HMAC/raw-body verification and event deduplication remain in use.

## 3. Implemented safeguards and workflows

- Added `RAZORPAY_QR_ENABLED`, defaulting to false independently of `PAYMENTS_ENABLED` and `STORE_CHECKOUT_ENABLED`.
- Added `PaymentQrSession` and `QrPaymentSessionStatus` with an additive Prisma migration.
- Added server-only Razorpay QR create, fetch, payment-list and close requests with request timeouts and provider response validation.
- Uses `BigInt` conversion from decimal strings to paise; does not use floating-point money arithmetic for provider amount checks.
- Serializes QR creation under the Payment row lock and attempts to close a provider QR if the local database write fails.
- Reconciliation and expiry close the QR with Razorpay, then query provider payments again before marking the QR expired.
- Closing a QR to change payment methods closes only the QR and retains a pending Payment. Full booking/order cancellation closes the QR and cancels the Payment as part of the existing cancellation workflow.
- Store expiry does not release inventory when the provider QR cannot be confirmed closed or its payment state cannot be reconciled.
- The UI displays the provider QR image, an external QR link, expiry, manual payment-status check and QR close action.
- Existing Checkout is not exposed as a simultaneous QR method once a provider Checkout Order exists.
- Customer projections omit the provider QR Code ID and webhook/provider payloads.

## 4. Files added

- `backend/src/lib/razorpayQrRules.js`
- `backend/src/lib/razorpayQrApi.js`
- `backend/prisma/migrations/20261123000600_qr_payment_sessions/migration.sql`
- `backend/tests/razorpay-qr-rules.test.js`
- `tests/phase5-qr-payment-contract.test.js`
- `docs/T-CARE-PHASE-5-UPI-QR-PAYMENTS-2026-11-23.md`
- `docs/T-CARE-PHASE-5-IMPLEMENTATION-REPORT-2026-11-23.md`
- `docs/T-CARE-PHASE-5-MERGE-GUIDE-2026-11-23.md`

## 5. Existing files modified

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

## 6. Validation results

| Validation | Result |
|---|---:|
| Root frontend tests | **54 passed / 54** |
| Backend runnable tests excluding the bcrypt-dependent file | **131 passed / 131** |
| Focused Phase 5 QR rules + contract tests | **16 passed / 16** |
| Backend JavaScript `node --check` | **81 files passed** |
| Frontend JS/JSX syntax parse via TypeScript transpile parser | **16 files, zero diagnostics** |
| Modified CSS brace validation | **2 files passed** |
| Prisma model-to-migration CREATE TABLE contract | Passed, including `PaymentQrSession` |

The backend test command excluded only `backend/tests/account-management.test.js`, because the `bcrypt` package did not finish installing in this environment after dependency installation timed out. The package and lockfile still declare `bcrypt`.

## 7. Not completed / limitations

- Local Node version is **22.16.0**; project manifests require `>=22.22.0 <23`.
- The Vite and Prisma CLI executables are absent from this workspace, so a production frontend build, Prisma client generation and `prisma validate` were not completed.
- The additive migration was packaged but **not applied** to Supabase or any production database.
- No Razorpay Test Mode or Live API request, QR scan, webhook delivery, refund, or browser end-to-end test was performed.
- Account-specific Razorpay QR Codes API access is unverified. Documentation support does not confirm merchant account entitlement.
- Responsive/browser E2E and Phase 6 integrated regression remain pending.

## 8. Activation requirements

Keep `RAZORPAY_QR_ENABLED=false`. Before activation, confirm merchant QR API access, review/rehearse migration `20261123000600_qr_payment_sessions`, configure the signed `qr_code.credited` Test Mode webhook to `POST /api/v1/payments/webhook`, and pass the Test Mode scenarios in the included Phase 5 guide. Only then should the Live flag be changed through the merchant's controlled deployment process.

No action was taken against GitHub, Render, Netlify, Supabase or Razorpay accounts.
