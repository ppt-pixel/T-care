# T-CARE Payment Security Design

## Provider
T-CARE uses Razorpay as the initial payment-provider adapter for INR payments. Provider credentials are server-only environment variables.

Razorpay's current security guidance recommends server-generated Orders, signature validation, trusted backend amounts, and HMAC validation for webhooks.

## Payment flow

1. Customer creates a booking/subscription using T-CARE APIs.
2. Server calculates/stores the payable amount.
3. Customer requests a payment order with an `Idempotency-Key`.
4. Server creates the local `Payment` record first and then creates the provider Order.
5. Browser receives only the public Razorpay key ID, provider order ID, amount, and currency.
6. Customer completes checkout in the provider checkout UI.
7. Server verifies the returned signature and then fetches the provider payment to verify order ID, amount, and currency.
8. Provider webhooks are independently HMAC-verified and processed idempotently.
9. Only a verified captured/paid result changes the local payment to `PAID`.
10. Subscription activation occurs in the same database transaction as the verified payment state change.

## Safety properties

- No card number, CVV, UPI PIN, or payment credential is stored by T-CARE.
- Frontend-submitted prices are never trusted.
- Booking convenience fee is server-controlled through `BOOKING_CONVENIENCE_FEE`.
- Payment amounts are stored as PostgreSQL Decimal values and converted to integer paise only at the gateway boundary.
- Every payment requires an idempotency key.
- Provider order IDs and provider payment IDs are unique.
- Provider webhook event IDs are unique per provider.
- Duplicate webhooks are ignored safely.
- Client callback verification is not sufficient by itself; the backend also fetches the provider payment.
- Provider order/payment amount and currency are checked against the local record.
- Refunds are bounded by the remaining refundable amount.
- A refund that times out or suffers a network failure remains `PENDING` rather than being incorrectly marked failed, because the provider may have accepted it.
- Payment provider secrets are never returned to the browser.
- Payment state changes are audited.

## Live deployment status and safeguards

Booking checkout and backend verification have been exercised in Razorpay Test Mode, but live processing has not been enabled or certified. The Render Blueprint deliberately sets `PAYMENTS_ENABLED=false`. The backend also rejects a test key when payments are enabled in production, rejects a live key outside production, and requires API plus webhook credentials before the server starts with payments enabled.

Do not set `PAYMENTS_ENABLED=true` until the account, public webhook, production database and outstanding Test Mode checks below are verified, and the owner explicitly approves live charges.

### Production configuration

1. Complete Razorpay account activation and any required business verification. Use only a live account's `rzp_live_` key ID and matching API secret for production.
2. In Render's private environment settings, configure `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, and `RAZORPAY_WEBHOOK_SECRET`. Use a dedicated webhook secret generated/configured in Razorpay; it is not the API secret. Never put secrets in source control, frontend variables, support messages, or chat.
3. Keep `PAYMENTS_ENABLED=false` while deploying and checking the production API health endpoint and database. Adding credentials alone must not enable payment mutations.
4. Configure the Razorpay live-mode webhook URL as `https://t-care-api.onrender.com/api/v1/payments/webhook`, with a strong dedicated secret matching `RAZORPAY_WEBHOOK_SECRET`. Subscribe to the payment and refund events required by this application, including `payment.captured`, `payment.failed`, `order.paid`, `refund.created`, `refund.processed`, and `refund.failed`.
5. Before requesting live approval, use a dedicated staging service and isolated test database to complete Test Mode delivery from Razorpay to a publicly reachable HTTPS webhook. Verify full/partial refund behavior, refund failure/retry behavior, and payment/refund reconciliation. Do not tunnel the local or production database. Local synthetic webhook tests do not verify provider-to-deployment delivery.
6. Only after explicit owner approval, change `PAYMENTS_ENABLED` to `true` in Render as a separate deployment action. Keep the rollout limited and monitor provider, webhook, and payment-ledger records. A real charge or refund must have separate explicit approval.

The following Test Mode checks have already passed: successful/failed/dismissed booking checkout and retry; invalid webhook signature rejection; amount/currency mismatch rejection; ownership/signature validation tests; and duplicate webhook delivery handling. This is not a substitute for the outstanding public-webhook and refund checks above.
