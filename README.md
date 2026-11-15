# T-CARE

T-CARE is a Customer / Gardener / Admin plant-care service platform with a React frontend, Node/Express API, Prisma/PostgreSQL persistence, and private Supabase Storage for media.

## Current implementation scope

- Cookie-based registration, email verification, login/session refresh, password change, and Admin provisioning.
- Customer plant/address management, service catalogue, booking lifecycle, reviews, and issue reports.
- Gardener profile, availability, KYC document submission, assignments, job execution, service reports, and evidence photos.
- Admin service/pricing management, user and Gardener operations, KYC review, booking assignment, plant knowledge, notifications, CMS, analytics, and audit visibility.
- Private media upload/download/delete through signed Supabase Storage URLs.

**Payment integration status:** The backend contains Razorpay order-creation, client-signature verification, webhook and Admin refund API routes, but they are gated by `PAYMENTS_ENABLED=false` by default. Subscription order creation now serializes against the subscription record and uses a database constraint to prevent multiple active payment records; booking/subscription cancellation is blocked while payment is pending. Apply and rehearse the new migration before enabling payments. These routes have not been validated against a configured Razorpay test account in this release. Keep the feature gate disabled until test-mode provider verification, webhook replay/idempotency and concurrent-order/refund tests pass. The Customer UI does not yet expose checkout or refund actions; the Customer Billing screen is read-only. Subscription requests remain `PENDING` until a verified payment event activates them. Gardener/Admin payout screens display ledger records only; they do not calculate commissions or execute payouts. The Plant Store is catalogue-only and has no checkout/order fulfilment.

## Setup

1. Copy root `.env.example` to `.env` and set `VITE_API_BASE_URL` (local default `http://localhost:4000`).
2. Copy `backend/.env.example` to `backend/.env` and configure PostgreSQL, Supabase, JWT, SMTP, and frontend origin settings privately.
3. Install frontend and backend dependencies separately with `npm ci` in the root and `backend` folders.
4. From `backend`, run `npx prisma migrate status`, `npx prisma generate`, and `npx prisma validate`. For an existing Supabase database, compare the migration list with the database's `_prisma_migrations` table first. Apply `npx prisma migrate deploy` only after a backup, a non-production rehearsal, and an explicit review of the exact pending migrations. Never run `prisma migrate reset` against production.
5. Run backend `npm run dev` and root `npm run dev` in separate terminals.

Never commit or share `.env` files, SMTP App Passwords, Supabase Secret API keys, database URLs, JWT secrets, cookies, or signed URLs.

## Phase 5 implementation notes

See [`docs/T-CARE-PHASE-5-IMPLEMENTATION-2026-11-09.md`](docs/T-CARE-PHASE-5-IMPLEMENTATION-2026-11-09.md) for the implemented modules, KYC migration, validation limits, and owner-side live smoke-test checklist.

See [`docs/T-CARE-AUTHENTICATION-IMPLEMENTATION.md`](docs/T-CARE-AUTHENTICATION-IMPLEMENTATION.md) for registration/OTP, Gmail SMTP, Admin provisioning, and session security.


## Public contact configuration

Set these optional Netlify environment variables for the public contact page:

- `VITE_WHATSAPP_NUMBER`: T-Care's actual WhatsApp Business number in international digits only (for example, country code plus number; do not include `+`, spaces or punctuation). Leave blank until the verified business number is supplied.
- `VITE_PUBLIC_CONTACT_EMAIL`: verified public contact email.
- `VITE_PUBLIC_PHONE_NUMBER`: verified public phone number.
- `VITE_PUBLIC_LOCATION`: approved public-facing office or service-area text.
- `VITE_INSTAGRAM_URL`, `VITE_YOUTUBE_URL`, `VITE_FACEBOOK_URL`, `VITE_LINKEDIN_URL`: optional public profile URLs. Only valid HTTPS URLs are displayed; unset accounts are omitted from the footer.

These values are embedded in the frontend at build time; trigger a new Netlify build after changing them. Do not add private personal contact details.

## Plant Store catalogue

Phase 5 adds the Admin-managed product catalogue. Apply the additive Prisma migration `20261112000200_add_product_catalogue` before enabling the public store. Products are not pre-seeded: Admin must enter approved catalogue data and stock. Product checkout and payment are not enabled by this phase.


## Phase 6 integration note

Customer billing history is read-only and reflects verified payment/refund records returned by the authenticated Customer payment API. The production frontend should use the same-origin Netlify API proxy: leave `VITE_API_BASE_URL` unset in Netlify.


## Maintainer note

The dedicated cleanup checkpoint dated 14 November 2026 removed the unmounted prototype Customer/Gardener/Admin screens, their demo records and the frontend-only mutation state from `src/main.jsx`. The active Customer/Admin/Gardener workspace routes remain mapped to the API-backed Phase 5 components, with the Gardener profile using its authenticated API endpoints. Public catalogue sections continue to use live API data and honest empty/loading/error states. The retired workspace-only CSS has also been removed; the store cart is browsing-only and displays checkout availability as a status, not a working payment control. Do not reintroduce demo records or non-persistent workspace screens into production navigation.

## Runtime versions

The frontend and backend target Node.js `22.22.0` (the supported Node 22 line). Render's `rootDir: backend` service pins `NODE_VERSION` explicitly because the repository-root `.node-version` is outside that service root. Frontend package versions are pinned to the exact versions recorded in `package-lock.json`; install with `npm ci`.
