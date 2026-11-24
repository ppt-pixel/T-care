# T-CARE Phase 3 — Customer Booking and UPI AutoPay

**Date:** 23 November 2026  
**Source baseline:** `tcare(3).zip` with Phase 1 and Phase 2 implementation changes  
**Deployment:** Local source only. No GitHub push, Netlify/Render deployment, Razorpay API request, production migration, or live payment was performed.

## Confirmed business rules

1. One-Time Service is paid once and has no renewal.
2. Weekly, One-Month and One-Year plans use Razorpay Subscriptions with UPI AutoPay.
3. Admin configures included visits per billing period, the service/visit frequency, included services, plant limit, and maximum renewal cycles.
4. The Admin-facing renewal count means **additional renewals after the first paid period**. Razorpay `total_count` includes the first cycle, so T-CARE sends `maxRenewalCycles + 1`.
5. Every visit credit belongs to one paid billing period. Unused visits expire at the end of that period; there is no carry-forward.
6. Cancelling the UPI mandate in the customer's UPI app stops future renewals. Already-paid benefits remain available until the paid-through date.
7. If a subscription-covered booking is cancelled before the Gardener starts service, one visit is restored to the same billing-period credit record. It can be restored only once. No restoration is allowed after service has started or completed.
8. A visit credit is issued only after a captured subscription charge is verified from Razorpay. A Checkout redirect, mandate authentication, client message, or `subscription.activated` event by itself does not prove that the plan amount was captured.

## Customer booking experience

- Customer booking now loads the same Admin-managed plan catalogue used by the Plans page.
- The Customer can review plan type, price, billing period, included services, service frequency, visit quota, minimum days between visits, plant limit, benefits, limitations, renewal count, and UPI AutoPay cancellation terms before submitting.
- The booking form filters available services to the selected plan's included services.
- Plant ownership, address ownership, plant limits, service eligibility, active paid-period credit, visit quota, spacing between visits, future scheduling, and overlapping booking conflicts are validated by the backend.
- Recurring-plan bookings use an existing paid subscription credit; they are zero-price bookings and do not create a second Razorpay charge.
- One-Time Service plans use the normal server-calculated booking payment flow.
- Existing pay-per-service booking remains available.
- Booking creation uses a persistent per-tab idempotency key and a normalized request fingerprint. Repeating the same request returns the original booking; reusing the key with different details is rejected.

## Razorpay UPI AutoPay integration

- Admin-configured recurring plans are converted to a Razorpay Plan on first mandate setup and the returned provider plan ID is stored on the T-CARE plan.
- T-CARE creates a Razorpay Subscription with the Admin-configured cycle count.
- The Customer checkout uses Razorpay Standard Checkout with `subscription_id`.
- The callback signature is checked server-side using the Razorpay subscription signature formula, then the backend fetches the remote subscription/payment to verify identifiers and association.
- Mandate authorization is recorded separately from paid-period activation.
- Subscription setup is idempotency-protected and uses an explicit provider-create state. Uncertain remote outcomes are marked `UNKNOWN` and blocked from automatic recreation so a timeout cannot silently create a second mandate.
- UPI AutoPay API calls require both `PAYMENTS_ENABLED=true` and `RAZORPAY_SUBSCRIPTIONS_ENABLED=true`; the latter remains false by default in the environment template and Render Blueprint until the merchant's Razorpay Subscriptions/UPI AutoPay capability is enabled and the webhook configuration is completed.
- The current application conservatively limits UPI AutoPay plan prices to less than ₹5,000 per charge. Confirm the merchant account's actual limit before activating eligible plans.

## Subscription webhook processing

T-CARE validates the webhook HMAC against the exact raw request body, matches the Razorpay Subscription ID and Plan ID, verifies the captured payment's subscription association, amount and INR currency, and uses unique provider event/payment identifiers to avoid duplicate ledger entries.

The implementation handles subscription lifecycle events and payment events that carry `subscription_id`. Captured charges create a Payment record, period-scoped `SubscriptionVisitCredit`, receipt delivery attempt, audit event, and Customer notification. Failed renewal attempts are recorded and notified without deleting already-paid credit periods. Cancelled, paused, halted, pending, resumed and completed mandate states are synchronized without revoking an already-paid active period.

### Required Razorpay webhook events before UPI AutoPay can be enabled

The seven events previously configured for ordinary one-time payments are not sufficient by themselves for recurring subscriptions. In addition to the existing payment and refund events, configure the following subscription events in **both Test and Live webhook configurations**:

- `subscription.authenticated`
- `subscription.activated`
- `subscription.charged`
- `subscription.completed`
- `subscription.updated`
- `subscription.pending`
- `subscription.halted`
- `subscription.cancelled`
- `subscription.paused`
- `subscription.resumed`

