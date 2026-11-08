# T-CARE Backend Verification Checkpoint — 7 November 2026

This note records the state confirmed during the local verification session. It is not a claim that all backend modules are production-ready.

## Environment and database

- Supabase PostgreSQL connection through the Session Pooler was confirmed.
- Prisma schema validation and Prisma Client generation succeeded.
- Initial migration `20261004125945_init` was created and applied.
- `prisma migrate status` reported the database schema up to date.
- Backend startup and `/api/v1/health` reported database `ok`.

## Verified API flows

- Customer registration returned `201 Created` and created a Customer user/profile.
- Refresh endpoint returned `200 OK` and rotated access/refresh cookies.
- `/api/v1/auth/me` returned `200 OK` after refresh.
- Customer profile GET and PATCH succeeded; a subsequent GET returned the updated name.
- Address create/list/update/delete succeeded; final list returned `{"addresses":[]}`.
- Plant create/list/get-by-ID/update succeeded.
- Public `GET /api/v1/services` returned `{"services":[]}`. The endpoint responded, but there were no service records yet.
- A route-order defect was found: the public `GET /:id` route was registered before the `/admin` router mount. In this release copy, the `/admin` router mount has been moved before the `/:id` catch-all route. This correction still requires a runtime RBAC test.

## Still pending verification

1. Plant deletion and final GET confirmation.
2. Cross-customer ownership isolation for plants, addresses and media.
3. Admin and Gardener test-account authentication/role setup.
4. Admin services and price CRUD; public catalog visibility with valid records.
5. Booking creation, scheduling, pricing, retrieval, cancellation and state transitions.
6. Gardener profile, KYC, availability, job acceptance/rejection and reassignment.
7. Service execution, checklist/report enforcement, plant health updates and care history.
8. Storage bucket, signed URLs, upload/download, ownership and cleanup.
9. Notifications, reviews, issue reports, CMS, analytics and Admin dashboard.
10. Full RBAC/security, dependency, frontend integration and production-readiness regression tests.

## Excluded from this verification scope

Payment processing, Razorpay, payment webhooks, refunds, payouts and payment-dependent subscription billing are intentionally excluded from this checkpoint.

## Release hygiene

- This archive excludes the real `.env` file and all `node_modules` directories.
- Copy `backend/.env.example` to `backend/.env` locally and enter fresh secrets privately.
- The actual `.env` included in the source upload must be treated as exposed; rotate its credentials.
- Run `npm ci` in `backend` and then `npx prisma generate` before starting the backend.
- Review the migration file before applying it to any other Supabase project. It was already applied to the project used in the verification session.
