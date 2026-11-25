# T-CARE

T-CARE is a Customer / Gardener / Admin plant-care service platform with a React frontend, Node/Express API, Prisma/PostgreSQL persistence, and private Supabase Storage for media.

## Current implementation scope

- Cookie-based registration, email verification, login/session refresh, password change, and Admin provisioning.
- Customer plant/address management, service catalogue, booking lifecycle, reviews, and issue reports.
- Gardener profile, availability, KYC document submission, assignments, job execution, service reports, and evidence photos.
- Admin service/pricing management, user and Gardener operations, KYC review, booking assignment, plant knowledge, notifications, CMS, analytics, and audit visibility.
- Private media upload/download/delete through signed Supabase Storage URLs.

**Payment integration status:** One-time Razorpay booking checkout uses server-created orders, server-side signature/provider verification, payment-return reconciliation, webhook processing and receipt delivery behind `PAYMENTS_ENABLED` (false by default in environment templates). Phase 3 also implements Razorpay Subscriptions / UPI AutoPay for structured Weekly, One-Month and One-Year plans. Recurring checkout additionally requires `RAZORPAY_SUBSCRIPTIONS_ENABLED=true`, merchant-side Subscriptions/UPI AutoPay activation, subscription lifecycle webhook configuration, and non-production end-to-end mandate/renewal testing. Admin-configured visit credits are issued only after captured subscription charges are verified; unused credits expire at period end, and cancellations before Gardener service start restore the original-period credit once. The Customer Billing screen remains a read-only payment ledger. Phase 4 adds the Plant Store product detail experience, browser-persistent cart, server-priced checkout, inventory reservation, order history and Admin fulfilment. Phase 5 adds Razorpay-generated single-use fixed-amount UPI QR as an alternative for one-time booking and Plant Store payments; the backend confirms payment only after independent provider API verification and the signed `qr_code.credited` webhook. QR requires `RAZORPAY_QR_ENABLED=true` in addition to the existing payment and (for Store) Store checkout flags, plus merchant-side QR API access. QR remains disabled by default pending merchant and Test Mode verification. QR does not authorise or replace UPI AutoPay mandates. Admin can inspect Store orders, configure the Store shipping fee and tax rate, move paid orders through processing/shipping/delivery, and request full refunds through the existing Razorpay refund endpoint. Gardener/Admin payout screens display ledger records only; they do not calculate commissions or execute payouts.

## Setup

1. Copy root `.env.example` to `.env` and set `VITE_API_BASE_URL` (local default `http://localhost:4000`).
2. Copy `backend/.env.example` to `backend/.env` and configure PostgreSQL, Supabase, JWT, SMTP, and frontend origin settings privately.
3. Install frontend and backend dependencies separately with `npm ci` in the root and `backend` folders.
4. From `backend`, run `npx prisma migrate status`, `npx prisma generate`, and `npx prisma validate`. For an existing Supabase database, compare the migration list with the database's `_prisma_migrations` table first. Apply `npx prisma migrate deploy` only after a backup, a non-production rehearsal, and an explicit review of the exact pending migrations. Never run `prisma migrate reset` against production.
5. Run backend `npm run dev` and root `npm run dev` in separate terminals.

Never commit or share `.env` files, SMTP App Passwords, Supabase Secret API keys, database URLs, JWT secrets, cookies, or signed URLs.

## Phase 5 — UPI QR payments

See [`docs/T-CARE-PHASE-5-UPI-QR-PAYMENTS-2026-11-23.md`](docs/T-CARE-PHASE-5-UPI-QR-PAYMENTS-2026-11-23.md) for the QR design, provider verification rules, customer flow, feature flags, migration, merchant prerequisites and release checklist. The [`implementation report`](docs/T-CARE-PHASE-5-IMPLEMENTATION-REPORT-2026-11-23.md) records validation results and limitations; the separate [`Phase 5 merge guide`](docs/T-CARE-PHASE-5-MERGE-GUIDE-2026-11-23.md) lists modified files and safe integration order.

See [`docs/T-CARE-AUTHENTICATION-IMPLEMENTATION.md`](docs/T-CARE-AUTHENTICATION-IMPLEMENTATION.md) for registration/OTP, Gmail SMTP, Admin provisioning, and session security.


## Public contact configuration

The official customer-care email is `support@t-care.in` and is maintained in `src/landing/content.js`; it is shown on both the Contact page and global footer without requiring a deployment variable.

Set these optional Vite build-time variables for additional public contact channels. For the existing Hostinger website, enter them in the environment used to build the frontend (or set them in PowerShell before `npm run build`):

- `VITE_WHATSAPP_NUMBER`: T-CARE's actual WhatsApp Business number in international digits only (for example, country code plus number; do not include `+`, spaces or punctuation). Leave blank until the verified business number is supplied.
- `VITE_PUBLIC_PHONE_NUMBER`: verified public phone number.
- `VITE_PUBLIC_LOCATION`: approved public-facing office or service-area text.
- `VITE_PUBLIC_OFFICE_ADDRESS`: approved public-facing office address; leave blank until verified.
- `VITE_INSTAGRAM_URL`, `VITE_YOUTUBE_URL`, `VITE_FACEBOOK_URL`, `VITE_LINKEDIN_URL`: optional public profile URLs. Only valid HTTPS URLs are displayed; unset accounts are omitted from the footer.

These values are embedded in the frontend at build time; rebuild and republish `dist/` after changing them. Do not add private personal contact details.

## Plant Store and order management

