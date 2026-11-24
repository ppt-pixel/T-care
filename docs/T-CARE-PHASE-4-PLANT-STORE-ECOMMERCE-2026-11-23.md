# T-CARE Phase 4 — Plant Store E-commerce

**Source baseline:** Phase 3 UPI AutoPay / customer booking project archive supplied by the owner on 23 November 2026.  
**Delivery:** Separate Phase 4 source package; not merged into Phase 3 and not pushed to GitHub.  
**Production changes:** None. No Netlify/Render deployment, Razorpay live order, refund, or Supabase migration was performed.

## Scope implemented

### Customer storefront
- Preserved the existing live product catalogue and Admin inventory management.
- Added individual product detail content to the existing product detail modal: description, care instructions, light requirements, watering frequency, safety notes, image, current price and stock state.
- Preserved the browser-persistent cart and capped each product quantity at 20.
- Added a Customer-only checkout route with recipient and delivery address validation.
- Added customer Store Orders history and an individual order-status page.
- The cart is persistent in the current browser through the existing localStorage implementation; server-side orders and item snapshots are persistent in PostgreSQL. The cart is not yet synchronized across a customer's separate devices.

### Server-side order and stock controls
- Added `ShopOrder` and `ShopOrderItem` models with immutable price, SKU, name and image snapshots, delivery address, status, totals, tracking details, idempotency key, request fingerprint, expiry and stock-release marker.
- Checkout accepts only product IDs and quantities. Product availability, current prices, shipping fee, tax rate and order total are calculated by the backend from database records.
- Product rows are locked inside a serializable transaction; stock is conditionally decremented and every reservation is recorded in `ProductStockMovement`.
- Duplicate checkout submissions with the same idempotency key and payload reuse the original order; using the same key with a different payload or customer is rejected.
- Unpaid orders release reserved stock after the payment window expires or the customer cancels. Stock restoration is protected by `stockReleasedAt` to prevent double release.
- An `AUTHORIZED` payment keeps inventory reserved for Razorpay's configured three-day automatic-capture window. If it remains unresolved beyond that window, the order moves to `PAYMENT_REVIEW` rather than releasing inventory while authorization is unresolved.
- If capture arrives after the reservation has already been released, the order moves to `PAYMENT_REVIEW`; it is not automatically marked fulfilment-ready. Admin must resolve or refund it.

### Razorpay and receipt integration
- Added Store Order payment linkage to the existing `Payment` model.
- Uses the existing Razorpay server-created Orders flow and existing server-side Checkout signature verification, remote order/payment ID validation, amount and currency checks, signed webhook processing and duplicate-event protection.
- Captured Store payments update the associated order only after provider verification. Client redirect/checkout messages alone do not confirm an order.
- Store payment receipts use the existing idempotent receipt snapshot/email delivery service.
- Admin full refunds use the existing server-side Razorpay refund endpoint. A provider-confirmed full refund updates the order to `REFUNDED`; pending refunds remain pending until confirmed.

### Admin operations
- Added Store pricing settings for shipping fee and tax percentage. Defaults are free shipping and 0% tax; no tax or delivery rate was invented.
- Existing orders retain the exact pricing snapshot applied at checkout; later Admin setting changes affect only new orders.
- Added Admin Store Orders list with customer, line items, amount, payment status and fulfilment state.
- Admin can move paid orders through Processing → Shipped → Delivered; a tracking number is required before shipment.
- Admin can request a full refund for eligible paid or payment-review orders.
- Product Admin form now includes care instructions, light requirements, watering frequency and safety notes.

## Feature gate and release safety

A separate environment flag was added:

```env
STORE_CHECKOUT_ENABLED=false
```

- It defaults to `false` in backend configuration, `backend/.env.example`, and the Render Blueprint.
- `PAYMENTS_ENABLED` remains the shared gate for existing booking and subscription payments. Store checkout no longer requires changing the existing booking/payment feature flag.
- The public Store catalogue and cart remain browseable while Store checkout is disabled. The checkout page reads `/api/v1/orders/status` and disables its payment action while the Store flag is off.
- Admin can configure tax/shipping after the database migration is applied, even while Store checkout remains disabled.
- The Store flag blocks only new Customer checkout; existing Customer order history/details/cancellation and Admin order management/fulfilment remain available if new checkout is paused.
- Do not set `STORE_CHECKOUT_ENABLED=true` until the migration has been applied and staged checkout, webhook, failure, expiry, cancellation, refund and fulfilment cases pass.

