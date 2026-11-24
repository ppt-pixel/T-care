import { prisma } from './prisma.js';
import { sendPaymentReceiptEmail } from './email.js';

function receiptPurpose(payment) {
  if (payment.booking) {
    const reference = payment.booking.reference || payment.bookingId;
    const service = payment.booking.service?.name || 'Service booking';
    return `T-CARE ${service} · Booking ${reference}`;
  }
  if (payment.subscription) {
    const plan = payment.subscription.plan?.name || 'Subscription';
    return `T-CARE ${plan} subscription`;
  }
  if (payment.shopOrder) return `T-CARE Plant Store order ${payment.shopOrder.orderNumber}`;
  return 'T-CARE payment';
}

function receiptNumber(payment) {
  const day = new Date(payment.paidAt || payment.createdAt).toISOString().slice(0, 10).replaceAll('-', '');
  return `TCR-${day}-${String(payment.id).slice(-8).toUpperCase()}`;
}

export async function ensurePaymentReceipt(paymentId) {
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: {
      booking: { include: { service: true, customer: { include: { user: { select: { id: true, fullName: true, email: true } } } } } },
      subscription: {
        include: {
          plan: true,
          customer: { include: { user: { select: { id: true, fullName: true, email: true } } } }
        }
      },
      shopOrder: { include: { customer: { include: { user: { select: { id: true, fullName: true, email: true } } } } } }
    }
  });
  if (!payment || !['PAID', 'PARTIALLY_REFUNDED', 'REFUNDED'].includes(payment.status)) return null;
  const customerUser = payment.booking?.customer?.user || payment.subscription?.customer?.user || payment.shopOrder?.customer?.user;
  if (!customerUser?.email) return null;

  const paidAt = payment.paidAt || payment.updatedAt || payment.createdAt;
  return prisma.paymentReceipt.upsert({
    where: { paymentId: payment.id },
    create: {
      paymentId: payment.id,
      receiptNumber: receiptNumber(payment),
      recipientEmail: customerUser.email,
      recipientName: customerUser.fullName || 'Customer',
      purpose: receiptPurpose(payment),
      amount: payment.amount,
      currency: payment.currency || 'INR',
      paymentMethod: payment.method,
      transactionId: payment.providerPaymentId || payment.providerOrderId || payment.id,
      paidAt
    },
    update: {}
  });
}

export async function deliverPaymentReceipt(receiptId, { forceResend = false } = {}) {
  if (forceResend) {
    const reset = await prisma.paymentReceipt.updateMany({
      where: { id: receiptId, deliveryStatus: { not: 'SENDING' } },
      data: { deliveryStatus: 'PENDING', sentAt: null, lastError: null, sendStartedAt: null }
    });
    if (!reset.count) return prisma.paymentReceipt.findUnique({ where: { id: receiptId } });
  }

  const now = new Date();
  const staleSendingBefore = new Date(now.getTime() - 10 * 60_000);
  const claimed = await prisma.paymentReceipt.updateMany({
    where: {
      id: receiptId,
      OR: [
        { deliveryStatus: { in: ['PENDING', 'FAILED'] } },
        { deliveryStatus: 'SENDING', sendStartedAt: { lt: staleSendingBefore } }
      ]
    },
    data: {
      deliveryStatus: 'SENDING',
      sendStartedAt: now,
      attempts: { increment: 1 },
      lastError: null
    }
  });
  if (!claimed.count) return prisma.paymentReceipt.findUnique({ where: { id: receiptId } });

  const receipt = await prisma.paymentReceipt.findUnique({
    where: { id: receiptId },
    include: { payment: { select: { status: true } } }
  });
  if (!receipt) throw new Error('Payment receipt disappeared before delivery.');
  try {
    await sendPaymentReceiptEmail({ ...receipt, paymentStatus: receipt.payment.status });
    return await prisma.paymentReceipt.update({
      where: { id: receiptId },
      data: { deliveryStatus: 'SENT', sentAt: new Date(), sendStartedAt: null, lastError: null }
    });
  } catch (error) {
    return prisma.paymentReceipt.update({
      where: { id: receiptId },
      data: {
        deliveryStatus: 'FAILED',
        sendStartedAt: null,
        lastError: String(error?.message || 'Email delivery failed').slice(0, 500)
      }
    });
  }
}

export async function ensureAndDeliverPaymentReceipt(paymentId) {
  try {
    const receipt = await ensurePaymentReceipt(paymentId);
    if (!receipt) return null;
    return await deliverPaymentReceipt(receipt.id);
  } catch (error) {
    // Provider confirmation must not be rolled back or rejected because email delivery failed.
    console.error('[payments] receipt creation/delivery failed', {
      paymentId,
      code: error?.code || 'RECEIPT_DELIVERY_ERROR'
    });
    return null;
  }
}