The Plant Store uses the Admin-managed Product catalogue. Admin must enter approved products, images, prices, care instructions and stock. Phase 4 adds the additive migration `20261123000500_plant_store_orders`; Phase 5 adds `20261123000600_qr_payment_sessions`. Checkout totals and stock are calculated on the server; the browser never supplies trusted prices. The default tax rate is 0% and shipping is free until Admin configures approved values. Existing orders retain immutable price snapshots. Apply migrations only after reviewing production migration history, taking a backup and rehearsing against a non-production database. Keep Store checkout and QR payment flags gated until Razorpay payment, webhook, cancellation, expiry, refund and fulfilment tests pass.


## Phase 6 — Final integration and release readiness

The final 23 November implementation checkpoint adds abortable Customer booking and Store order loaders, busy/disabled form states for authentication and checkout, accessible catalogue/order loading skeletons, reduced-motion support and Phase 6 regression contracts. See [`docs/T-CARE-PHASE-6-FINAL-CHECKPOINT-2026-11-23.md`](docs/T-CARE-PHASE-6-FINAL-CHECKPOINT-2026-11-23.md), the [`staging smoke-test matrix`](docs/T-CARE-PHASE-6-STAGING-SMOKE-TESTS-2026-11-23.md), the [implementation report](docs/T-CARE-PHASE-6-IMPLEMENTATION-REPORT-2026-11-23.md), the [merge guide](docs/T-CARE-PHASE-6-MERGE-GUIDE-2026-11-23.md), and [`docs/T-CARE-SIX-PHASE-TRACKER.md`](docs/T-CARE-SIX-PHASE-TRACKER.md).

For the existing production topology, use the [Production Release Runbook](docs/T-CARE-PRODUCTION-RELEASE-RUNBOOK-2026-11-23.md) together with the [Hostinger Routing Addendum](docs/T-CARE-HOSTINGER-ROUTING-ADDENDUM-2026-11-24.md). The frontend remains hosted at `https://t-care.in/` on Hostinger and the API remains on Render. Netlify settings in the runbook apply only if the frontend is intentionally moved there.

**Release status:** implementation checkpoint only. The source test suites pass in this container, but a Node 22.22.x dependency install, Vite production build, Prisma generation/validation, complete backend suite, Supabase migration rehearsal, role-based browser E2E and Razorpay Test Mode checks remain required. Keep `PAYMENTS_ENABLED`, `RAZORPAY_SUBSCRIPTIONS_ENABLED`, `STORE_CHECKOUT_ENABLED` and `RAZORPAY_QR_ENABLED` false until their independent release gates pass. No production resources have been changed.

Customer billing history is read-only and reflects verified payment/refund records returned by the authenticated Customer payment API. For the existing Hostinger deployment, set `VITE_API_BASE_URL` to the actual HTTPS Render API origin before building the production frontend. The `.htaccess` file handles React Router history fallback only; it does not proxy `/api` requests. For an optional Netlify deployment, the same-origin `/api/*` proxy can be used with `VITE_API_BASE_URL` unset.


## Hostinger browser-cache behavior

`public/.htaccess` prevents stale application shells after frontend deployments: HTML is `no-store`/`no-cache`, the LiteSpeed Cache Manager is bypassed for the SPA shell and unversioned files, and only content-hashed Vite assets receive a one-year immutable cache. Upload the complete new `dist` contents, including the hidden `.htaccess`, after each build. Purge the Hostinger Cache Manager and CDN once when installing this policy to clear old entries. See [`docs/T-CARE-HOSTINGER-CACHE-POLICY-2026-11-24.md`](docs/T-CARE-HOSTINGER-CACHE-POLICY-2026-11-24.md). A tab already running an older bundle gets the new code on its next ordinary reload/navigation; the application does not forcibly interrupt active booking or payment flows.


## Maintainer note

The dedicated cleanup checkpoint dated 14 November 2026 removed the unmounted prototype Customer/Gardener/Admin screens, their demo records and the frontend-only mutation state from `src/main.jsx`. The active Customer/Admin/Gardener workspace routes remain mapped to API-backed components, with the Gardener profile using authenticated API endpoints. Public catalogue sections continue to use live API data and honest empty/loading/error states. Later Phase 4 and Phase 5 work adds persistent Plant Store orders, server-side payment verification and optional provider-generated UPI QR; the earlier browsing-only Store status is superseded by those later phases. Do not reintroduce demo records or non-persistent workspace screens into production navigation.

## Runtime versions

The frontend and backend target Node.js `22.22.0` (the supported Node 22 line). Payment provider mode is configured separately using `RAZORPAY_MODE=test|live`: use `test` on an isolated staging deployment (even when `NODE_ENV=production` so cookies and origin checks match production), and `live` only on the real production service with `rzp_live_` credentials. Render's `rootDir: backend` service pins `NODE_VERSION` explicitly because the repository-root `.node-version` is outside that service root. Frontend package versions are pinned to the exact versions recorded in `package-lock.json`; install with `npm ci`.

## Customer Booking and Subscription Implementation

See [`docs/T-CARE-BOOKING-STORE-IMPLEMENTATION-PROGRESS-2026-11-23.md`](docs/T-CARE-BOOKING-STORE-IMPLEMENTATION-PROGRESS-2026-11-23.md) for Phase 0–6 progress and [`docs/T-CARE-PHASE-3-CUSTOMER-BOOKING-UPIAUTOPAY-2026-11-23.md`](docs/T-CARE-PHASE-3-CUSTOMER-BOOKING-UPIAUTOPAY-2026-11-23.md) for the booking entitlement model, UPI AutoPay lifecycle, webhook requirements, migration list and release checks.
