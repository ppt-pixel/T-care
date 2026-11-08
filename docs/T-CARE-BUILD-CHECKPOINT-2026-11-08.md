# T-CARE Build Checkpoint — 8 November 2026

## Source baseline
- Working source is based on the user-uploaded `T-care(3).zip`.
- Existing frontend visual design and feature content were retained.
- Existing backend business modules and payment code were not rewritten.
- Payment processing, payment webhooks, refunds, payouts, and payment-dependent billing remain out of scope for this pass.

## Implemented in this build
### Backend authentication
- Public registration requires `accountType` and accepts only `CUSTOMER` or `GARDENER`.
- Customer registration creates a `CustomerProfile`.
- Gardener registration creates a `GardenerProfile` with `kycStatus: NOT_STARTED`.
- New accounts are `PENDING` and do not receive authenticated cookies before verification.
- Six-digit email OTP generation uses `crypto.randomInt`.
- OTP values are persisted only as domain-separated HMAC-SHA256 hashes using the server-side `JWT_REFRESH_SECRET`.
- OTP expiration, five-attempt lockout, and per-account resend cooldown are implemented.
- OTP verification consumes the code, sets `emailVerifiedAt`, activates the account, writes an audit log, and issues HTTP-only cookies.
- Login, refresh, `/auth/me`, and authenticated middleware reject unverified accounts.
- Blocked/inactive accounts cannot be reactivated by email verification.
- Password change API validates the current password, hashes the new password, revokes refresh sessions, and issues a fresh session.
- Auth routes have additional per-IP registration, verification and resend rate limits.

### Email / Admin configuration
- Nodemailer was already in the latest ZIP's dependencies and lockfile; no dependency upgrade was needed.
- Gmail SMTP transport and OTP email template added.
- `npm run email:verify` added for owner-side SMTP verification.
- Admin provisioning is separated into `npm run admin:provision`.
- Admin is never a public registration option. The provisioner reads private `ADMIN_EMAIL`, uses `T-CARE Administrator` as the default name, and generates a one-time random initial password when `ADMIN_INITIAL_PASSWORD` is left blank.
- Admin provisioning refuses to elevate an existing Customer or Gardener account.
- `npm run auth:revoke-sessions` added to revoke all active refresh sessions because a local cookie jar was present in the uploaded archive and should be treated as exposed.

### Frontend authentication integration
- Registration UI now presents exactly two choices: Customer and Gardener.
- Admin is removed from public registration.
- Login now uses backend email/password authentication; destination is selected from the role returned by the backend.
- Registration enters an OTP verification screen and supports resend cooldown.
- Browser requests use `credentials: include`; JWTs are not stored in localStorage.
- Session restoration calls `/auth/me` and attempts refresh when needed.
- Customer, Gardener and Admin workspace routes are protected by the authenticated backend role.
- Workspace role-switching links have been removed; the shell displays the current authenticated workspace.

### Configuration and documentation
- `backend/.env.example` now includes SMTP, OTP policy and Admin provisioning fields.
- Root `.env.example` includes `VITE_API_BASE_URL`.
- Backend README and authentication implementation guide updated.
- Local cookie-jar patterns added to `.gitignore`.
- The uploaded `backend/storage-cookies.txt` was removed from the distributable package.

## Static checks completed
- `node --check` passed for every backend source and script JavaScript file.
- TypeScript transpile parser reported zero JSX/TSX parse errors for the frontend source files checked.
- Root and backend `package.json` / `package-lock.json` parse as valid JSON.
- Prisma schema was not modified in this pass; its `EmailOtp` model and migration are retained from the uploaded ZIP.

## Owner-side configuration still required
- Set `SMTP_USER`, `SMTP_PASSWORD` (Google App Password), and optional `SMTP_FROM` in `backend/.env`.
- Set `VITE_API_BASE_URL` in root `.env` for the intended frontend origin/deployment.
- Supply `ADMIN_EMAIL` later; optionally override default Admin name/password.
- Customer/Gardener email addresses are supplied during registration; the selected account type is enforced by the backend.
- Check `npx prisma migrate status`; apply pending migrations with `npx prisma migrate deploy` if the email-verification migration is pending.
- Run `npm ci`, `npx prisma generate`, `npm run email:verify`, then verify actual OTP email receipt/verification.

## Not yet verified / remaining work
- Real Gmail SMTP connectivity and live OTP delivery/verification (requires owner's App Password).
- Admin account provisioning against the owner's intended email.
- Actual image binary upload, completion, download and deletion in Supabase Storage (signed upload-intent creation previously returned 201).
- Full runtime Admin/Gardener RBAC tests.
- Services/pricing population and complete runtime CRUD.
- Booking, Gardener assignment, service execution, reports, notifications, reviews, issues, CMS and analytics end-to-end tests.
- Frontend integration beyond authentication/session/role gating.
- Full production browser/device QA, dependency audit rerun in owner's environment, and clean final production verification.

## Important security notes
- Never put `.env`, Gmail App Password, Supabase secret API key, database URI, JWT secrets, cookies, or signed URLs in the ZIP or conversation.
- Rotate/revoke credentials and sessions that appeared in earlier shared material.
- A generated Admin password is printed once during local provisioning if no explicit initial password is configured; store it securely.
- The SMTP account is only the sending identity. Customer, Gardener and Admin emails are separate recipient/login identities.
