# T-CARE Customer Booking & Store Improvements — Implementation Progress

**Source baseline:** `tcare(3).zip`  
**Plan:** `Booking_Page_Implementation_Phases(1).md`  
**Scope:** Complete the plan's Phase 0 through Phase 6.  
**Deployment:** Local source changes only. No GitHub push, Netlify/Render deployment, live Razorpay operation, or production database mutation was performed.

## Phase 0 — Audit & Baseline

### Existing functionality retained

- React 19 / Vite frontend and Express 5 / Prisma backend.
- Netlify same-origin `/api/*` proxy and SPA fallback are already configured.
- Protected workspaces restore the cookie-based session and enforce server/client role boundaries.
- Razorpay booking order creation, client signature verification, server-side payment verification, webhook signature verification, duplicate event protection and receipt delivery already exist.
- Customer service booking already validates customer-owned plants and addresses, calculates the current server-side service price, prevents overlapping visits and writes booking history.
- Public Plant Store catalogue and Admin product/inventory management already exist.
- Admin plan CRUD and Customer pending subscription requests already exist.

### Gaps confirmed at the Phase 0 baseline

- Payment modal close/failure/callback interruption did not navigate to a dedicated outcome view or perform server-side reconciliation against the Razorpay Order.
- Booking submission did not persist an idempotency key in the database.
- Plans did not yet expose structured plan type, included services, service frequency, benefits and limitations.
- Customer booking was individual-service based and not connected to a shared plan catalogue.
- Plant Store had a public catalogue and browser-local cart, but no persistent orders, checkout, order/payment relationship or fulfilment workflow.
- There was no dedicated T-CARE QR payment workflow.
- Loading/disabled/skeleton feedback existed in some areas but was not consistent across the requested customer and store flows.

### Baseline validation

- Frontend tests: **22/22 passed** before Phase 1 changes.
- Backend tests: **96/98** before Phase 1 changes. One test file could not load because `bcrypt` was not installed; one stale integration-contract assertion expected an obsolete sidebar condition.
- Runtime available in the work environment: Node **22.16.0**. Project requires Node `>=22.22.0 <23`.
- Production build and Prisma CLI validation were not available because project dependencies were not installed in the execution environment.

## Phase 1 — Routing, Session & Payment Return

### Existing behaviour preserved

- Existing Netlify deep-link fallback and API proxy were already correct; not rewritten.
- Existing auth restoration, refresh rotation, Web Lock coordination and protected workspace routing were already correct; not rewritten.
- Existing Razorpay client signature and server payment verification remain authoritative.

### Changes implemented

1. Added `Booking.idempotencyKey` (nullable unique) and `Booking.idempotencyFingerprint`.
2. Added migration `20261123000100_booking_creation_idempotency`.
3. Customer booking creation now requires a bounded `Idempotency-Key` header. Repeated requests with the same key and same normalized payload return the existing booking; reuse with a different payload or customer is rejected with `409 IDEMPOTENCY_KEY_REUSED`.
4. Customer booking form persists the key in tab-scoped session storage until the server confirms the booking, preventing a browser retry from creating a second booking.
5. Added `POST /api/v1/payments/customer/:id/reconcile`, restricted to the owning Customer.
6. Reconciliation fetches payments for the server-stored Razorpay Order ID, accepts only the same order, expected amount and expected currency, then records the provider-reported payment state through the existing event/idempotency transaction.
7. Added a protected `/garden/payments/return/:id` page. Checkout success, failure and dismissal route to separate outcome hints; the page asks the backend to reconcile and only routes to the booking/subscription destination after server confirmation.
8. Corrected the stale sidebar integration-contract test to assert the current `usesWorkspaceSidebar()` helper rather than the old inline role expression.

### Phase 1 validation

- Frontend tests: **24/24 passed**.
- Backend tests excluding the dependency-blocked `account-management.test.js`: **106/106 passed**.
- Full backend test run: **106 passed, 1 test file blocked** because `bcrypt` is not installed in this environment.
- JSX/TSX syntax parsing: **7 files, zero diagnostics**.
- Backend JavaScript `node --check`: passed for source and tests.
- Prisma migration has been added to source but **not applied** to any database.

