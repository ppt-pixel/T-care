# T-CARE

T-CARE is a Customer / Gardener / Admin plant-care service platform with a React frontend, Node/Express API, Prisma/PostgreSQL persistence, and private Supabase Storage for media.

## Current implementation scope

- Cookie-based registration, email verification, login/session refresh, password change, and Admin provisioning.
- Customer plant/address management, service catalogue, booking lifecycle, reviews, and issue reports.
- Gardener profile, availability, KYC document submission, assignments, job execution, service reports, and evidence photos.
- Admin service/pricing management, user and Gardener operations, KYC review, booking assignment, plant knowledge, notifications, CMS, analytics, and audit visibility.
- Private media upload/download/delete through signed Supabase Storage URLs.

**Payment processing, payment webhooks, refunds, payouts, and payment-dependent subscription billing are explicitly excluded from the current completion scope.** Existing payment-related records/summary fields are not proof that payment processing is implemented.

## Setup

1. Copy root `.env.example` to `.env` and set `VITE_API_BASE_URL` (local default `http://localhost:4000`).
2. Copy `backend/.env.example` to `backend/.env` and configure PostgreSQL, Supabase, JWT, SMTP, and frontend origin settings privately.
3. Install frontend and backend dependencies separately with `npm ci` in the root and `backend` folders.
4. From `backend`, run `npx prisma migrate status`, then `npx prisma migrate deploy`, `npx prisma generate`, and `npx prisma validate`.
5. Run backend `npm run dev` and root `npm run dev` in separate terminals.

Never commit or share `.env` files, SMTP App Passwords, Supabase Secret API keys, database URLs, JWT secrets, cookies, or signed URLs.

## Phase 5 implementation notes

See [`docs/T-CARE-PHASE-5-IMPLEMENTATION-2026-11-09.md`](docs/T-CARE-PHASE-5-IMPLEMENTATION-2026-11-09.md) for the implemented modules, KYC migration, validation limits, and owner-side live smoke-test checklist.

See [`docs/T-CARE-AUTHENTICATION-IMPLEMENTATION.md`](docs/T-CARE-AUTHENTICATION-IMPLEMENTATION.md) for registration/OTP, Gmail SMTP, Admin provisioning, and session security.
