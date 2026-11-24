# Phase 4 Merge Guide — Plant Store

This package is a separate Phase 4 implementation based on the owner-supplied Phase 3 ZIP. It is not a replacement for Phase 3 and should not be deployed as a standalone production tree without the Phase 3 source it was built from.

## Recommended merge order

1. Keep an untouched copy of the final Phase 3 project.
2. Extract the Phase 4 ZIP into a separate directory and diff it against the Phase 3 base.
3. Apply all changed existing files from the Phase 4 package to the Phase 3 tree; retain all added files and migration `20261123000500_plant_store_orders`.
4. Resolve any concurrent changes rather than replacing files wholesale. The main shared files are `src/main.jsx`, `src/phase5.jsx`, `src/landing/Pages.jsx`, `src/landing/Sections.jsx`, `backend/src/app.js`, `backend/src/routes/payments.js`, `backend/prisma/schema.prisma`, `backend/src/config/env.js` and `render.yaml`.
5. Preserve any Phase 3 AutoPay or booking logic that has changed independently since the Phase 4 baseline. Review the diff for those shared files carefully.
6. Install with Node 22.22.x in both the frontend root and `backend`, then run the full test suites, Prisma generate/validate and Vite build.
7. Review and rehearse the new migration against a non-production database. Do not use `prisma migrate reset` or `prisma db push` against production.
8. Deploy backend source while `STORE_CHECKOUT_ENABLED=false`. Existing booking payments and subscription settings are retained using owner-managed Render variables (`sync: false` in `render.yaml`).
9. After the migration is applied, Admin can configure Store tax/shipping. Complete Test Mode Store payment, webhook, failed-payment, cancellation/expiry, refund and fulfilment tests.
10. Enable `STORE_CHECKOUT_ENABLED=true` in Render only after the preceding release gates pass.

## New runtime setting

`STORE_CHECKOUT_ENABLED` defaults to false. It is separate from `PAYMENTS_ENABLED` so Plant Store checkout can be released without changing the existing Live booking/UPI AutoPay payment gates.

## Data and business rules

- Prices, tax, shipping and stock are calculated by the server.
- Product and order financial values use Decimal database fields and exact paise arithmetic.
- The current tax setting is applied to the product subtotal only; shipping is calculated separately. Confirm the business's tax treatment with its accountant before turning Store checkout on for Live customers.
- Unpaid reservations expire and release stock once. Authorized payments retain stock through the configured capture window; unresolved cases go to manual review.
- Store orders do not change service booking or subscription visit credits.
