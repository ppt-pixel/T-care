/**
 * Domain rules for Gardener visit work. Keep these pure so they can be tested
 * independently from Prisma, Express and the live database.
 */
export function canEditVisitPlantList(assignment) {
  if (!assignment?.booking) return false;
  return ['ASSIGNED', 'ACCEPTED'].includes(assignment.status)
    && ['GARDENER_ASSIGNED', 'GARDENER_ACCEPTED', 'ON_THE_WAY', 'ARRIVED'].includes(assignment.booking.status);
}

/**
 * Sum the underlying booking totals for completed visits. This is gross booking
 * value only; it must never be presented as a Gardener payout/commission.
 */
export function sumCompletedBookingValue(assignments) {
  const cents = (assignments || []).reduce((sum, item) => sum + Math.round((Number(item?.booking?.total || 0) + Number.EPSILON) * 100), 0);
  return cents / 100;
}