## Phase 2 — Subscription Plan Structure

### Confirmed business rule

The user confirmed that Weekly, One-Month and One-Year plans must renew automatically through UPI AutoPay. Customers cancel the mandate in their UPI payment app; this stops future renewals while already-paid benefits remain available until the paid-through date. One-Time Service plans do not renew.

### Changes implemented

1. Added `SubscriptionPlanType`: `ONE_TIME_SERVICE`, `WEEKLY`, `ONE_MONTH`, `ONE_YEAR`, and `LEGACY_RECURRING`.
2. Added the `SubscriptionPlanService` relation for Admin-selected included services.
3. Added structured plan data: service frequency, plant limit, benefits, limitations, plan type, renewal mode, cancellation policy, and a future `razorpayPlanId` reference.
4. Updated the public Plans page and Customer subscription dashboard to display the same API-backed catalogue and complete customer-facing plan terms.
5. Updated Admin plan management to create/edit the four requested plan types, select active services, and configure price, billing frequency, service frequency, benefits, limitations, plant limit and visibility.
6. Commercial terms lock after a plan has subscriptions or a Razorpay Plan reference; historical plans with subscriptions are deactivated rather than deleted.
7. Existing plans are preserved as `LEGACY_RECURRING`. They are not silently treated as AutoPay plans. Existing legacy manual subscription requests/payment flow remain compatible.
8. New recurring plan requests are blocked from the legacy one-time Razorpay Orders path until Phase 3 implements Razorpay Subscriptions and UPI AutoPay mandate authorisation.
9. Customer-facing wording states that UPI mandate cancellation stops future renewals while paid access continues until the paid-through date.
10. Added migration `20261123000200_subscription_plan_catalogue`; it is source-only and has not been applied to production.

### Phase 2 validation

- Frontend tests: **29/29 passed**.
- Backend tests excluding the dependency-blocked `account-management.test.js`: **111/111 passed**.
- Backend JavaScript syntax checks: passed across backend source, tests and scripts.
- Frontend JS/JSX transpile parse: **15 files, zero diagnostics**.
- CSS brace checks: passed for the modified stylesheets.
- The full backend suite still cannot load `account-management.test.js` because `bcrypt` is missing from the current local `backend/node_modules`; the dependency is declared in `package.json` and the lockfile. Dependency installation timed out.
- Prisma CLI validation/client generation and production Vite build were not run because tooling was unavailable and the environment uses Node 22.16.0 rather than the required Node 22.22.x.

## Phase 3 — Customer Booking & UPI AutoPay

### Confirmed business rules

- Recurring Weekly, One-Month and One-Year plans use Razorpay Subscriptions with UPI AutoPay; One-Time Service does not renew.
- Admin controls included visits per billing period, service/visit frequency, eligible services, plant limit and maximum renewal cycles after the first paid period.
- Razorpay `total_count` includes the initial cycle, so T-CARE sends `maxRenewalCycles + 1`.
- Unused visit credits expire at the billing-period end and never carry forward.
- Customers cancel the mandate in their UPI app. Future renewals stop, but already-paid access continues until the paid-through date.
- A subscription booking cancelled by Customer or Admin before service starts restores one visit to the original billing-period credit once. It is not restored after service starts/completes.

### Changes implemented

1. Customer booking now uses the Admin-managed plan catalogue and displays full plan terms before submission.
2. The backend validates included services, plant ownership, address ownership, plant limit, visit quota, active paid period, minimum days between visits, future schedule and overlapping booking rules.
3. Recurring plan bookings consume a period-specific paid visit credit and have no second checkout charge. One-Time Service plans use the existing Razorpay booking payment flow. Pay-per-service remains available.
4. Added period-scoped `SubscriptionVisitCredit` records with unique `(subscriptionId, periodStart)` and transactional row locking.
5. Implemented Razorpay Plan/Subscription creation, `subscription_id` Checkout, server-side subscription signature verification and remote provider checks.
6. Subscription charge webhooks verify subscription association, amount and INR currency before recording a paid payment and issuing credits. Mandate authentication alone does not activate paid benefits.
7. Added subscription lifecycle/payment event handling for paid, failed, paused, halted, pending, resumed, cancelled and completed states. Existing paid-period credits remain usable after a mandate is stopped or its final cycle completes.
8. Customer and Admin booking cancellation use the same one-time credit restoration rule. Both block pending/authorized payments and preserve the existing refund guard for processed payments.
9. Admin can configure included visit count, minimum days between visits, maximum renewals, selected services, plant limit, benefits, limitations and price. Commercial terms lock after a subscription or Razorpay Plan is created.
10. A cancelled/expired subscription cannot be replaced before its current paid-through period ends.
11. Added migrations `20261123000300_subscription_booking_entitlements` and `20261123000400_booking_subscription_link`. Together with Phase 1/2 migrations, these are source-only and not applied to production.

