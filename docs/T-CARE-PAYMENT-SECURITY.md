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

## Important live verification requirement

This phase is implemented without connecting to the user's live Razorpay or Supabase accounts. It has not yet been certified against real gateway traffic.

Before production, use Razorpay Test Mode to verify at minimum:

- successful payment
- failed payment
- browser closed during checkout
- duplicate Pay clicks
- duplicate client verification requests
- duplicate webhook delivery
- delayed webhook delivery
- amount mismatch
- currency mismatch
- invalid signature
- provider timeout during order creation
- provider timeout during verification
- full refund
- partial refund
- refund timeout/network failure
- payment success followed by API/browser failure

Only after these tests pass should live credentials be enabled.
