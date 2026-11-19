# T-CARE Admin and Gardener Login Diagnosis and Fix

## Summary

The login API is shared by all account roles. It does not reject ADMIN or GARDENER by role. Login requires a unique matching account, a matching bcrypt password, a verified email address and `status = ACTIVE`. The authenticated user's role is returned by the backend and used by the frontend to route to the correct workspace.

## Source findings and corrections

1. **Role-neutral login:** `POST /api/v1/auth/login` accepts Customer, Gardener and Admin accounts through the same handler. It does not use a frontend role selector.
2. **Legacy email casing:** the login lookup now matches a single email case-insensitively. If two records differ only by case, authentication fails closed rather than selecting an arbitrary account. New registrations and Admin-created accounts are normalized to lowercase.
3. **Admin provisioning:** the first Admin is created only by `npm run admin:provision`. Deploying the backend does not automatically create an Admin. The provisioner refuses to promote an existing Customer or Gardener account.
4. **Admin-created Gardeners:** the Admin account-creation flow creates a `GARDENER` user as `ACTIVE`, email-verified and with a `GardenerProfile` at `NOT_STARTED` KYC.
5. **Gardener KYC gate corrected:** previously `/gardener/dashboard` was blocked until KYC was verified. The route guard now restricts `/gardener/jobs` and `/gardener/history`, while allowing the dashboard and KYC submission pages. Service execution remains protected by the KYC middleware. An unverified Gardener can sign in and complete onboarding but cannot receive/execute work until approved.
6. **Legacy missing profile repair:** a guarded CLI command can create a missing Gardener profile for an existing GARDENER user. It does not create a User or alter the account's role, status, email verification, password, assignments, bookings, payouts or history.
7. **Credential repair:** a role-checked CLI reset command can repair the password and, only with explicit confirmation, correct legacy unverified/PENDING/INACTIVE Admin or Gardener account state. BLOCKED accounts are never reactivated by this command. Existing records and business history are preserved.
8. **Password hashes:** bcrypt hashes are one-way and cannot be reversed. A stored `$2b$...` hash is not the password to type at login. Reset the password if the original plaintext password is unavailable.

## Run a safe production account diagnostic first

Run this from the Render backend service's Shell/command environment, where the service environment variables point to the intended production Supabase database. The Render service root directory is `backend`.

```bash
npm run auth:diagnose -- admin@example.com gardener@example.com
```

Replace both email addresses with the exact account emails. The diagnostic selects only non-secret account fields. It never selects or prints `passwordHash`, cookies or session tokens. Redact email addresses and account IDs before sharing output.

### Interpret the result

| Diagnostic | Meaning | Safe next action |
|---|---|---|
| `ACCOUNT_NOT_FOUND_IN_THIS_DATABASE` | No matching account in the database used by this Render service | Confirm the Render `DATABASE_URL` points to the intended Supabase project. If the Admin truly does not exist, use the explicit Admin provisioner. Do not create a second Gardener blindly. |
| `AMBIGUOUS_CASE_INSENSITIVE_EMAIL_MATCHES` | More than one account differs only by email casing | Stop. Review and reconcile the records before resetting either account. Login intentionally fails closed. |
| `EMAIL_STORED_WITH_DIFFERENT_CASE` | One legacy account exists with mixed-case stored email | Login now supports a unique case-insensitive match; normalize the stored email during a reviewed maintenance window. |
| `ACCOUNT_STATUS_PENDING` / `ACCOUNT_STATUS_INACTIVE` | Account is not ACTIVE | Confirm the account owner's identity and Admin approval before using the guarded repair command. |
| `ACCOUNT_STATUS_BLOCKED` | Account is explicitly blocked | Do not bypass the block. Resolve the security/administrative decision separately. |
| `EMAIL_NOT_VERIFIED` | Account email is not verified | Verify ownership first. Only then may an operator explicitly confirm verification during a credential repair. |
| `GARDENER_PROFILE_MISSING` | GARDENER user exists but required GardenerProfile row is missing | Run the guarded profile repair below. |
| `KYC_NOT_VERIFIED` note | Gardener has not completed KYC | This is not a login blocker after the route fix. Submit KYC; jobs/history remain restricted until Admin approval. |
| Role is `CUSTOMER` | Email belongs to a Customer, not an Admin/Gardener | Do not promote through login or password reset. Use the correct existing account or create a separate role-appropriate account. |

## If the Admin account does not exist

Only after confirming `ACCOUNT_NOT_FOUND_IN_THIS_DATABASE` and confirming that the Render database is the intended production database:

1. Set `ADMIN_EMAIL`, `ADMIN_FULL_NAME` and, optionally, `ADMIN_INITIAL_PASSWORD` privately in the Render backend environment for the one-time operation.
2. Run from `backend/`:

```bash
npm run admin:provision
```

3. If `ADMIN_INITIAL_PASSWORD` is omitted, the script generates a one-time password and prints it once to the command output. Store it securely and provide it to the authorized Admin through a trusted channel.
4. Remove `ADMIN_INITIAL_PASSWORD` and other temporary provisioning values immediately after the command.

If the email already belongs to a non-Admin account, provisioning refuses to change its role. Use a dedicated Admin email. Do not edit the role directly in SQL.

## If an existing Admin or Gardener needs a password/state repair

Only after verifying the person and account role, set these temporary values privately in the backend command environment:

```env
ACCOUNT_RESET_EMAIL=exact-account@example.com
ACCOUNT_RESET_ROLE=ADMIN
ACCOUNT_RESET_PASSWORD=New-unique-password-at-least-12-chars
ACCOUNT_RESET_CONFIRM_EMAIL_VERIFIED=false
ACCOUNT_RESET_CONFIRM_ACTIVATION=false
```

For a Gardener, set `ACCOUNT_RESET_ROLE=GARDENER`. Set `ACCOUNT_RESET_CONFIRM_EMAIL_VERIFIED=true` only after verifying ownership of that email. Set `ACCOUNT_RESET_CONFIRM_ACTIVATION=true` only when an authorized Admin approves an account that is PENDING or INACTIVE. BLOCKED accounts are rejected regardless of the flags.

Run:

```bash
npm run auth:reset-role-account
```

The command checks the exact role, hashes the password, increments `authVersion`, revokes refresh sessions, consumes outstanding reset tokens and records an audit event. It does not print the password. Remove all temporary reset variables immediately after completion. Share the new password only through a trusted channel.

## If a Gardener profile is missing

After confirming that the account is genuinely a GARDENER and the profile is absent, set:

```env
GARDENER_PROFILE_REPAIR_EMAIL=exact-gardener@example.com
GARDENER_PROFILE_REPAIR_CONFIRM=true
```

Run:

```bash
npm run auth:repair-gardener-profile
```

The operation is idempotent. It creates only the missing `GardenerProfile` at `NOT_STARTED`; it does not activate or verify the user, change credentials, change the role, or modify business history. Remove the temporary variables immediately afterward.

## Error-code map

| Response | Meaning | Action |
|---|---|---|
| `INVALID_CREDENTIALS` (401) | Email not found uniquely in this database or plaintext password does not match its bcrypt hash | Confirm account email/role and use a role-checked password reset if needed. Never enter the bcrypt hash as the password. |
| `EMAIL_NOT_VERIFIED` (403) | Email verification timestamp is missing | Verify email ownership and use the appropriate verification/repair process. |
| `ACCOUNT_UNAVAILABLE` (403) | Account is not ACTIVE | Check account status; do not override a BLOCKED account. |
| `UNTRUSTED_ORIGIN` (403) | Browser Origin is not exactly the configured `FRONTEND_ORIGIN` | Set the Render value to the exact website origin, e.g. `https://t-care.in`, without a path or trailing slash. If users access `www`, ensure that origin is deliberately handled too. |
| `FORBIDDEN` (403) from `/api/v1/admin/*` | Authenticated user is not ADMIN | Check the database role. Frontend routing cannot grant an Admin role. |
| `GARDENER_KYC_REQUIRED` (403) on jobs/history | Gardener has not been verified | Submit KYC and wait for Admin approval. This is not a sign-in failure. |
| `GARDENER_PROFILE_NOT_FOUND` (404) | Required profile record is missing | Run the guarded profile repair command above after confirming the role. |
| `P2021` / `P2022` or 500 | Database table/column mismatch or another backend failure | Check Render logs and run `npx prisma migrate status`. Back up the production database before applying any approved pending migration. Never run `prisma migrate reset` in production. |

## What source-level verification establishes

- The frontend login form submits email and plaintext password to the same auth endpoint for every role.
- The backend role comes from the database; the browser cannot choose its role.
- `ADMIN` routes require `requireRole('ADMIN')`.
- `GARDENER` routes require `requireRole('GARDENER')`.
- Gardener dashboard and KYC onboarding are available before verification; jobs/history and service execution require verified KYC.
- Admin provisioning is explicit, audited and refuses role escalation.
- Admin-created Gardeners are active, email-verified and receive a profile.

Production database contents, Render environment values, cookie acceptance in the user's browser and the actual plaintext password cannot be verified from a ZIP. The production diagnostic command is required to determine the precise state of the two accounts.
