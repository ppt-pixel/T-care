# T-CARE Backend

Backend implementation and operational guide for the six-phase T-CARE project. The deployment target remains the existing Supabase PostgreSQL/Storage project with a Render-hosted Express API.

## Implemented
- Node.js + Express API
- Prisma ORM against Supabase PostgreSQL
- Server-side authentication with HTTP-only access/refresh cookies
- Database-backed RBAC for CUSTOMER/GARDENER/ADMIN
- Customer/Gardener public registration with server-assigned roles
- Hashed email OTP verification, expiry, attempt limits and resend cooldown
- Separate CLI-only ADMIN account provisioning
- Supabase Storage server adapter using the server-only Supabase Secret API key kept off the client
- Customer profile, address, and plant APIs with ownership checks

## Customer API
- GET/PATCH `/api/v1/customer/profile`
- GET/POST/PATCH/DELETE `/api/v1/customer/addresses`
- GET/POST/GET/PATCH/DELETE `/api/v1/customer/plants`

All customer routes require an authenticated CUSTOMER account. Resource queries scope records by the authenticated customer's profile; client-supplied IDs are never treated as sufficient authorization.

## Supabase setup
Set `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, and `SUPABASE_STORAGE_BUCKET` in `.env` using values from the Supabase project. For the persistent Render service, use the Supabase Shared Pooler Session URI on port `5432` (or a direct URI if IPv6 is reachable); do not use the Transaction Pooler on port `6543` with this current single-URL Prisma configuration. Create the `tcare-media` private bucket before enabling media uploads.

The application is designed so moving from Supabase Free to Pro does not require an application-level database redesign. Plan/quotas are infrastructure concerns, not hard-coded application limits.

## Payments

The backend includes server-authoritative Razorpay order creation, client-signature verification, signed webhook processing and Admin refund endpoints. Booking checkout is available in the Customer booking detail view only when the backend payment flag and Razorpay API credentials are configured. Configure `PAYMENT_PROVIDER`, `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, and `RAZORPAY_WEBHOOK_SECRET` only on the server. Never expose secret values to the frontend. See `docs/T-CARE-PAYMENT-SECURITY.md` before enabling live payments.

For local booking-payment testing, create an ignored `backend/.env.test` file using an isolated local database on `localhost:55432/tcare_payment_test`, keep `PAYMENTS_ENABLED=false`, and set `PAYMENT_TEST_CUSTOMER_EMAIL` to a synthetic `example.invalid` address plus `PAYMENT_TEST_CUSTOMER_PASSWORD` (12-72 UTF-8 bytes). Run `npm run payments:seed-test` from `backend/` to create a verified synthetic Customer, plant, address, active service and future booking. The script refuses any database URL other than the exact local test target and sends no email or Razorpay requests. Keep the existing `backend/.env` unchanged.


## Authentication and email verification

Public registration accepts only `accountType: CUSTOMER` or `accountType: GARDENER`. The API creates the matching profile and a `PENDING` user record. It does not issue an authenticated session until email verification succeeds. `ADMIN` is never accepted by public registration.

Auth endpoints:
- POST `/api/v1/auth/register` — create Customer or Gardener account and send email OTP
- POST `/api/v1/auth/verify-email` — verify `{ email, code }`, activate account and issue HTTP-only cookies
- POST `/api/v1/auth/resend-verification` — resend with per-account cooldown
- POST `/api/v1/auth/login` — requires verified email and ACTIVE status
- POST `/api/v1/auth/refresh` — rotates refresh session
- POST `/api/v1/auth/logout` — revokes refresh session
- GET `/api/v1/auth/me` — returns current verified user
- POST `/api/v1/auth/change-password` — checks current password, stores a new bcrypt hash, revokes refresh sessions, and issues a fresh session

OTP policy defaults: 6 digits, 10-minute expiry, 5 verification attempts and 60-second resend cooldown. Codes are HMAC-hashed using a domain-separated key derived from the server-side refresh secret; raw OTP values are never stored or logged. IP-based auth rate limits are in place in addition to database attempt/cooldown checks.

Configure Gmail SMTP in `backend/.env`:
- `SMTP_HOST=smtp.gmail.com`
- `SMTP_PORT=465`
- `SMTP_SECURE=true`
- `SMTP_USER` — dedicated T-CARE sender Gmail address
- `SMTP_PASSWORD` — Google App Password (not the normal Gmail password)
- `SMTP_FROM` — optional sender display value

After setting credentials, run `npm run email:verify` to test SMTP connectivity. Live email delivery still requires the owner's Gmail App Password and provider-side verification.

## Provision the Admin account

Set `ADMIN_EMAIL`, `ADMIN_FULL_NAME` and `ADMIN_INITIAL_PASSWORD` privately in `backend/.env`, then run:

```bash
npm run admin:provision
```

The CLI creates a verified ACTIVE ADMIN account only when that email does not already exist. If the email already belongs to a Customer or Gardener, provisioning stops without changing the account. Public registration cannot create Admin users. Do not commit or share the `.env` file.

Provisioning never changes an existing account's password. To explicitly reset an existing Admin account, set `ADMIN_EMAIL` and `ADMIN_RESET_PASSWORD` privately in `backend/.env`, then run:

```bash
npm run admin:reset-password
```

The command refuses non-Admin accounts, stores a bcrypt hash, revokes active refresh sessions and records an audit event. It does not print the password. Remove `ADMIN_RESET_PASSWORD` from the environment after use. Passwords must be at least 12 characters and no more than 72 UTF-8 bytes.


## Revoke exposed test sessions

The uploaded development archive previously contained a local cookie jar. Treat those session cookies as exposed. After applying this release to the intended database, run:

```bash
npm run auth:revoke-sessions
```

This revokes every active refresh session in the current database and requires all users to sign in again. Existing access JWTs expire naturally according to `ACCESS_TOKEN_TTL`.