## Migration

Added source-only migration:

`backend/prisma/migrations/20261123000500_plant_store_orders/migration.sql`

It creates `ShopOrderStatus`, `StoreSettings`, `ShopOrder`, `ShopOrderItem`, Product care fields, the unique Payment-to-ShopOrder relation, indexes and foreign keys.

The migration has **not** been applied to Supabase. Before production application:
1. Back up the production database.
2. Compare all local migration names with the production `_prisma_migrations` table.
3. Rehearse the exact pending migration on a non-production copy.
4. Validate Prisma schema/client generation using Node 22.22.x.
5. Review the migration SQL and order/payment state handling.
6. Apply with the documented guarded `prisma migrate deploy` procedure only after explicit release approval.

## Files added

- `backend/src/routes/orders.js`
- `backend/src/lib/storeOrderRules.js`
- `backend/prisma/migrations/20261123000500_plant_store_orders/migration.sql`
- `backend/tests/store-order-rules.test.js`
- `src/store/StoreCheckout.jsx`
- `src/store/storeCheckout.css`
- `tests/store-checkout-contract.test.js`
- `backend/.env.example`
- `.env.example`

## Existing files changed

- `backend/prisma/schema.prisma`
- `backend/src/app.js`
- `backend/src/config/env.js`
- `backend/src/routes/payments.js`
- `backend/src/routes/products.js`
- `backend/src/routes/admin.js`
- `backend/src/lib/paymentValidation.js`
- `backend/src/lib/paymentView.js`
- `backend/src/lib/paymentReceipts.js`
- `backend/tests/phase6-integration-contract.test.js`
- `src/main.jsx`
- `src/phase5.jsx`
- `src/landing/Pages.jsx`
- `src/landing/Sections.jsx`
- `src/landing/pages.css`
- `render.yaml`
- `README.md`
- `docs/T-CARE-BOOKING-STORE-IMPLEMENTATION-PROGRESS-2026-11-23.md`

## Validation performed

- Root frontend tests: **45/45 passed**.
- Backend tests: **124 runnable tests passed**. The remaining `account-management.test.js` file could not load because the dependency installation timed out before the `bcrypt` package completed installation; the dependency remains declared in the backend package manifest and lockfile.
- Additional Phase 4-focused tests: **15/15 passed**.
- Backend source, scripts and tests JavaScript syntax checks: passed for changed files.
- Prisma model/table migration parity contract: passed for all models including ShopOrder, ShopOrderItem and StoreSettings.
- ZIP integrity: checked after packaging.

### Validation limits

- Available Node runtime is `22.16.0`; project requires `>=22.22.0 <23`.
- `npm ci` for backend timed out. `bcrypt` remained incomplete.
- Prisma CLI validation/client generation and a production Vite build were not completed in this environment.
- No browser E2E, live Razorpay Store transaction/refund, webhook delivery or real fulfilment integration was performed.

## Owner-side release checklist

- Confirm Node 22.22.x in the validation/deployment environment.
- Review migration `20261123000500_plant_store_orders` and production migration history.
- Back up and rehearse the migration; then apply it to production with approval.
- Keep `STORE_CHECKOUT_ENABLED=false` during migration and initial deploy.
- Configure approved shipping fee and tax in Admin after migration.
- Test one low-value Test Mode Store checkout, stock reservation/release, server verification, `payment.captured` webhook, receipt email, failed payment, Checkout dismissal, duplicate submit, full refund and Admin tracking/fulfilment.
- Only after all staging checks pass, enable `STORE_CHECKOUT_ENABLED=true` in Render and verify the live Store flow with one controlled legitimate order.
- Existing `PAYMENTS_ENABLED` / UPI AutoPay settings and booking features are not changed by this separate Store flag.