### Phase 3 validation

- Frontend tests: **36/36 passed**.
- Backend runnable tests: **117/117 passed**; `account-management.test.js` remains blocked because `bcrypt` is absent after dependency installation timed out.
- JSX/TSX parse: 7 files, zero diagnostics.
- Backend source/scripts/tests `node --check`: passed.
- All four package/lock JSON files parse successfully.
- Vite production build and Prisma CLI validation not run because local executables are absent. Available Node is 22.16.0; project requires Node 22.22.x.
- No browser E2E, Razorpay Subscriptions API test, production migration or live deployment was performed.

### Remaining merchant-side release requirements

- Enable Razorpay Subscriptions / UPI AutoPay for the merchant account; ordinary UPI Checkout approval does not establish this entitlement.
- Add the subscription lifecycle webhook events in both Test and Live webhook configurations. The existing seven ordinary payment/refund events are not sufficient for AutoPay.
- Keep `RAZORPAY_SUBSCRIPTIONS_ENABLED=false` until merchant enablement, webhook setup and non-production lifecycle tests are complete.

## Phase 4 — Plant Store E-commerce

**Implemented in a separate Phase 4 package. Not merged into Phase 3.**

### Changes implemented

1. Added product detail content and responsive product detail modal while retaining the existing public catalogue and localStorage cart.
2. Added Customer checkout, delivery details, order history and order-status pages.
3. Added persistent `ShopOrder` / `ShopOrderItem` records with immutable product, SKU, price and image snapshots.
4. Added `StoreSettings` for Admin-configured shipping fee and tax rate. Defaults remain free shipping and 0% tax; no business rate was invented. Tax is currently calculated on the product subtotal only, with shipping displayed separately; confirm tax treatment with the business/accounting owner before live use.
5. Added server-side price calculation from current Product rows, inventory row locks, conditional stock decrement, stock movement audit and stock reservation release.
6. Added bounded checkout idempotency keys and request fingerprints. Duplicate same-payload submissions reuse an existing order; key reuse with changed payload/customer is rejected.
7. Added Razorpay Order creation and re-used the existing server-side payment signature verification, remote payment/order amount/currency checks, webhook idempotency and payment receipt delivery.
8. Added order status transitions for paid, processing, shipped, delivered, cancellation, payment review and refund; tracking number is required before marking shipped.
9. Added Admin Store Orders and Store pricing panels, plus a Store refund action using the existing server-side refund endpoint.
10. Added `STORE_CHECKOUT_ENABLED` independent of the shared `PAYMENTS_ENABLED` flag. This prevents the new Store routes from changing or disabling existing Live booking/UPI AutoPay payment functionality. It defaults to false in backend config, `.env.example` and Render Blueprint; the checkout page reads `/orders/status` and disables payment while the flag is off.
11. Aligned order inventory reservation with the configured 3-day Razorpay automatic-capture window. Authorized orders retain stock; unresolved expired authorizations move to manual review. A capture after inventory has been released is never automatically marked fulfilment-ready.
12. Added migration `20261123000500_plant_store_orders`. It is source-only and has not been applied to production.

### Phase 4 validation

