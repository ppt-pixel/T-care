# T-CARE Backend

Current Phase 2 target: Supabase Free-compatible production architecture.

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
Set `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, and `SUPABASE_STORAGE_BUCKET` in `.env` using the values from the Supabase project. Create the `tcare-media` private bucket before enabling media uploads.

The application is designed so moving from Supabase Free to Pro does not require an application-level database redesign. Plan/quotas are infrastructure concerns, not hard-coded application limits.

## Payments

Payment endpoints use a server-authoritative Razorpay Orders flow. Configure `PAYMENT_PROVIDER`, `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, and `RAZORPAY_WEBHOOK_SECRET` only on the server. Never expose the secret values to the frontend. See `docs/T-CARE-PAYMENT-SECURITY.md` before enabling live payments.


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


## Revoke exposed test sessions

The uploaded development archive previously contained a local cookie jar. Treat those session cookies as exposed. After applying this release to the intended database, run:

```bash
npm run auth:revoke-sessions
```

This revokes every active refresh session in the current database and requires all users to sign in again. Existing access JWTs expire naturally according to `ACCESS_TOKEN_TTL`.
