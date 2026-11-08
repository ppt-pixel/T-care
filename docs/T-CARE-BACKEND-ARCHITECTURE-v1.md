# T-CARE Backend Architecture v1

## 1. Source of truth

The frontend baseline for this architecture is `T-care-optimized(2).zip`, the Claude-provided optimized frontend. The current frontend remains the product/workflow source of truth. Backend work must preserve existing routes, screens, content, workflows and role experiences unless an integration requirement exposes a real defect.

The frontend README explicitly defines the boundary:

- Phase 1: finalized frontend workflow/states.
- Phase 2: define backend entities and API contracts from the finalized UI.
- Phase 3: connect frontend to backend.
- Phase 4: real authentication, payments, notifications, tracking and persistence.

## 2. Backend stack

Production infrastructure is **Supabase**, initially using the **Free plan** during development and early testing. The architecture must remain compatible with a later Pro/Team/Enterprise upgrade without changing the application data model.

Application/API stack:

- Node.js
- Express 5
- Supabase PostgreSQL
- Prisma ORM
- Zod validation
- bcrypt password hashing for the current custom API authentication layer
- JWT access/refresh authentication delivered through secure HTTP-only cookies
- Supabase Storage for images/videos and other media
- REST API under `/api/v1`

Supabase is the managed infrastructure boundary: PostgreSQL is the database engine, while Supabase Storage is the object-storage layer. The Node.js API remains the business-logic and authorization boundary.

The Supabase Secret API key (`sb_secret_...`) is server-only and bypasses RLS. It must never be shipped to the React frontend.

The Free plan is a development/initial deployment constraint, not an application-level database limit. No domain logic may assume that the Free plan will remain the permanent production tier.

## 3. Role model

Three application roles are authoritative in the backend:

- CUSTOMER
- GARDENER
- ADMIN

The frontend role picker is prototype behavior only. A client must never be trusted to select or escalate its own role.

Authorization must be enforced server-side on every protected API. Frontend route guards are a UX layer, not the security boundary.

## 4. Core domain entities

### Identity and access

- User
- RefreshSession

### Customer

- CustomerProfile
- Address
- Plant
- PlantPhoto
- PlantCareRecord
- Notification

### Catalog

- Service
- ServicePrice
- SubscriptionPlan
- PlantKnowledge

### Booking and operations

- Booking
- BookingPlant
- BookingStatusHistory
- GardenerAssignment
- ServiceReport
- ServiceReportPhoto
- ServiceChecklistItem

### Commerce

- Payment
- Refund
- Subscription

### Feedback/support

- Review
- IssueReport

### Administration/content

- CmsContent
- AuditLog

## 5. Ownership rules

A CUSTOMER can access only resources owned by that customer unless a documented operational relationship grants access (for example, the gardener assigned to a booking can access the plant/service data required to perform that booking).

A GARDENER can access only assigned operational records and their own profile, availability and earnings data.

An ADMIN can access operational resources according to the admin permission model.

Resource IDs must never be treated as authorization. Every read/write must also check ownership or role permission.

## 6. Booking state machine

The frontend currently models this operational sequence:

Booking Confirmed → Gardener Assigned → Gardener Accepted → On the way → Arrived → Service started → Service completed

Terminal alternative:

Any cancellable booking → Cancelled

The backend will store the canonical state and an immutable status-history trail. State transitions will be validated server-side rather than allowing arbitrary status strings from the frontend.

## 7. API structure

Base URL:

`/api/v1`

Planned groups:

- `/auth`
- `/users/me`
- `/customers/me`
- `/addresses`
- `/plants`
- `/services`
- `/bookings`
- `/gardener/jobs`
- `/gardener/reports`
- `/subscriptions`
- `/payments`
- `/reviews`
- `/notifications`
- `/admin/customers`
- `/admin/gardeners`
- `/admin/services`
- `/admin/bookings`
- `/admin/plans`
- `/admin/plants`
- `/admin/finance`
- `/admin/analytics`
- `/admin/cms`

## 8. Authentication

Registration and login create an authenticated server-side identity represented by a signed access token and refresh session. Passwords are never stored in plaintext.

The backend will issue role information from the authenticated database record. The client cannot promote itself from CUSTOMER to GARDENER or ADMIN.

Password reset, email verification and account recovery are separate flows and will be implemented after the base authentication path is verified.

## 9. File storage

Supabase Storage is the canonical media layer. Plant photos, service photos, report attachments, profile images and future service videos are not stored as PostgreSQL blobs. Database rows store the bucket/object key and metadata.

Recommended initial private bucket:

- `tcare-media`

The Node.js backend will issue/perform authorized media operations. The Supabase Secret API key remains server-only. Public URLs should not be assumed; private media should use controlled/signed access when customer/gardener/admin APIs expose it.

The Free plan is used initially. When the company upgrades the Supabase project, storage capacity and other plan resources can be expanded without redesigning the media model.

## 10. Notifications

Notifications are modeled as persistent records first. Delivery channels (in-app, email, SMS/push) will be adapters layered over the notification domain.

## 11. Payments

Payment state belongs to the backend, not the browser. The client may request a payment action and display returned state, but payment confirmation must come from a trusted provider/server-side verification path before a booking is marked paid.

## 12. Implementation order

1. Backend foundation and environment configuration.
2. Supabase project configuration + PostgreSQL/Prisma schema and migrations.
3. User/role model.
4. Authentication and authorization middleware.
5. Customer profile, addresses and plants.
6. Services and pricing.
7. Booking creation and state machine.
8. Gardener assignment and job execution.
9. Service reports, plant history and reviews.
10. Subscriptions, payments and refunds.
11. Notifications.
12. Admin/CMS/analytics APIs.
13. API integration tests.
14. Frontend API client and role-aware route guards.
15. End-to-end integration and production hardening.

## 13. Non-goals for the initial backend pass

- Redesigning the frontend.
- Replacing React/Vite.
- Reintroducing mock state after real persistence is connected.
- Adding GPS/maps before the booking/job contract is stable.
- Choosing a payment, storage or messaging vendor before the provider boundary is defined.


## Phase 2 implementation checkpoint — Authentication + RBAC

The first implementation milestone now establishes the security boundary before customer/gardener/admin domain APIs are connected.

- Public registration creates `CUSTOMER` only.
- `GARDENER` and `ADMIN` accounts are provisioned rather than self-selected.
- Access tokens are short-lived JWTs in an HTTP-only cookie.
- Refresh tokens are random opaque values; only SHA-256 hashes are persisted.
- Refresh-token rotation revokes the previous session token when a new access session is issued.
- Protected requests resolve the current user from the database, so a role/status change is effective immediately instead of waiting for an old JWT to expire.
- `requireRole(...)` is the server-side RBAC gate for future customer/gardener/admin route groups.
- Login/logout are written to the audit log.

### Next implementation milestone

Validate the Prisma schema against the installed Prisma CLI, apply the first migration against a real PostgreSQL database, then add customer profile/address/plant APIs before moving into services and booking APIs.