- Frontend tests: **44/44 passed**.
- Phase 4-focused tests: **14/14 passed**.
- Backend tests: **124/124 runnable tests passed** when excluding `account-management.test.js`; that one file remains unable to load because `bcrypt` did not finish installing before `npm ci` timed out.
- Frontend JS/JSX parser: **16 files, zero syntax diagnostics**.
- Backend changed source files passed `node --check`.
- Prisma model-to-migration CREATE TABLE parity contract passes, including the three new Store models.
- Node 22.16.0 was available rather than required 22.22.x. Production build and Prisma CLI validation/client generation were not completed; there was no production migration, browser E2E or live Store transaction.

### Phase 4 production requirements

- Back up Supabase and compare all local migrations with production `_prisma_migrations` history.
- Rehearse and review `20261123000500_plant_store_orders` before applying it.
- Keep `STORE_CHECKOUT_ENABLED=false` while deploying the source and applying/rehearsing the migration.
- After migration, Admin can configure shipping/tax. Test Store checkout, payment capture, webhook, receipt, cancel/expiry, refund and fulfilment in Test Mode before enabling the Store flag for Live customers.

## Phase 5 — Razorpay UPI QR Payments

**Implemented in a separate Phase 5 package based on the Phase 4 ZIP. Not merged into the original Phase 3 archive.**

### Provider approach and scope

1. Confirmed the official Razorpay Payments QR Codes API supports server-generated `upi_qr` codes with `single_use`, `fixed_amount`, integer paise and `close_by` expiry, plus a payment-list endpoint. The `qr_code.credited` webhook is the provider notification used for captured QR payments.
2. Implemented a QR alternative for one-time Customer service booking payments and Phase 4 Plant Store payments. Existing Razorpay Checkout remains available. UPI AutoPay recurring subscriptions remain separate and cannot be activated by this one-time QR flow.
3. Added an independent `RAZORPAY_QR_ENABLED` environment flag, default false in backend config and `.env.example`; the Render Blueprint leaves the new flag owner-managed to avoid overriding an approved activation during later Blueprint syncs. The QR API is only exposed when regular Razorpay payments are enabled and merchant credentials are configured; Store QR additionally needs `STORE_CHECKOUT_ENABLED`.
4. Added persistent `PaymentQrSession` and `QrPaymentSessionStatus` with migration `20261123000600_qr_payment_sessions`. The migration is additive and source-only.
5. Added exact decimal-string to paise conversion, one-time/fixed-amount QR validation, server-side QR/payment fetching, exact captured UPI/INR/amount verification and signed `qr_code.credited` webhook reconciliation.
6. Added expiry and cancellation rechecks. QR close checks provider payments before and after close; an unresolved payment remains pending/review rather than being declared unpaid. Full Store order cancellation closes QR before releasing reserved inventory. Closing a QR only to change method leaves the underlying payment pending.
7. Added customer QR display, expiry, status-check and close/retry controls for booking detail and Store checkout/order pages. Checkout QR is not offered after a provider Checkout Order has already been created. Customer projections do not expose provider QR IDs.
8. Provider QR creation is serialized against the local Payment row and attempts to close an orphan provider QR if the local database write fails.

### Phase 5 validation

- Frontend test suite: **54/54 passed**.
- Backend tests: **131/131 passed** when excluding `account-management.test.js`, which cannot load because `bcrypt` did not finish installing in this environment.
- Phase 5 focused tests: **16/16 passed** (7 QR pure-rule tests and 9 frontend/API contract tests).
- Backend JavaScript syntax and frontend JSX/TSX parse checks are listed in the Phase 5 implementation report.
- Prisma schema-to-migration table-parity contract passes and includes `PaymentQrSession`.
- Environment Node is 22.16.0; project requires Node `>=22.22.0 <23`. The production Vite build and Prisma CLI validation/client generation were not completed. There was no database migration, Razorpay API call, QR scan, webhook delivery test, browser E2E or live deployment.

### Phase 5 merchant-side release requirements

- Confirm that the T-CARE Razorpay merchant account has QR Codes API access; official API documentation does not prove account-specific enablement.
- Apply the migration only after backup, production migration-history comparison and non-production rehearsal.
- Configure the signed `qr_code.credited` Test Mode webhook to `POST /api/v1/payments/webhook` and verify the existing webhook secret.
- Keep `RAZORPAY_QR_ENABLED=false` until migration, API access, signed webhook and Test Mode success/pending/failure/expiry/cancellation/duplicate-event/amount mismatch checks pass.
- Do not use screenshots, browser callbacks or user-entered UPI references as proof of payment.

