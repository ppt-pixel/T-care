# T-CARE — Production Release Runbook

**Release candidate:** Phase 6 source plus production-staging payment-mode correction  
**Target topology in this package:** Netlify frontend + Render API + Supabase PostgreSQL/Storage + Razorpay  
**Default payment state:** disabled  
**Release state:** local source checks partly verified; production/staging gates remain owner-executed

This runbook is specific to this archive. It does not assume that the production database, Render service, Netlify site, DNS or Razorpay merchant settings are already correct.

## 0. Stop conditions

Do not deploy this archive over the current production site until:

- A complete backup of the current code and database is available.
- The archive has been compared against any changes made after the Phase 5 baseline.
- A dedicated staging Supabase database, Render service and frontend preview exist.
- The Node version, clean installs, production build, full backend tests and Prisma validation pass.
- Migrations have been reconciled and rehearsed on staging.
- Guest, Customer, Gardener and Admin flows pass the attached Phase 6 staging matrix.
- Razorpay Test Mode, webhook delivery, cancellation, expiry and refund flows pass on staging.

Keep all payment flags false until each corresponding gate is individually signed off.

## 1. Confirm the deployment target

This archive is configured for **Netlify + Render**:

- Frontend build config: `netlify.toml`
- Frontend API rewrite: `public/_redirects`
- Backend service definition: `render.yaml`
- Backend service URL currently hard-coded in the Netlify rewrite: `https://t-care-api.onrender.com`
- Render health route: `/api/v1/health`

Before deployment, confirm that the Render service actually uses the exact host `t-care-api.onrender.com`. If it uses a different Render hostname, update `public/_redirects` to that exact HTTPS origin and rebuild the frontend.

**Hostinger warning:** `public/_redirects` is Netlify-specific. It will not configure an API proxy on Hostinger. If the existing frontend must remain on Hostinger, set `VITE_API_BASE_URL` at build time to the real HTTPS API origin and set Render `FRONTEND_ORIGIN` to the exact Hostinger site origin. A custom API subdomain such as `api.t-care.in` is preferable to a cross-site `onrender.com` API origin for browser cookie compatibility. Do not deploy the Netlify build unchanged to Hostinger and assume `/api/*` will proxy automatically.

Render deploys Git-based services from a connected Git provider or a manually deployed prebuilt container image; it does not deploy a raw source ZIP as a normal web-service build. Netlify can receive a prebuilt `dist` directory as a manual deploy. If GitHub must remain untouched, use the Netlify manual `dist` upload for the frontend and agree a separate supported backend deployment method before proceeding.

## 2. Required local runtime and clean validation

Use Windows PowerShell from the extracted project directory. Install/use Node **22.22.0**; the archive contains `.node-version` with this exact version and both package manifests require `>=22.22.0 <23`.

```powershell
node --version   # Must print v22.22.0
npm --version    # Node 22.22.0 ships with npm 10.9.4
```

If needed, install the official Node 22.22.0 Windows x64 MSI from:

`https://nodejs.org/dist/v22.22.0/node-v22.22.0-x64.msi`

Close/reopen PowerShell after installation and verify `node --version` again.

### Frontend

```powershell
# From the folder that contains package.json
npm ci --no-audit
npm test
npm run build
```

Pass conditions:

- `npm ci` exits with code 0.
- `npm test` reports every test passing (currently 60 tests).
- `npm run build` exits with code 0 and creates `dist/`.
- No missing asset, import or environment-variable errors appear in build output.

### Backend

```powershell
Set-Location .\backend
npm ci --include=dev --no-audit
npm run prisma:generate
npm test
npm run prisma:validate
```

Pass conditions:

- `npm ci` completes and installs native/runtime dependencies, including `bcrypt`.
- `npm run prisma:generate` exits with code 0.
- `npm test` runs the **entire** suite, including `tests/account-management.test.js`, with zero failed test files.
- `npm run prisma:validate` exits with code 0.

Do not approve release from the 131-test partial backend run alone. The `account-management.test.js` file was excluded in this environment because `bcrypt` was missing; it must run successfully after the clean install.

## 3. Supabase staging and migration verification

Use a separate Supabase staging project/database. Never test pending migrations against the production database first.

1. Create a full database backup/snapshot for the target environment.
2. Configure the backend's `DATABASE_URL` for the Supabase **Shared Pooler Session mode on port 5432**, or a tested direct connection. Do not use the Shared/Transaction Pooler URI on port 6543 with this Prisma configuration.
3. Configure the staging Supabase project URL, server-only secret key and private `tcare-media` Storage bucket.
4. From `backend/`, with the staging-only `DATABASE_URL` loaded:

```powershell
npx prisma migrate status
npx prisma generate
npx prisma validate
```

5. Inspect the `_prisma_migrations` ledger in that exact database. Compare every applied migration with `backend/prisma/migrations/`.
6. Confirm whether these additive Phase 4/5 migrations are pending or already applied:
   - `20261123000500_plant_store_orders`
   - `20261123000600_qr_payment_sessions`
7. Review SQL and rehearsal output on the disposable staging database. Only after an explicit review, apply pending migrations:

```powershell
npx prisma migrate deploy
npx prisma migrate status
```

Never run `prisma migrate reset` against production. Do not blindly run `migrate deploy` until the migration ledger and backup have been checked; it applies all pending migrations in the folder, not only the two listed above.

Verify the `tcare-media` bucket is private. Test authenticated upload, metadata completion, signed download and delete. Do not make KYC or customer media public.

## 4. Render API service

The current `render.yaml` defines:

- Service: `t-care-api`
- Root directory: `backend`
- Build: `npm ci --include=dev && npm run prisma:generate`
- Start: `npm start`
- Health path: `/api/v1/health`
- Current plan: `free`

**Production plan warning:** the Blueprint currently says `plan: free`. Render's current documentation explicitly says not to use Free instances for production; Free web services spin down after 15 minutes of inactivity and can take about a minute to wake. Select an appropriate paid always-on plan in Render before production traffic. Do not assume the `free` Blueprint setting is production-approved.

### Required backend environment variables

Configure these in Render's private Environment settings; do not put them in the frontend or commit them:

| Variable | Production value/source |
|---|---|
| `NODE_ENV` | `production` |
| `PORT` | Let Render provide it; the app listens on `0.0.0.0` |
| `DATABASE_URL` | Supabase PostgreSQL Session Pooler URL, port 5432 |
| `SUPABASE_URL` | Exact Supabase project URL |
| `SUPABASE_SECRET_KEY` | Server-only Supabase secret key; never expose to browser |
| `SUPABASE_STORAGE_BUCKET` | `tcare-media` (private bucket) |
| `FRONTEND_ORIGIN` | Exact frontend origin, scheme + host only, no path or trailing slash |
| `JWT_ACCESS_SECRET` | Unique random secret, at least 32 characters |
| `JWT_REFRESH_SECRET` | A different unique random secret, at least 32 characters |
| `BREVO_API_KEY` | Verified Brevo API key if using Brevo email delivery |
| `EMAIL_FROM_EMAIL` | Verified sender address/domain in Brevo |
| `EMAIL_FROM_NAME` | `T-CARE` |
| `PAYMENT_PROVIDER` | `razorpay` |
| `PAYMENT_WEBHOOK_TOLERANCE_SECONDS` | `300` |
| `BOOKING_CONVENIENCE_FEE` | Only the amount approved by the business owner; otherwise `0` |

The code supports SMTP variables, but Render Free blocks outbound SMTP ports 25, 465 and 587. Use the configured Brevo HTTP API path rather than assuming Gmail SMTP will work from a Free service. The Free plan is not recommended for production in any case.

`ADMIN_EMAIL`, `ADMIN_FULL_NAME`, `ADMIN_INITIAL_PASSWORD` and `ADMIN_RESET_PASSWORD` are one-time provisioning inputs. Do not leave initial/reset passwords in permanent service environment settings. Use the documented Admin CLI workflow from a trusted machine against the intended database, then remove temporary variables.

### Payment environment variables

The release candidate separates provider mode from the Node runtime mode:

- Isolated staging: `NODE_ENV=production`, `RAZORPAY_MODE=test`, `rzp_test_...` credentials. This preserves production cookie, HTTPS, HSTS and trusted-origin behaviour while using the Razorpay Test account.
- Actual production: `NODE_ENV=production`, `RAZORPAY_MODE=live`, `rzp_live_...` credentials.
- Live Razorpay mode is rejected outside `NODE_ENV=production`.

Use a dedicated `RAZORPAY_WEBHOOK_SECRET`; it is not the API key secret. Keep all of these disabled initially:

```env
PAYMENTS_ENABLED=false
RAZORPAY_SUBSCRIPTIONS_ENABLED=false
STORE_CHECKOUT_ENABLED=false
RAZORPAY_QR_ENABLED=false
```