Keep the existing relevant payment events `payment.authorized`, `payment.captured`, and `payment.failed`, as well as existing order/refund events for one-time booking payments. Verify the exact event names offered in the merchant's Razorpay Dashboard and check deliveries before enabling recurring-plan checkout.

## Visit credit and cancellation safety

- A credit row is scoped to one subscription and one billing-period start, with a unique constraint on `(subscriptionId, periodStart)`.
- Credit is consumed under a transaction and row lock when the booking is created.
- Both Customer and Admin cancellation paths use the same `canRestoreVisitCredit` rule.
- Both cancellation paths block while payment is pending/authorized and require the separate refund workflow for processed payments.
- The restoration transaction locks the credit row, decrements `visitsUsed` conditionally, and records `creditRestoredAt` on the booking. A missing/already-restored credit fails closed rather than granting another visit.
- A mandate that is paused, pending after a renewal failure, cancelled, or completed may still have a current paid-period credit. The booking API checks the actual credit period and remaining quota rather than using the mandate status alone.
- A replacement mandate is blocked while a cancelled/expired subscription still has paid-through access.

## Data changes

Added source migrations:

- `20261123000300_subscription_booking_entitlements`
- `20261123000400_booking_subscription_link`

These add Admin visit entitlements and provider setup fields, create the period-scoped `SubscriptionVisitCredit` table, and link each covered booking to its source subscription/credit. They follow the existing Phase 1 and Phase 2 migrations:

- `20261123000100_booking_creation_idempotency`
- `20261123000200_subscription_plan_catalogue`

All four migrations are included in this source package. **None has been applied to production by this implementation.** Re-check the full migration status against production after deploying the source, back up Supabase, rehearse on a separate database, and only then apply the reviewed pending migrations.

## Files changed in Phase 3

- `src/phase5.jsx` — Customer plan-aware booking, UPI AutoPay subscription checkout, subscription history and Admin entitlement editor.
- `src/phase5.css` — responsive plan, entitlement, booking and subscription presentation.
- `backend/src/routes/bookings.js` — plan/credit validation, transactional booking idempotency, subscription booking and Customer cancellation restoration.
- `backend/src/routes/admin.js` — Admin cancellation restoration and pending-payment cancellation protection.
- `backend/src/routes/subscriptions.js` — Razorpay Plan/Subscription creation, Checkout verification, Admin plan configuration, customer subscription operations and paid-period presentation.
- `backend/src/routes/payments.js` — Razorpay subscription lifecycle/payment webhook processing, credit issuance, payment records, receipts and notifications.
- `backend/src/lib/subscriptionPlanRules.js` — plan schedules, renewal counts, eligibility, paid-period and credit restoration rules.
- `backend/prisma/schema.prisma` and migrations `20261123000300` / `20261123000400`.
- `tests/phase3-booking-autopay-contract.test.js` and updated subscription entitlement tests.

## Validation performed

- Frontend tests: **36/36 passed**.
- Backend tests: **117/117 passed** across runnable test files.
- `account-management.test.js` remains unavailable because the local `bcrypt` package could not be installed after the dependency install timed out. `bcrypt` is declared in the backend package manifest and lockfile.
- Frontend JS/JSX parser: **7 files, zero syntax diagnostics**.
- Backend source/scripts/tests JavaScript `node --check`: passed.
- Root/backend package and lockfile JSON: valid.
- Prisma schema-to-migration model/table contract tests passed as part of the backend suite.
- Production build could not run: local Vite executable is absent (`vite: not found`).
- Prisma CLI validation/client generation could not run: local Prisma executable is absent (`prisma: not found`).
- Available environment Node is `22.16.0`; project requires `>=22.22.0 <23`.
- No browser E2E against a running API/database and no Razorpay Test/Live Subscriptions API call was made in this environment.

## Before deployment / UPI AutoPay activation

1. Run frontend and backend `npm ci` on Node 22.22.x, then run the Vite build, backend test suite and `prisma validate`.
2. Review the four new migrations, back up production Supabase and rehearse them on a separate database before `prisma migrate deploy`.
3. Confirm Razorpay Subscriptions and UPI AutoPay are enabled for the merchant account; ordinary UPI checkout approval does not guarantee this product access.
4. Configure the ten subscription lifecycle webhook events in both Test and Live webhook settings, in addition to existing payment/refund events. The previously configured seven ordinary events do not cover all UPI AutoPay lifecycle changes.
5. Set `RAZORPAY_SUBSCRIPTIONS_ENABLED=true` in Render only after the previous items pass. Do not expose secrets to Netlify or the frontend.
6. Test mandate authorisation, captured initial charge, subsequent recurring charge, failed renewal, duplicate/out-of-order webhooks, mandate cancellation, paid-through booking access, final renewal completion, receipt delivery and one-time credit restoration in a non-production Razorpay environment.
7. Seed only Admin-approved plan prices, visit counts, frequencies, included services, plant limits, benefits, limitations and renewal counts. No business pricing or visit quota is invented by this implementation.
