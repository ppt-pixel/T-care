export const SUBSCRIPTION_PLAN_TYPES = Object.freeze([
  'ONE_TIME_SERVICE',
  'WEEKLY',
  'ONE_MONTH',
  'ONE_YEAR',
  'LEGACY_RECURRING'
]);

const BILLING_CYCLES = Object.freeze({
  ONE_TIME_SERVICE: 'one-time',
  WEEKLY: 'weekly',
  ONE_MONTH: 'monthly',
  ONE_YEAR: 'yearly'
});

export function getPlanTypeLabel(planType) {
  switch (planType) {
    case 'ONE_TIME_SERVICE': return 'One-Time Service';
    case 'WEEKLY': return 'Weekly';
    case 'ONE_MONTH': return 'One-Month';
    case 'ONE_YEAR': return 'One-Year';
    default: return 'Legacy recurring plan';
  }
}

export function isRecurringPlanType(planType) {
  return ['WEEKLY', 'ONE_MONTH', 'ONE_YEAR', 'LEGACY_RECURRING'].includes(planType);
}

export function isUpiAutopayPlanType(planType) {
  return ['WEEKLY', 'ONE_MONTH', 'ONE_YEAR'].includes(planType);
}

export function getBillingCycleForPlanType(planType, legacyBillingCycle) {
  if (Object.hasOwn(BILLING_CYCLES, planType)) return BILLING_CYCLES[planType];
  if (planType === 'LEGACY_RECURRING' && typeof legacyBillingCycle === 'string' && legacyBillingCycle.trim()) {
    return legacyBillingCycle.trim();
  }
  return null;
}

export function getPlanRenewalMode(planType) {
  if (planType === 'ONE_TIME_SERVICE') return 'NO_RENEWAL';
  if (isUpiAutopayPlanType(planType)) return 'UPI_AUTOPAY';
  return 'LEGACY_REVIEW_REQUIRED';
}

export function isEligibleForUpiAutopay(priceInRupees) {
  const price = Number(priceInRupees);
  return Number.isFinite(price) && price > 0 && price < 5000;
}

export function getPlanCancellationPolicy(planType) {
  if (isUpiAutopayPlanType(planType)) return 'STOP_FUTURE_RENEWALS_KEEP_PAID_ACCESS';
  if (planType === 'LEGACY_RECURRING') return 'LEGACY_REVIEW_REQUIRED';
  return 'NO_RENEWAL';
}

export function getRazorpayPlanSchedule(planType) {
  switch (planType) {
    case 'WEEKLY': return { period: 'weekly', interval: 1 };
    case 'ONE_MONTH': return { period: 'monthly', interval: 1 };
    case 'ONE_YEAR': return { period: 'yearly', interval: 1 };
    default: return null;
  }
}

// Razorpay total_count includes the initial paid cycle. Admin configures only
// the renewals after that first cycle, so add one when calling the API.
export function getRazorpayTotalCount(maxRenewalCycles) {
  if (!Number.isInteger(maxRenewalCycles) || maxRenewalCycles < 0) return null;
  return maxRenewalCycles + 1;
}

export function getMaxAllowedRenewals(planType) {
  // Razorpay subscriptions are bounded to ten years. The value here excludes
  // the first paid billing cycle, matching the Admin-facing field semantics.
  switch (planType) {
    case 'WEEKLY': return 520;
    case 'ONE_MONTH': return 119;
    case 'ONE_YEAR': return 9;
    default: return 0;
  }
}

export function hasConfiguredVisitEntitlements(plan) {
  if (!plan || !Number.isInteger(plan.includedVisitsPerPeriod) || plan.includedVisitsPerPeriod < 1) return false;
  if (plan.planType === 'ONE_TIME_SERVICE') return plan.includedVisitsPerPeriod === 1;
  return Number.isInteger(plan.minimumVisitIntervalDays)
    && plan.minimumVisitIntervalDays >= 1
    && Number.isInteger(plan.maxRenewalCycles)
    && plan.maxRenewalCycles >= 0
    && plan.maxRenewalCycles <= getMaxAllowedRenewals(plan.planType);
}

export function isVisitCreditInPeriod(credit, at = new Date()) {
  const now = at instanceof Date ? at.getTime() : new Date(at).getTime();
  const start = new Date(credit?.periodStart).getTime();
  const end = new Date(credit?.periodEnd).getTime();
  return Number.isFinite(now) && Number.isFinite(start) && Number.isFinite(end)
    && start <= now && now < end
    && Number.isInteger(credit?.visitsUsed)
    && Number.isInteger(credit?.visitsGranted)
    && credit.visitsUsed < credit.visitsGranted;
}

export function canRestoreVisitCredit({ bookingStatus, assignmentStartedAt, creditRestoredAt }) {
  return bookingStatus !== 'CANCELLED'
    && bookingStatus !== 'SERVICE_STARTED'
    && bookingStatus !== 'SERVICE_COMPLETED'
    && !assignmentStartedAt
    && !creditRestoredAt;
}
