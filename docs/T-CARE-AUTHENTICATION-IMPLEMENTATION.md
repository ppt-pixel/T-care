# T-CARE Authentication and Identity — Implementation Notes

## Roles and registration

- Public registration accepts `accountType: "CUSTOMER"` or `accountType: "GARDENER"` only.
- The server creates `User.role` from that enum; it never trusts a client-provided `role`.
- Customer registration creates `CustomerProfile`.
- Gardener registration creates `GardenerProfile` with `kycStatus: NOT_STARTED`.
- Public registration cannot create `ADMIN` accounts.
- The exact normalized email is stored as the identity for the assigned role. Gmail domain alone is never used to grant a role.
- Admin is provisioned using the local CLI command `npm run admin:provision`.

## Email verification lifecycle

1. Register creates a user with `status: PENDING`, `emailVerifiedAt: null`, the matching role profile, and an `EmailOtp` record.
2. The API sends the six-digit code through the dedicated T-CARE Gmail sender.
3. The OTP database value is an HMAC-SHA256 digest, not the plaintext code.
4. `POST /api/v1/auth/verify-email` validates the code, expiry and attempt count.
5. Successful verification consumes the OTP, sets `emailVerifiedAt`, changes account status to `ACTIVE`, writes an audit event and issues HTTP-only access/refresh cookies.
6. Gardener email verification does not verify KYC. KYC remains `NOT_STARTED` until the Admin review workflow approves the gardener.
7. Login, refresh, `/me` and authenticated APIs reject unverified accounts.

Defaults: 10-minute OTP expiry, 5 attempts, 60-second resend cooldown. These are configurable through `OTP_TTL_MINUTES`, `OTP_MAX_ATTEMPTS`, and `OTP_RESEND_COOLDOWN_SECONDS`. Auth endpoints also have IP-based rate limits. The in-memory IP limiter is per-process; production deployments with multiple instances should move distributed rate-limit state to a shared store.

## SMTP setup

Set these in `backend/.env` using the dedicated T-CARE sender account:

- `SMTP_HOST=smtp.gmail.com`
- `SMTP_PORT=465`
- `SMTP_SECURE=true`
- `SMTP_USER=<sender Gmail>`
- `SMTP_PASSWORD=<Google App Password>`
- `SMTP_FROM=<display name and sender address>`

Use a Google App Password, not the normal Google account password. Keep credentials server-side. Run `npm run email:verify` to test the SMTP transport before live OTP tests.

## Admin provisioning

Set:
- `ADMIN_EMAIL`
- `ADMIN_FULL_NAME` (defaults to `T-CARE Administrator` if omitted)
- `ADMIN_INITIAL_PASSWORD` (optional; if omitted, the CLI generates a cryptographically random one-time password and prints it once)

Run `npm run admin:provision`. The script refuses to elevate an existing non-admin account and will not overwrite an existing account/password. Store the generated password securely. A self-service password-change endpoint must be completed and verified before production launch.

## Change password

`POST /api/v1/auth/change-password` (authenticated)

```json
{
  "currentPassword": "the-current-password",
  "newPassword": "a-different-strong-password"
}
```

The new password must be at least 12 characters. Existing refresh sessions are revoked and a fresh session is issued.

## API contracts

### Register

`POST /api/v1/auth/register`

```json
{
  "fullName": "Example Customer",
  "email": "customer@example.com",
  "password": "a-strong-password",
  "phone": "9999999999",
  "accountType": "CUSTOMER"
}
```

For gardener signup, set `accountType` to `GARDENER`. Do not send an `ADMIN` account type.

### Verify email

`POST /api/v1/auth/verify-email`

```json
{
  "email": "customer@example.com",
  "code": "123456"
}
```

### Resend verification

`POST /api/v1/auth/resend-verification`

```json
{
  "email": "customer@example.com"
}
```

The resend route returns a generic message to avoid disclosing whether an email is registered.

## Frontend connection

Set root `.env` from the provided root `.env.example`:

`VITE_API_BASE_URL=http://localhost:4000`

The browser uses `credentials: include` and the server uses HTTP-only cookies. Do not store JWT values in localStorage or expose SMTP/Supabase secrets in Vite variables.

## Remaining owner-side verification

- Configure the dedicated Gmail App Password in backend `.env`.
- Run `npm run email:verify`.
- Apply pending Prisma migrations with `npx prisma migrate deploy` if `npx prisma migrate status` shows the email verification migration pending.
- Perform an actual Customer registration → email receipt → OTP verification → login flow.
- Perform an actual Gardener registration → email receipt → OTP verification → KYC-pending access flow.
- Configure Admin email and provision the initial Admin.
- Test role boundaries using actual accounts.
