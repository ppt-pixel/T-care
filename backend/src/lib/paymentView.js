// Explicit customer-facing payment projection. Never expose provider identifiers,
// webhook event payloads or idempotency keys in Customer API responses.
export function serializeCustomerPayment(payment) {
  if (!payment) return null;
  return {
    id: payment.id,
    bookingId: payment.bookingId ?? null,
    subscriptionId: payment.subscriptionId ?? null,
    shopOrderId: payment.shopOrderId ?? null,
    amount: Number(payment.amount),
    currency: payment.currency,
    method: payment.method,
    status: payment.status,
    checkoutStarted: Boolean(payment.providerOrderId),
    createdAt: payment.createdAt,
    updatedAt: payment.updatedAt,
    paidAt: payment.paidAt ?? null,
    qr: payment.qrSessions?.[0] ? {
      imageUrl: payment.qrSessions[0].imageUrl,
      shortUrl: payment.qrSessions[0].shortUrl,
      expiresAt: payment.qrSessions[0].expiresAt,
      status: payment.qrSessions[0].status
    } : null,
    booking: payment.booking ? {
      reference: payment.booking.reference,
      service: payment.booking.service ? { name: payment.booking.service.name } : null
    } : null,
    subscription: payment.subscription ? {
      plan: payment.subscription.plan ? {
        name: payment.subscription.plan.name,
        billingCycle: payment.subscription.plan.billingCycle
      } : null
    } : null,
    shopOrder: payment.shopOrder ? { id: payment.shopOrder.id, orderNumber: payment.shopOrder.orderNumber, status: payment.shopOrder.status } : null,
    refunds: (payment.refunds ?? []).map(refund => ({
      id: refund.id,
      amount: Number(refund.amount),
      reason: refund.reason ?? null,
      status: refund.status,
      createdAt: refund.createdAt,
      processedAt: refund.processedAt ?? null
    }))
  };
}
