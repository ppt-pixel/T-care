# T-CARE — Phase 1: Audit and Foundation

**Checkpoint date:** 2026-11-12  
**Repository:** `ppt-pixel/T-care`  
**Audited branch:** `main`  
**Verified HEAD:** `73ff1bef5fdb9beffae6eac4fd1d37931514be9a`  
**Commit message:** `Route API requests through Netlify proxy`

## 1. Purpose and boundary

Phase 1 establishes the factual baseline for the next five phases. It does not implement the feature backlog. The production project is preserved, including the Netlify same-origin API proxy and existing Render/Supabase architecture. No production database operation, deployment change, or GitHub write was performed during this checkpoint.

This checkpoint is reconstructed from the deployment-ready T-CARE source archive and the exact Netlify proxy patch corresponding to the currently verified GitHub `main` revision. The public repository HEAD was checked again on 2026-11-12 before this checkpoint was prepared.

## 2. Current architecture

| Layer | Current implementation | Phase 1 decision |
|---|---|---|
| Frontend | React + Vite | Preserve |
| API | Node.js + Express | Preserve |
| ORM | Prisma | Preserve |
| Database | Existing Supabase PostgreSQL | Preserve; no reset/replacement |
| File storage | Supabase Storage | Preserve |
| Frontend hosting | Netlify | Preserve |
| Backend hosting | Render | Preserve |
| Transactional email | Brevo HTTP API support plus optional SMTP configuration | Preserve |
| Source control | `ppt-pixel/T-care`, branch `main` | Preserve |

### Browser/API path

`Browser → Netlify /api/* rewrite → Render Express API → Supabase PostgreSQL / Storage`

The production frontend uses relative `/api/v1/...` URLs. `public/_redirects` must keep the API proxy rule before the SPA fallback. The Netlify production `VITE_API_BASE_URL` override should remain unset so the browser does not bypass the proxy and call Render directly.

Authentication uses HTTP-only access/refresh cookies. The user has already verified successful registration, OTP, login, cookie creation and session persistence against the live Netlify site. Those live checks are historical user-confirmed evidence, not a test rerun in this local checkpoint.

## 3. Existing data model inventory

The current Prisma schema already has these models:

- Identity and access: `User`, `CustomerProfile`, `GardenerProfile`, `GardenerKycDocument`, `RefreshSession`, `EmailOtp`.
- Customer plants and media: `Address`, `Plant`, `MediaAsset`, `PlantPhoto`, `PlantCareRecord`.
- Services and bookings: `Service`, `ServicePrice`, `Booking`, `BookingPlant`, `BookingStatusHistory`, `GardenerAssignment`, `GardenerAvailability`.
- Service execution: `ServiceReport`, `ServiceReportPlant`, `ServiceChecklistItem`, `ServiceReportPhoto`.
- Finance: `Payment`, `PaymentEvent`, `Refund`, `Payout`.
- Subscriptions and engagement: `SubscriptionPlan`, `Subscription`, `Notification`, `Review`, `IssueReport`.
- Content and governance: `PlantKnowledge`, `CmsContent`, `AuditLog`.

The schema is a foundation for the requested features. Phase 2–5 must reuse these entities where they correctly represent the domain. New models are justified only for distinct data concepts (for example, sellable store products and stock movements), not as duplicate versions of existing plant-knowledge or plant-care data.

## 4. Existing API capability inventory

The current repository contains these principal route capabilities:

| Router | Existing route groups / behaviour | Known gap to address later |
|---|---|---|
| Auth | Registration, email verification, login, session refresh/logout | Preserve; regression-test only |
| Customer | Profile, addresses, plants and plant photos | Customer plant health update/history requirements need completion/verification |
| Bookings | Create/list/detail/cancel customer bookings | Keep server-side ownership, pricing and overlap validation; improve booking UX in Phase 2 |
| Services | Public active service catalogue; Admin service and price CRUD | Make sure Admin remains the only service manager |
| Gardener | Profile, availability, KYC, jobs, job transitions and history | Add Gardener-side payout access and verify earnings semantics in Phase 3 |
| Service execution | Assigned-job report and service evidence workflows | Verify customer/Gardener plant-health collaboration in Phase 3 |
| Admin | Overview, user/gardener/KYC management, bookings, assignment, payments, payouts and audit logs | Improve live dashboard summaries/activity/popularity and central operations in Phase 4 |
| Notifications | Customer/Gardener inbox, read/read-all and Admin send/list | Current delivery is persisted in-app notification; polling is not push/WebSocket real-time |
| Subscriptions | Public plans, customer list/create/cancel/pause/resume and Admin plans/subscription status | UI placeholder(s), billing-cycle correctness and unpaid-state safety need completion in Phase 2/4 |
| Reviews/issues | Customer submissions, Admin moderation and published-review endpoint | Public About page currently includes sample profiles; connect only approved live data in Phase 5 |
| Analytics | Admin overview, booking/revenue series and Gardener performance | Dashboard presentation/activity/popular service calculations need completion in Phase 4 |
| CMS/media | Existing CMS and authorized media access | Preserve existing permissions |

## 5. Confirmed gaps and risks from the source audit

