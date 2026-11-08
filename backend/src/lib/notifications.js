import { prisma } from '../lib/prisma.js';

/**
 * Notifications are persisted before any optional external delivery.
 * External providers must never be allowed to mutate booking/payment state.
 */
export async function createNotification({
  userId,
  type,
  title,
  body,
  channel = 'IN_APP',
  metadata = undefined
}) {
  if (!userId) throw new Error('Notification userId is required.');

  // Current schema stores the user-facing notification fields. Metadata is
  // intentionally not persisted until a JSON metadata column is introduced;
  // callers can still use it for provider adapters without leaking it to DB.
  const notification = await prisma.notification.create({
    data: { userId, type, title, body, channel }
  });

  return notification;
}

export async function notifyUserSafely(input) {
  try {
    return await createNotification(input);
  } catch (error) {
    // Notification failure must never break the transaction/business operation
    // that triggered it. Log the error server-side without sensitive payloads.
    console.error('[notifications] failed to create notification', {
      userId: input?.userId,
      type: input?.type,
      channel: input?.channel,
      error: error?.message
    });
    return null;
  }
}

export async function markNotificationSent(id) {
  return prisma.notification.update({
    where: { id },
    data: { sentAt: new Date() }
  });
}
