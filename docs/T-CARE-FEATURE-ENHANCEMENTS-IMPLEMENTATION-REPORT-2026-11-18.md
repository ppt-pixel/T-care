# T-CARE Feature Enhancements — Implementation & Release Report

**Source archive:** `T-CARE-Feature-Enhancements-Final-2026-11-18.zip`  
**Report date:** 18 November 2026  
**Scope:** Admin/Gardener navigation, registration consent, account security and recovery, payment receipts and Admin ledger, WhatsApp support, footer contact information, and preservation of existing workflows.

## 1. Executive summary

The requested feature set has been implemented in the project source and covered by automated/static regression checks. Existing Customer, Gardener, Admin, public-site, booking, catalogue, subscription, payment and notification workflows were preserved where possible. The work reuses the existing account, payment, email, notification and Admin finance systems rather than introducing a parallel implementation.

This package is a **source-complete implementation candidate**, not a claim that the live production release has already been deployed or verified. Automated tests, the production build and Prisma schema validation were run, but the available Node runtime was outside the declared engine range. Database migration application, live payment-provider confirmation and authenticated browser end-to-end testing remain release gates.

## 2. Requirement implementation status

| Requirement | Implementation status | Notes |
|---|---|---|
| Admin and Gardener sidebar | Implemented | Responsive expandable/collapsible workspace sidebar, animated width transition, icons, labels, active route and mobile drawer. Customer navigation is retained. |
| Registration consent | Implemented | Separate mandatory Terms and Privacy controls; frontend blocks submission and API requires both literal `true`; accepted timestamps and policy versions are persisted and included in the audit trail. |
| Password privacy | Audited and preserved | Passwords remain one-way bcrypt hashes server-side; authentication uses HttpOnly cookies; public user projections omit password hashes; no T-CARE password/token persistence in browser localStorage was found. |
| Forgot password | Implemented | Generic public response, active verified account eligibility, HMAC-protected one-time reset OTP, expiry, attempt limit, resend/IP rate limiting, bcrypt password update, refresh-session revocation, per-user authentication-version increment (immediate invalidation of old access JWTs), and audit event. |
| Payment receipts | Implemented for provider-confirmed payments | Receipt snapshot and email are created only for provider-confirmed terminal payment states. Failed delivery is recorded for retry; Admin can resend. Emails preserve the original amount and show the current payment state. |
| Admin payment ledger | Extended | Search and pagination cover the recorded payment history, with customer/purpose/reference/status and receipt delivery details. |
| WhatsApp support | Restored as a contact launcher | Floating `wa.me` link is available in public and authenticated workspaces when the real business number is configured. It is not an automated chatbot. |
| Footer | Implemented/configurable | Main office address, service location, telephone link, email link, and verified HTTPS social links are displayed from public environment settings. No contact details are fabricated. |
| Existing workflows | Regression-covered | Existing feature routes and role protections were retained; automated tests pass as detailed below. Live E2E is still required. |

## 3. Important security clarification: saved passwords across devices

The backend stores password hashes using bcrypt and does not return password hashes through public user projections. Authentication/session credentials are held in HttpOnly cookies rather than readable browser localStorage. The frontend uses browser password-manager-compatible form attributes (`autocomplete`) but does not itself synchronize saved passwords between devices.

If a saved login appears on another device, the likely source is browser or operating-system password-manager synchronization (for example, a browser profile signed into the same account). That synchronization is controlled by the user's browser/device account and is not the same as T-CARE exposing a stored plaintext password. Users should review their browser Password Manager sync settings and saved-password access on shared devices.

## 4. Payments, receipts and current payment boundary

The existing online payment integration uses Razorpay. Receipt creation is triggered after the backend has verified the provider payment/signature or accepted a verified webhook event; a client-side success message alone is not sufficient. Receipt creation is idempotent per payment record. Delivery status, attempts and the last delivery error are recorded. Admin can search/paginate the payment ledger and request a receipt resend for an eligible confirmed transaction.

**Payment feature gate remains fail-closed.** `PAYMENTS_ENABLED` defaults to `false`. This release does not turn on real payments automatically. The current checkout supports the configured Razorpay online-payment path; `CASH` and `OTHER` enum values do not by themselves constitute an implemented cash/manual collection workflow. Do not represent an offline payment as confirmed unless an approved, auditable business process records it.

## 5. WhatsApp and business contact information

The WhatsApp launcher is a direct business chat entry point using `https://wa.me/`. It is not a conversational bot or automated customer-support system. It appears only when a valid international phone number is supplied.

The following public values must be supplied by T-CARE before the corresponding footer/contact elements can be displayed:

- Main office address
- Service location, if different
- Business telephone number
- Public contact email address
- WhatsApp business number in international digits (country code included, no `+`, spaces or punctuation)
- Official Instagram, YouTube, Facebook and LinkedIn profile URLs (as applicable)

Only HTTPS social profile URLs are rendered. Missing values remain absent rather than being replaced by sample contact information.

## 6. Legal content and consent

The Terms & Conditions and Privacy Policy pages are included and linked from registration/footer. Each registration consent is stored with the policy version and timestamp. The current policy version is `2026-11-18-v1`.