1. **Subscription date calculation:** the earlier implementation treated month-based cycles as one month regardless of whether a plan described six or twelve months. A shared, tested billing-period helper is required before plans are considered operational.
2. **Subscription UI:** customer and Admin navigation contain placeholder/out-of-scope views despite backend subscription models and route foundations.
3. **Customer plant health:** the customer plant update route needs an explicit validated health-status/history workflow and authorized visibility to relevant assigned Gardeners.
4. **Gardener finance:** payout records exist and Admin can inspect/update permitted payout states, but Gardener self-service payout history and a formally defined earnings formula are not established by the existing API.
5. **Gardener plant scope:** access to customer plants must remain assignment-scoped; do not create unrestricted Gardener plant CRUD.
6. **Admin dashboard:** current overview is database-backed but does not yet expose all requested daily booking, financial, subscription, recent activity and popular-service summaries in one operational view.
7. **Public content:** the About page contains explicitly labelled sample Gardener profiles. These must be replaced with approved live Garderners/reviews or honest empty states. Never present sample names/ratings as real.
8. **WhatsApp:** a floating component exists, but the number comes from configuration. A real business number must be supplied before the link can be enabled.
9. **Plant Store:** educational plant knowledge is not a commerce catalogue. A product/inventory model is a separate domain requirement.
10. **Real-time claims:** existing API fetches/in-app notifications are not equivalent to WebSocket push. The initial no-paid-services implementation should use visibility-aware polling (15–30 seconds where justified), immediate post-mutation refresh and no overlapping requests.
11. **Dependency reproducibility:** root `package.json` currently uses `latest` for frontend dependencies. The lockfile records a resolution, but the manifest can drift when dependencies are refreshed. Keep lockfile and manifest aligned and avoid gratuitous upgrades during feature work.
12. **Validation/deployment:** the last known complete production build was not confirmed by the earlier checkpoint. No code in this Phase 1 checkpoint has been deployed.

## 6. Phase map and exit criteria

### Phase 1 — Audit and foundation (this checkpoint)

- Verify current source revision and hosting architecture.
- Inventory schema, routes, workspaces and public pages.
- Separate existing functionality from gaps.
- Define security, migration, deployment and test constraints.
- Produce a stable source baseline and checkpoint.

**Exit:** audit document and clean baseline archive available; production configuration retained; no destructive action taken.

### Phase 2 — Customer workspace

Customer booking UX; plant-health updates/history; notifications; visits; subscription catalogue and customer subscription lifecycle; most-booked service display. Each mutation must persist and refresh relevant UI. Payment remains pending until a verified payment provider event exists.

### Phase 3 — Gardener workspace

Assignment-scoped plant work; job status lifecycle; plant reports; ratings; next visit/today's jobs; availability; Gardener-only earnings and payout history. No invented commission or earnings formula.

### Phase 4 — Admin workspace

Operational overview; customer/Gardener records; daily bookings; service/booking administration; subscription plans and monitoring; plant knowledge; finance/payout visibility; audit activity; popular services.

### Phase 5 — Public website and Plant Store

Live approved Gardener profiles and published reviews; configured WhatsApp; public subscription plans; distinct Product/inventory catalogue with Admin controls and customer display. No false payment completion.

### Phase 6 — Integration and release validation

Controlled refresh/polling; role and ownership tests; database migration validation; frontend build; backend tests; mobile/responsive checks; full customer/Gardener/Admin end-to-end flows; final Netlify/Render deployment review.

## 7. Engineering guardrails

- Do not reset, replace or seed-overwrite the production Supabase database.
- Use additive Prisma migrations for new schema needs; review SQL before any deployment.
- Never run `prisma migrate reset`, forced database reset or destructive production migration.
- Enforce role and ownership on the backend, not only in frontend routing.
- Keep admin-only Service and SubscriptionPlan management protected by `requireRole('ADMIN')`.
- Keep Gardener access limited to their own profile, payouts and assigned jobs/plant context.
- Never expose Supabase secret keys, JWT secrets, OTPs or cookie values to the browser or logs.
- Do not claim a payment, payout or subscription activation without verified financial evidence and an authorized transition.
- Preserve `netlify.toml`, `public/_redirects`, `render.yaml`, environment-based secrets and the same-origin API proxy.
- Do not push or deploy unvalidated broad changes to production `main`.

## 8. Phase 1 validation log

| Check | Result | Notes |
|---|---|---|
| GitHub main revision check | PASS | HEAD `73ff1bef5fdb9beffae6eac4fd1d37931514be9a` verified on 2026-11-12 |
| Architecture and route inventory | PASS | Based on repository source inspection |
| Prisma model inventory | PASS | Existing model names recorded above |
| Netlify proxy files retained | PASS | `public/_redirects` routes `/api/*` before SPA fallback |
| Production Vite build | NOT RUN | Dependency installation is not available in this environment; do not treat as passed |
| Prisma validation/migration against database | NOT RUN | No database credentials/environment used; no production DB access attempted |
| Live integration test | NOT RUN IN THIS CHECKPOINT | Previous live login/session checks were user-confirmed separately |

## 9. Next action

Proceed only to **Phase 2 — Customer workspace** using this checkpoint as its source baseline. Do not mix Gardener, Admin or public-store work into the Phase 2 completion commit. Complete and validate the Customer phase before opening Phase 3.
