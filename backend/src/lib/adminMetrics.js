export function buildDailyBookingSeries(bookings, { days = 14, now = new Date() } = {}) {
  const count = Math.max(1, Math.min(365, Math.trunc(Number(days) || 14)));
  const rows = new Map();
  for (let offset = count - 1; offset >= 0; offset -= 1) {
    const day = new Date(now);
    day.setUTCHours(0, 0, 0, 0);
    day.setUTCDate(day.getUTCDate() - offset);
    const key = day.toISOString().slice(0, 10);
    rows.set(key, { day: key, total: 0, completed: 0, cancelled: 0 });
  }
  for (const booking of Array.isArray(bookings) ? bookings : []) {
    const createdAt = booking?.createdAt instanceof Date ? booking.createdAt : new Date(booking?.createdAt);
    if (Number.isNaN(createdAt.getTime())) continue;
    const row = rows.get(createdAt.toISOString().slice(0, 10));
    if (!row) continue;
    row.total += 1;
    if (booking.status === 'SERVICE_COMPLETED') row.completed += 1;
    if (booking.status === 'CANCELLED') row.cancelled += 1;
  }
  return [...rows.values()];
}

function amount(value) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

export function summarizeFinance({ grossCollected = 0, refunded = 0, paidPayouts = 0, pendingPayouts = 0, paidTransactionCount = 0 } = {}) {
  const gross = amount(grossCollected);
  const refunds = Math.min(gross, amount(refunded));
  return {
    grossCollected: gross,
    refunded: amount(refunded),
    netCollected: Math.max(0, gross - refunds),
    paidTransactionCount: Math.max(0, Math.trunc(Number(paidTransactionCount) || 0)),
    paidPayouts: amount(paidPayouts),
    pendingPayouts: amount(pendingPayouts)
  };
}
