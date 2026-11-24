# T-CARE Phase 6 — Staging Smoke-Test Matrix

Run this checklist only against an isolated staging deployment and non-production database with test credentials. Do not use customer production records or live Razorpay credentials.

## 1. Environment and deployment

- [ ] Runtime is Node `22.22.x` and matches the package engine declarations.
- [ ] Clean root and backend `npm ci` installs complete from lockfiles.
- [ ] Root `npm run build` completes without warnings/errors that block release.
- [ ] Backend Prisma Client generation and `prisma validate` complete.
- [ ] Backend full `npm test` completes, including `account-management.test.js`.
- [ ] Netlify production-style preview uses the same-origin `/api/v1` proxy; `VITE_API_BASE_URL` is unset for the preview.
- [ ] Render `FRONTEND_ORIGIN` exactly matches the preview origin.
- [ ] Health/readiness endpoint, logs and error reporting are checked; no secret or full payment payload is logged.
- [ ] Database migrations have been reconciled with `_prisma_migrations` and rehearsed on a disposable non-production database.

## 2. Responsive viewports

Run the high-priority flows at each viewport:

- [ ] 360 × 800 — narrow Android phone.
- [ ] 390 × 844 — common modern phone.
- [ ] 768 × 1024 — tablet portrait.
- [ ] 1280 × 800 — laptop.
- [ ] 1440 × 900 — desktop.

Check horizontal overflow, clipped dialogs, sidebar/drawer dismissal, readable form labels, keyboard focus, visible error text, scrollable tables and tap target spacing. Verify reduced-motion mode does not animate skeleton placeholders.

## 3. Guest and public catalogue

- [ ] Guest can load public service and product catalogues.
- [ ] Loading skeletons transition to data, empty state or retryable error; no permanent spinner remains after a failed request.
- [ ] Product detail modal opens/closes by its controls and does not overflow at mobile width.
- [ ] Guest cannot create a booking, access protected Customer resources or submit Store checkout.
- [ ] Product stock display is not treated as a reservation; checkout must revalidate stock on the server.

## 4. Authentication and sessions

- [ ] Register with valid details and both mandatory legal consent controls selected.
- [ ] Registration submission locks all controls; double-click/repeated Enter does not create duplicate requests.
- [ ] Email verification success, wrong code, expired code and resend cooldown show correct messages.
- [ ] Login success and wrong credentials work; invalid credentials must not rotate an otherwise valid session.
- [ ] Forgot-password request is enumeration-safe; valid/invalid/expired reset codes are handled safely.
- [ ] Password reset and password change enforce the configured policy and invalidate intended sessions.
- [ ] Session restore on reload works; expired access token refreshes once; concurrent tabs do not race refresh rotation.
- [ ] Expired/invalid refresh session signs out cleanly; a request from an old page cannot restore stale protected data.
- [ ] Logout is confirmed server-side and concurrent tabs do not resurrect the session.

## 5. Customer booking and subscriptions

- [ ] Customer can create/update/delete own plants and addresses only.
- [ ] Booking form loads services, plants, saved addresses, plans and subscriptions; leaving/reloading the page aborts obsolete fetches.
- [ ] Valid booking creates once; repeated submit/retry with the same request key does not create a second booking.
- [ ] Insufficient plant limit, inactive service, invalid time or missing visit credit is rejected by the server.
- [ ] Booking cancellation before service starts restores a paid-period visit credit at most once.
- [ ] A started/completed booking does not restore its credit through a stale cancellation request.
- [ ] Customer can see only their own booking, payment, refund and store-order data.
- [ ] One-time booking payment pending/success/failure/cancel paths reconcile with provider status before paid access is displayed.
- [ ] UPI AutoPay mandate create, authorize, payment capture, renew, stop/cancel and final paid-period credit expiry are verified in Test Mode.

## 6. Gardener workspace and media

- [ ] Gardener can see only assigned jobs and their own availability/profile/KYC records.
- [ ] Assignment/status transitions reject unauthorized or invalid state transitions.
- [ ] Job plant update, report, checklist and evidence photos persist and remain linked to the correct booking.
- [ ] Private Storage upload intent, actual object upload and completion verification are tested.
- [ ] Missing object, expired signed URL, wrong file type/size and denied storage operation return safe errors and do not mark the asset uploaded.
- [ ] KYC documents are private and inaccessible to other Customers/Gardeners; Admin review actions are audited.

## 7. Admin workspace

- [ ] Customer, Gardener and Admin routes enforce server-side role checks, not just hidden frontend navigation.
- [ ] Admin can manage services/prices, plans, users, KYC, bookings, product catalogue, plant knowledge, reviews/issues, notifications and CMS.
- [ ] Concurrent Admin edits/stock updates do not silently overwrite inventory or create impossible status transitions.
- [ ] Admin order fulfilment requires a paid/eligible order and tracking data before shipping.
- [ ] Refund request is authorized, amount-bounded, idempotent and reflected in the payment/order ledger only after provider confirmation.
- [ ] Sensitive user/document/payment fields are not exposed to unrelated roles or logs.

## 8. Plant Store checkout and fulfilment

- [ ] Cart persists in the same browser, handles malformed storage, and enforces maximum 20 units per product.
- [ ] Server recomputes current product prices, tax and shipping; client-supplied price changes are ignored.
- [ ] Out-of-stock and concurrent last-unit checkout scenarios cannot oversell.
- [ ] Checkout double-click/retry uses the same idempotency key for the same payload; reusing it with a changed payload is rejected.
- [ ] Payment failure/cancellation leaves the order pending and cart state recoverable; do not pay twice while status is unresolved.
- [ ] Paid order status, item price snapshots and delivery address snapshot remain consistent.
- [ ] Unpaid expiry/cancellation releases reserved stock once only; authorized payment stays held through the capture window; late capture enters review rather than automatic fulfilment.
- [ ] Admin can process, ship, deliver and refund an eligible order; Customer can read own order and tracking status.

## 9. Razorpay Test Mode — required before enabling payment flags

- [ ] Confirm merchant access for Orders, Subscriptions and QR Codes APIs as applicable.
- [ ] Verify checkout amount/currency/order ID and server signature; client callback alone never marks payment paid.
- [ ] Verify webhook signature, duplicate event idempotency, malformed payload handling and replay tolerance.
- [ ] Verify pending, failed, authorized, captured, refunded and late-capture states.
- [ ] For QR: create a single-use fixed-amount UPI QR; test successful credit, wrong amount/currency/method, duplicate event, QR close, expiry, late credit and reconciliation.
- [ ] Confirm a QR close used only to switch payment method does not cancel the underlying order/booking.
- [ ] Confirm full booking/order cancellation checks provider state before restoring visit credit or releasing stock.
- [ ] Verify refunds by provider confirmation and webhook/reconciliation; do not treat a refund request as completed until provider status confirms it.
- [ ] Recheck transaction logs and Customer-facing projections for provider secrets, signatures, raw webhook bodies or QR provider IDs.

## 10. Release decision

- [ ] All checks are recorded with build commit/hash, test environment, test account roles and provider event IDs (redacted where sensitive).
- [ ] All failures have an owner and a resolution/retest record.
- [ ] Payment flags are individually enabled only after their corresponding database, provider and business approval gates pass.
- [ ] Backup and rollback plan reviewed.
- [ ] Explicit production-release approval recorded.
