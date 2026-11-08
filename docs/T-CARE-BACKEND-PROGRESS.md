# T-CARE Backend Progress — Current Baseline

This build continues from the user-provided `T-care-backend-admin-operations(1).zip`.

Completed backend domains:
- Architecture and PostgreSQL/Prisma schema
- Authentication, refresh sessions and server-side RBAC
- Customer profile, addresses and plants
- Services and pricing
- Booking lifecycle
- Gardener operations and service execution
- Plant health/service reports
- Media upload metadata and Supabase Storage integration
- Reviews and issue management
- Subscriptions
- Razorpay payment/order/verification/webhook/refund foundation
- Notifications
- Admin Operations
- CMS
- Admin analytics/reporting
- Security hardening

This build does not connect to a live Supabase/PostgreSQL or payment account.


## Authentication / identity implementation update — 8 November 2026

- Public registration now accepts only `CUSTOMER` or `GARDENER` through `accountType`.
- The backend creates the corresponding CustomerProfile or GardenerProfile and leaves the user `PENDING`.
- Email OTP is sent via Nodemailer/Gmail SMTP. The OTP is stored only as a keyed HMAC hash, expires after a configurable 10 minutes, has a five-attempt limit and a configurable resend cooldown.
- Email verification activates the account and then issues HTTP-only access/refresh cookies.
- Login, refresh, `/auth/me`, and protected middleware reject unverified accounts.
- Gardener email verification does not imply KYC approval; GardenerProfile remains `NOT_STARTED` until the Admin KYC workflow.
- Admin provisioning is separate through `npm run admin:provision`, driven by private `ADMIN_EMAIL`, `ADMIN_FULL_NAME`, and `ADMIN_INITIAL_PASSWORD` environment fields.
- Frontend registration now offers Customer and Gardener only; Admin is not a public selection. Login destination is determined by the role returned from the backend, and protected frontend workspace routes check the authenticated role.
- Gmail SMTP values and Admin identity values remain placeholders in `.env.example`; the owner must enter them locally.
- SMTP send/verify, actual OTP delivery and OTP verification remain live checks requiring the owner's Gmail App Password.
