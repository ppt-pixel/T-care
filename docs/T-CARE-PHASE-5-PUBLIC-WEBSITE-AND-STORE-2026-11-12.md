# T-CARE — Phase 5: Public Website, About Us and Plant Store

**Checkpoint date:** 12 November 2026  
**Base:** Phase 4 implementation checkpoint  
**Release state:** Local implementation checkpoint only; not deployed

## 1. Phase objective

Complete the public-facing website and make the About, subscription-plan and Plant Store content depend on persisted T-CARE records rather than hardcoded sample data. Provide the Admin controls required to operate the product catalogue. Preserve the existing Netlify + Render + Supabase architecture and do not enable payments or checkout in this phase.

## 2. Implemented work

### Public service catalogue

- The public Services page loads active services and currently effective price tiers from `GET /api/v1/services`.
- Service popularity is loaded from `GET /api/v1/services/popular?range=30d`; counts are derived from saved, non-cancelled bookings.
- Loading, retry, error and empty states are shown instead of sample services or popularity counts.
- Service descriptions and prices are sourced from the Admin-managed service catalogue. Unsupported fixed inclusions and delivery claims were removed.

### About Us and Gardener directory

- Added `GET /api/v1/gardener/public` before the Gardener-only route middleware.
- It returns only active Gardener users whose KYC status is `VERIFIED`.
- Public fields are limited to display name, biography, service area, rating and completed-visit count. Email, phone, KYC files and private availability are not exposed.
- The About page refreshes these profiles while the page is visible and has explicit loading, error and empty states.

### Customer reviews

- The public reviews section uses the existing `GET /api/v1/reviews-issues/public` endpoint.
- Only `PUBLISHED` reviews are returned; customer names and private customer details are not exposed.
- Each review can display the service, associated Gardener name, rating, comment and date.
- No fictional testimonials or ratings are included. The UI explains when there are no published reviews.

### Subscription plans

- Public plans are loaded from `GET /api/v1/subscriptions/plans`, which returns active Admin-published plans.
- The UI shows current plan name, description, cycle, plant limit and price.
- The page states that requests remain pending until payment is verified. No payment or activation is simulated.

### Product catalogue and Plant Store

- Added Prisma models `Product` and `ProductStockMovement`.
- Added additive migration `backend/prisma/migrations/20261112000200_add_product_catalogue/migration.sql`.
- Added product API router mounted at `/api/v1/products`.
- Public `GET /api/v1/products` exposes active product catalogue records, live stock quantity and current price. It supports category/search/in-stock filters and pagination parameters.
- Admin endpoints require authentication and the database-backed `ADMIN` role:
  - `GET /api/v1/products/admin`
  - `POST /api/v1/products/admin`
  - `PATCH /api/v1/products/admin/:id`
  - `POST /api/v1/products/admin/:id/stock`
  - `GET /api/v1/products/admin/:id/stock-movements`
  - `DELETE /api/v1/products/admin/:id` (soft-deactivates a product)
- Product creation and every stock movement write audit records. Stock adjustments are atomic and cannot make stock negative or exceed 100,000 units.
- Added an Admin navigation entry and protected `/hq/store` screen for product creation, editing, activation status, stock adjustment and stock history.
- Public `/store` and the home-page market use live catalogue data, show actual stock/price and explicit out-of-stock states. They do not contain seeded fake products.
- No products are pre-seeded; Admin must create approved product records.

### WhatsApp and public contact configuration

- WhatsApp links use `VITE_WHATSAPP_NUMBER` only when it is configured as a valid international number.
- No number was supplied in the project context, so the environment remains blank and the UI displays a configuration message instead of inventing a number.
- Optional `VITE_PUBLIC_CONTACT_EMAIL`, `VITE_PUBLIC_PHONE_NUMBER` and `VITE_PUBLIC_LOCATION` settings were added. Unconfigured contact data is not fabricated.
- Updated `.env.example` and deployment documentation. These frontend environment variables are embedded at build time; Netlify needs a new build after values are added or changed.

### Public content accuracy

- Removed sample fixed makeover packages and prices; makeover pricing must be agreed in the booking proposal.
- Labeled the makeover artwork as illustrative concepts, not customer-project photographs.
- Removed unverified delivery, replacement and aftercare promises.
- Replaced placeholder phone, email and office details with environment-configured fields.
- The Terms page is explicitly a draft placeholder, not an approved legal policy.
- The public cart is clearly described as a browsing preview. Product checkout, payment, delivery scheduling and fulfilment are not enabled.

## 3. Validation performed

| Check | Result |
|---|---|
| Backend JavaScript syntax (`backend/src`, `backend/scripts`, `backend/tests`) | Passed — 37 files |
| Frontend JS/JSX parse | Passed — 11 files, zero parse diagnostics |
| Backend automated tests | Passed — 14/14 |
| Root/backend package and lockfile JSON parsing | Passed — 4 files |
| Product Prisma model / SQL migration static consistency | Passed |
| Product API mount, Admin role guard and atomic stock checks | Passed — static checks |
| Public API and Admin UI wiring | Passed — static checks |
| Vite production build | Not run successfully: `vite: not found` |
| Prisma CLI validation | Not run successfully: `prisma: not found` |
| Live Supabase migration / database integration | Not run |
| Live public pages, role-based E2E and browser testing | Not run |

The production build and Prisma validation are **not** marked as passed. The required executables are absent in the working environment. Dependency installation is required before those checks can be performed.

## 4. Required configuration and database steps before release

1. Install frontend dependencies using `npm ci` from the project root, then run `npm run build`.
2. Install backend dependencies from `backend`, then run `npx prisma generate`, `npm test` and `npx prisma validate`.
3. Inspect the existing Supabase migration status before applying anything. The new additive migration is `20261112000200_add_product_catalogue`; do not run `prisma migrate reset` and do not blindly apply migrations to an existing production database.
4. Only after the migration is reviewed and applied in the intended environment should Admin test product creation, editing, deactivation, stock adjustment and stock history.
5. Set the actual T-Care WhatsApp Business number in Netlify's `VITE_WHATSAPP_NUMBER`; optionally configure verified public email, phone and location values. Rebuild Netlify after setting them.
6. Verify the public Gardener directory with at least one eligible active, KYC-verified profile; verify published review moderation; publish active plans/services/products through their Admin screens.
7. Browser-test customer, Gardener and Admin access, public pages, service pricing, subscription status and product stock before deployment.

## 5. Production and payment boundaries

- No GitHub push or Netlify/Render deployment was made.
- No Supabase production migration was applied and no live records were changed.
- Netlify, Render, Supabase and Brevo configuration was preserved.
- No product checkout/payment/order-fulfilment workflow was added.
- Subscription activation continues to require verified payment; Phase 5 does not simulate successful payment.
- The WhatsApp integration is implemented as configurable code; it is not a live chat channel until the actual business number is configured.

## 6. Exit status

**Implementation checkpoint prepared.** Phase 5 is functionally wired in the local codebase, but its release exit gate remains open until Vite build, Prisma validation, migration review, database integration and browser-based role/public E2E checks pass.