The included policy wording is a product draft and must be reviewed and approved by the business owner/legal adviser before it is treated as final legal advice or published as the definitive contractual policy. Update the matching policy version constants in the frontend and backend when approved text changes.

## 7. Environment configuration required

### Frontend (`.env.example`)

Set these public values in the frontend deployment environment as applicable:

- `VITE_WHATSAPP_NUMBER`
- `VITE_PUBLIC_CONTACT_EMAIL`
- `VITE_PUBLIC_PHONE_NUMBER`
- `VITE_PUBLIC_LOCATION`
- `VITE_PUBLIC_OFFICE_ADDRESS`
- `VITE_INSTAGRAM_URL`
- `VITE_YOUTUBE_URL`
- `VITE_FACEBOOK_URL`
- `VITE_LINKEDIN_URL`

These values are public and will be visible in the browser bundle. Do not put API keys or private credentials in `VITE_` variables.

### Backend (`backend/.env.example`)

Configure the existing database, Supabase, JWT and email settings. For production email, configure either the Brevo HTTP API (`BREVO_API_KEY`, `EMAIL_FROM_EMAIL`, `EMAIL_FROM_NAME`) or valid SMTP credentials. The sender must be verified with the selected email provider.

For Razorpay, configure `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` and `RAZORPAY_WEBHOOK_SECRET` on the server only. Keep `PAYMENTS_ENABLED=false` until test-mode checkout, signature verification, webhook verification, refunds and the business's production approval have been completed. Never expose payment secrets in frontend variables.

## 8. Database migration and deployment sequence

A new Prisma migration is included:

`backend/prisma/migrations/20261118000100_add_registration_consent_password_reset_receipts/`

It adds the per-user authentication version, registration consent fields, the password-reset token table, receipt delivery enum and payment receipt table. Before applying it to the existing production database:

1. Take and verify a database backup.
2. Confirm the deployed source revision and inspect migration status against the production database.
3. Use the project's required Node.js runtime (`22.22.x`, as specified in `.node-version` and package engine constraints).
4. Install backend dependencies with `npm ci --include=dev` in `backend/`.
5. Run `npm run prisma:generate` and `npm run prisma:validate`.
6. Apply approved pending migrations using `npx prisma migrate deploy` from `backend/`.
7. Deploy backend and frontend from the same approved revision, then execute the live acceptance tests.

Do not use `prisma migrate reset` against production. Do not auto-apply the migration without a backup and status review. The Render build should generate Prisma Client; migration application remains a separately controlled deployment step.

## 9. Verification performed in this environment

| Check | Result |
|---|---:|
| Frontend automated tests | 11 passed, 0 failed |
| Backend automated tests | 83 passed, 0 failed |
| Vite production build | Passed; emitted a >500 kB chunk-size warning |
| Prisma schema validation | Passed with a nonconnecting placeholder `DATABASE_URL` |
| `git diff --check` | Passed |
| Browser smoke check | Contact page and registration consent controls; authenticated workspace E2E not performed |
| Dependency audit | 5 high findings in the Vite/picomatch build-tool dependency chain |

### Verification not completed here

- Supported-runtime validation: the available Node runtime was `25.3.0`, while the project requires `>=22.22.0 <23`; rerun tests and the build under Node `22.22.x` before release.
- Dependency audit remediation: `npm audit` recommends a major Vite downgrade for the five high findings. No dependency downgrade or override was applied because compatibility needs a separate review.
- Prisma Client generation and schema validation: passed with Prisma 6.19.3 and a nonconnecting placeholder `DATABASE_URL`; no database connection or migration was performed.
- Live database migration: not applied; no production database connection or approval was available.
- Live payment test: not performed; Razorpay production/test credentials and webhook endpoint configuration were not available.
- Live email receipts/password reset: code path is implemented, but this run did not send real emails because provider credentials are deployment-specific.
- Authenticated browser E2E across Customer, Gardener and Admin: not performed in this environment.

## 10. Final release acceptance checklist

- [ ] Set Node.js to `22.22.x` and complete frontend `npm ci && npm run build`.
- [ ] Complete backend `npm ci --include=dev`, Prisma generation and Prisma validation.
- [ ] Back up the production database and apply the new migration through the approved deployment process.
- [ ] Configure and verify Brevo/SMTP sender; test registration OTP, password reset OTP and payment receipt delivery.
- [ ] Add actual T-CARE office, phone, email, WhatsApp and social details.
- [ ] Obtain business/legal approval for Terms & Conditions and Privacy Policy.
- [ ] Test Razorpay in test mode, including webhook/signature checks, duplicate events, refunds and receipt retry; only then consider enabling the payment gate.
- [ ] Test Admin, Gardener and Customer navigation, access controls and existing workflows in a live browser.
- [ ] Verify the notification preview does not create duplicate polling requests when switching pages.
- [ ] Confirm logs, error handling and payment/receipt status in production.

**Release decision:** The code and automated checks in this archive are prepared for the controlled deployment-validation stage. Do not call the live service fully production-approved until the outstanding release gates above pass.