## Phase 6 — Loading States, Regression & Release

**Implementation checkpoint completed in the 23 November Phase 6 package; production release validation remains pending.**

### Phase 6 source changes

- Added accessible busy/loading states to shared Customer/Gardener/Admin workspace state components, Store order pages and public Store catalogue loading. Product and record skeletons respect `prefers-reduced-motion`.
- Made Customer booking bootstrap loading abortable across route changes and retries. All five required datasets share one abort signal; obsolete responses cannot overwrite the current page state.
- Made Plant Store order detail and order history fetches abortable and generation-safe. Route switches and explicit refreshes cancel older requests before applying the current response.
- Locked authentication/recovery controls during async requests, added `aria-busy`, and disabled auth mode switching while a request is active.
- Locked Customer booking and Plant Store delivery/payment fields while submission/payment initialization is active; added a synchronous duplicate-submit guard to checkout and booking address creation.
- Added duplicate-action guards to booking payment/QR/review/issue actions and Customer plant/photo deletion.
- Improved cart quantity control accessibility and visually disables quantity increment at the enforced per-item limit of 20. Cart persistence remains synchronous localStorage; no fake network spinner is shown for a synchronous operation.
- Added Phase 6 contract tests for abortable loaders, loading/busy semantics, duplicate-submit prevention, reduced-motion skeletons, checkout field locking and cart quantity limits.
- Phase 6 adds no Prisma schema changes and no new migration. It preserves the four fail-closed payment feature flags and existing Phase 5 migration `20261123000600_qr_payment_sessions`.

### Phase 6 validation performed

- Frontend automated suite: **60/60 passed** (includes 6 Phase 6 release-readiness contracts).
- Backend automated suite: **131/131 passed** when excluding `account-management.test.js`, which cannot load because the `bcrypt` package is not installed in this environment.
- Frontend JS/JSX parser: 16 files, zero syntax diagnostics.
- Backend `node --check`: 81 JavaScript files passed.
- CSS changes reviewed and included in source; no full browser layout rendering was available.

### Outstanding release gates

A passing source-contract suite is not a substitute for live integration. This container has Node `22.16.0`; the project requires Node `>=22.22.0 <23`. Frontend and backend dependencies are not installed, so Vite build, Prisma Client generation/validation and the bcrypt-dependent backend suite cannot be completed here. The following must be run in a staging environment before production release:

1. Install on Node `22.22.x` using root `npm ci` and `backend/npm ci --include=dev`; then run frontend build and backend Prisma generate/validate plus the complete backend test suite.
2. Compare migrations `20261123000500_plant_store_orders` and `20261123000600_qr_payment_sessions` (and all earlier migrations) with the existing Supabase `_prisma_migrations` ledger. Rehearse the additive migrations on a non-production database after backup. Do not reset production.
3. Run browser E2E on desktop and mobile viewport sizes across Guest, Customer, Gardener and Admin workspaces. Cover session restore/refresh/expiry, role boundaries, page refresh, slow/failed requests, repeated submit, booking/credit cancellation and restoration, plant/media upload completion, Store inventory and fulfilment.
4. Run Razorpay Test Mode end-to-end for one-time booking Checkout, UPI AutoPay mandate lifecycle, Store checkout/refund, QR create/expiry/cancel/duplicate event/late capture and signed webhook reconciliation. Confirm merchant account QR API entitlement first.
5. Validate Render and Netlify configuration, same-origin API proxy and `FRONTEND_ORIGIN`; verify approved public contacts and production policy/legal content.
6. Re-run the entire test/build matrix against the exact merge candidate and perform a controlled deployment review. Keep payment flags false until the relevant provider and database gates pass.

**Release status:** Phase 6 implementation ZIP is a final source checkpoint, not an approved production release. No GitHub operation, production migration, environment change, deployment or live payment action was performed.

## Release and production safety

- No migration was applied to production Supabase.
- No Render environment variables were changed.
- No payment was created or refunded during implementation.
- Keep production deployments separate from this local work until the new migration is reviewed and release-tested on Node 22.22.x.