The Render Blueprint uses owner-managed `sync: false` entries for pre-existing payment settings. Preserve the live values already configured on the existing service; do not let a Blueprint sync overwrite them. The new Store flag remains false by default.

## 5. Razorpay staging configuration

Use a separate Razorpay Test Mode account/key set and a public HTTPS staging webhook endpoint:

`https://<staging-api-host>/api/v1/payments/webhook`

Configure the webhook secret to exactly match staging `RAZORPAY_WEBHOOK_SECRET`. Required events in the project documentation include:

- One-time payments/refunds: `payment.authorized`, `payment.captured`, `payment.failed`, `order.paid`, `refund.created`, `refund.processed`, `refund.failed`.
- UPI AutoPay: `subscription.authenticated`, `subscription.activated`, `subscription.charged`, `subscription.completed`, `subscription.updated`, `subscription.pending`, `subscription.halted`, `subscription.cancelled`, `subscription.paused`, `subscription.resumed`.
- QR settlement: `qr_code.credited`.

Check the exact currently available event names in the merchant Razorpay Dashboard. Verify signatures, amount/currency match, idempotent replay, delayed webhook, failed/dismissed payment, cancellation, expiry, late capture and confirmed refund. A frontend success callback is not proof of payment; the backend must independently reconcile with Razorpay.

Do not use production customer records or the production database for Test Mode runs.

## 6. Netlify frontend deployment

The archive has the intended production build config:

- Base directory: repository root (the folder containing `package.json`)
- Build command: `npm ci && npm run build`
- Publish directory: `dist`
- Node version: `22.22.0` via `netlify.toml` and `.node-version`

Set `FRONTEND_ORIGIN` on the matching Render environment to the exact Netlify production or preview origin. For Netlify production, leave `VITE_API_BASE_URL` **unset** so `public/_redirects` sends `/api/*` to the backend. Do not enter Supabase or Razorpay secrets in Netlify variables.

Optional build-time public variables only:

- `VITE_WHATSAPP_NUMBER`
- `VITE_PUBLIC_PHONE_NUMBER`
- `VITE_PUBLIC_LOCATION`
- `VITE_INSTAGRAM_URL`
- `VITE_YOUTUBE_URL`
- `VITE_FACEBOOK_URL`
- `VITE_LINKEDIN_URL`

Populate these only with business-approved public information. Leave them unset when unverified.

### Git-connected deployment

Connect the repository containing this final release candidate to Netlify, confirm the build settings above and deploy the production branch only after staging passes. Netlify's production deploy replaces the current primary-domain version; confirm the previous deployment is available for rollback.

### ZIP-only/manual deployment

If not using Git for the frontend:

1. Build locally after the exact Node/dependency checks pass.
2. Verify `dist/index.html` and `dist/_redirects` exist.
3. Open the existing Netlify site's Deploys page while signed in to the correct team.
4. Drag the **`dist` folder**, not the source ZIP and not the project root, into the production manual-deploy area.
5. Wait for a successful deploy status, then run the production checks below.

Manual upload publishes the prebuilt output; it does not run the build command for you.

## 7. First Admin and business data

1. Provision the first Admin with the documented `npm run admin:provision` CLI flow using a strong one-time password. Never commit it or leave it in permanent environment variables.
2. Log in as Admin and verify that the Account, Customer, Gardener, Booking, Service, Store, Plan, CMS and Finance screens load.
3. Create/verify service catalogue and approved plans before accepting bookings.
4. Create/verify Gardener accounts and complete the KYC review workflow before assigning real work.
5. Populate the Plant Store with real product names, images, SKUs, approved prices, stock, care instructions and safety notes.
6. Configure Store shipping and tax values only after the owner/accountant approves the actual business treatment. The current implementation calculates tax on product subtotal; confirm whether that matches the business's legal tax treatment before enabling checkout.
7. Verify policy/legal pages, customer-care email, public phone, WhatsApp and public location. Do not publish placeholders or personal contact details.

## 8. Production deploy order

Only after staging is green and the owner authorizes the release:

1. Freeze changes and create a final source backup/archive and database backup.
2. Record the release ZIP hash and exact source version used for the staging tests.
3. Re-run the full root and backend install/test/build/Prisma suite on Node 22.22.0.
4. Reconcile production `_prisma_migrations` and rehearse all pending SQL on staging.
5. Apply reviewed pending migrations to production using `npx prisma migrate deploy` from a controlled release environment.
6. Deploy/update the Render API service. Wait for deploy success and check its logs for startup/configuration errors.
7. Deploy the Netlify `dist` output or deploy through the connected Git workflow.
8. Confirm Render `FRONTEND_ORIGIN` exactly matches the public frontend origin.
9. Check the backend and frontend health routes before changing any payment setting.
10. Run the post-deploy smoke tests below. Keep payment flags false during this initial availability check.
11. Enable each payment feature only after its own signed-off provider and business gate passes.

## 9. Post-deployment smoke tests

Run from PowerShell, replacing the frontend host only after it is confirmed:

```powershell
Invoke-RestMethod https://t-care-api.onrender.com/api/v1/health
Invoke-RestMethod https://<production-frontend-host>/api/v1/health
```

Expected health JSON from both URLs:

```json
{
  "service": "t-care-backend",
  "status": "ok",
  "database": "ok",
  "environment": "production"
}
```

The frontend-origin request must reach the API through the configured proxy. An HTML response, Netlify 404 or `status: degraded` is a failure.

Then verify:

- Public pages, refresh/direct navigation and mobile layouts.
- Registration, email OTP, login, session restore, logout and password recovery.
- Customer ownership boundaries for plants, addresses, bookings, payments and orders.
- Gardener assignment boundaries, KYC privacy, job reports and private media uploads.
- Admin role protection, service/plan configuration, user/KYC management and fulfilment controls.
- Product catalogue and cart with checkout still disabled until Store gates pass.
- Browser console, Render logs, Netlify deploy logs and Supabase migration status contain no errors or secrets.

Run the full `T-CARE-PHASE-6-STAGING-SMOKE-TESTS-2026-11-23.md` matrix on staging first; repeat the critical subset against production after deployment.

## 10. Payment go-live, one gate at a time

Do not set all payment flags to true together.

1. **One-time booking checkout:** set `RAZORPAY_MODE=live`, configure matching `rzp_live_` key ID/secret and live webhook secret, configure the live webhook, then enable `PAYMENTS_ENABLED=true` after the business owner approves live charges.
2. **UPI AutoPay:** only after Test Mode mandate/renewal/stop/expiry/webhook lifecycle passes and merchant Subscriptions access is confirmed, enable `RAZORPAY_SUBSCRIPTIONS_ENABLED=true`.
3. **Plant Store checkout:** only after the Store migrations, server-priced order tests, inventory protection, fulfilment and full refund flow pass, enable `STORE_CHECKOUT_ENABLED=true`.
4. **UPI QR:** only after merchant QR API access and the full Test Mode QR credited/expiry/cancel/late-credit/webhook tests pass, enable `RAZORPAY_QR_ENABLED=true`. QR also depends on the payment gate; Store QR depends on Store checkout being enabled.

For each flag change, deploy separately, perform one low-value approved verification transaction, confirm the backend ledger and webhook delivery, and monitor logs. Do not conduct real live charges or refunds without explicit business-owner approval.

## 11. Rollback

- If frontend deployment fails, restore the previous successful Netlify production deploy.
- If API deployment fails, use Render's previous successful deploy/rollback controls.
- If a health check reports a database problem after migration, stop release actions and investigate migration/connection logs; do not reset the database.
- If payment reconciliation is uncertain, disable the relevant payment feature flag and reconcile outstanding provider payments before accepting more orders. Do not manually mark payment or refund states as successful.
- Preserve the current release ZIP, previous source, database backup and deploy IDs until post-release review completes.

## 12. Current validation evidence for this release candidate

Fresh checks completed in the current working session after the payment-mode correction:

| Check | Result |
|---|---:|
| Frontend Node tests | 60/60 passed |
| Backend runnable tests excluding `account-management.test.js` | 131/131 passed |
| Payment-policy/integration contracts | included in backend pass |
| Backend JavaScript syntax | 81 files passed `node --check` |
| `render.yaml` syntax | YAML parser passed |
| ZIP integrity | Must pass final archive check after packaging |

Still **not passed** in this environment:

- Node 22.22.0 clean install (network download/install timed out; current tool runtime is Node 22.16.0).
- Frontend production build (Vite dependency unavailable after install timeout).
- Full backend suite including `account-management.test.js` (`bcrypt` dependency unavailable).
- Prisma Client generation/schema validation against a real staging URL.
- Supabase migration rehearsal, browser/device E2E, Razorpay Test Mode provider calls/webhook delivery/refunds, and live domain/DNS verification.

Do not describe these outstanding items as passed.
