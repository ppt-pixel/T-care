# T-CARE Phase 2 — Subscription Plan Structure

**Source baseline:** `tcare(3).zip` plus Phase 1 working changes.  
**Implementation date:** 23 November 2026  
**Deployment:** Local source changes only. No GitHub push, Netlify/Render deployment, Razorpay API call, or production database mutation was performed.

## Confirmed business rule

Recurring plans use Razorpay Subscriptions with UPI AutoPay. A customer may cancel the mandate from their UPI payment app. This stops future renewals; benefits already paid for remain available until the end of the paid-through period.

One-Time Service plans do not renew.

## Implemented

### 1. Structured plan catalogue

Added `SubscriptionPlanType`:

- `ONE_TIME_SERVICE`
- `WEEKLY`
- `ONE_MONTH`
- `ONE_YEAR`
- `LEGACY_RECURRING`

New structured plans map to stable billing-cycle values (`one-time`, `weekly`, `monthly`, `yearly`). Existing free-text billing-cycle records are preserved as `LEGACY_RECURRING`; a text value alone is not proof that a customer approved an AutoPay mandate.

### 2. Included services and customer-facing terms

Added `SubscriptionPlanService` to associate plans with specific active services. Plan records now include:

- Service frequency (admin-authored display value)
- Plant limit
- Included services
- Benefits
- Limitations
- Price and billing cycle
- Renewal mode and cancellation policy
- Razorpay Plan ID reference for the later provider integration

The public Plans page and Customer subscription page consume the same API catalogue, so plan names, pricing and details do not diverge between the two screens.

### 3. Admin plan management

Admin can create and edit structured One-Time, Weekly, One-Month and One-Year plans, select included active services, and configure service frequency, plant limits, price, benefits, limitations and visibility.

Commercial terms become immutable after a subscription or Razorpay Plan is associated with a plan. Admin can still edit non-commercial presentation fields or deactivate it. Services linked to plans are deactivated rather than deleted.

Existing legacy plans with no included-service configuration remain editable without being silently converted or deleted.

### 4. Payment safety boundary

- One-Time Service plans are routed through the booking flow, not the recurring subscription endpoint.
- New Weekly, One-Month and One-Year plans cannot use the legacy one-time Razorpay Orders flow. Their checkout remains explicitly blocked until Razorpay Subscriptions + UPI AutoPay are integrated in Phase 3.
- Existing `LEGACY_RECURRING` pending subscription requests and their existing manual payment flow are preserved.
- UPI AutoPay subscriptions are not manually activated, paused or cancelled by Admin; their lifecycle must be driven by verified Razorpay subscription events.
- Customer UI explains that mandate cancellation occurs in the UPI payment app and paid benefits continue to the paid-through date.

### 5. Data migration

Added additive migration:

`20261123000200_subscription_plan_catalogue`

It adds the plan type enum and fields, the included-service join table, and subscription fields for `cancelAtPeriodEnd` and `providerSubscriptionId`.

Existing plans remain `LEGACY_RECURRING`. No data was deleted or inferred as AutoPay-authorised. The migration has **not** been applied to production or any external database.

## Validation

- Frontend tests: **29/29 passed**.
- Backend tests excluding `account-management.test.js`: **111/111 passed**.
- The excluded test file cannot load because `bcrypt` is absent from the current local `backend/node_modules`; `bcrypt@6.0.0` remains declared in `backend/package.json` and the lockfile. Dependency installation timed out in this environment.
- Backend JavaScript syntax checks: passed across `backend/src`, `backend/tests` and `backend/scripts`.
- Frontend JS/JSX transpile parse: **15 files, zero diagnostics**.
- CSS brace/delimiter checks: passed for `src/phase5.css` and `src/landing/landing.css`.
- Prisma CLI validation, Prisma Client generation and production Vite build were not run: Prisma/Vite binaries were unavailable and the environment has Node 22.16.0, below the project's declared `>=22.22.0 <23` requirement.

## Phase 3 follow-up

The items deferred from Phase 2 were implemented in [`T-CARE-PHASE-3-CUSTOMER-BOOKING-UPIAUTOPAY-2026-11-23.md`](T-CARE-PHASE-3-CUSTOMER-BOOKING-UPIAUTOPAY-2026-11-23.md): Razorpay Plan/Subscription creation, UPI mandate Checkout, server-side signature/provider checks, lifecycle webhook handling, period-scoped visit credits and booking entitlement enforcement.

The user's confirmed entitlement rules are: Admin controls visit count and minimum visit frequency; unused visits expire at the period end; the Admin controls maximum renewals after the first period; cancellation of the UPI mandate stops future renewals but keeps paid benefits through the paid-through date; cancellation of a covered booking before Gardener service start restores one visit to the same paid period once.

## Merchant-side activation still required

Ordinary Live UPI Checkout working does not prove that the merchant account's Razorpay Subscriptions / UPI AutoPay product and API access are enabled. Confirm merchant-side capability before setting `RAZORPAY_SUBSCRIPTIONS_ENABLED=true`. Configure the subscription lifecycle webhook events in both Test and Live modes and validate the full recurring lifecycle outside production first. The application conservatively blocks recurring plan prices at or above ₹5,000 per cycle until the applicable merchant account amount limit is confirmed.

## Production safety

- Do not apply `20261123000200_subscription_plan_catalogue` until the migration history is checked, a backup exists, and a staging rehearsal succeeds.
- Do not enable recurring-plan checkout from the Phase 2 catalogue alone.
- Existing booking payments and the legacy subscription path are preserved.
- No customer records, plan prices, existing migration history, or production payment settings were changed.
