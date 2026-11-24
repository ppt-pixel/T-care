import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canRestoreVisitCredit,
  getMaxAllowedRenewals,
  getRazorpayPlanSchedule,
  getRazorpayTotalCount,
  hasConfiguredVisitEntitlements,
  isVisitCreditInPeriod
} from '../src/lib/subscriptionPlanRules.js';

test('Razorpay schedule maps T-CARE recurring plan types', () => {
  assert.deepEqual(getRazorpayPlanSchedule('WEEKLY'), { period: 'weekly', interval: 1 });
  assert.deepEqual(getRazorpayPlanSchedule('ONE_MONTH'), { period: 'monthly', interval: 1 });
  assert.deepEqual(getRazorpayPlanSchedule('ONE_YEAR'), { period: 'yearly', interval: 1 });
  assert.equal(getRazorpayPlanSchedule('ONE_TIME_SERVICE'), null);
});

test('Razorpay total_count includes the first paid cycle', () => {
  assert.equal(getRazorpayTotalCount(0), 1);
  assert.equal(getRazorpayTotalCount(11), 12);
  assert.equal(getRazorpayTotalCount(-1), null);
  assert.equal(getRazorpayTotalCount(1.5), null);
});

test('Admin entitlement requirements are enforced without inventing legacy values', () => {
  assert.equal(hasConfiguredVisitEntitlements({ planType: 'ONE_TIME_SERVICE', includedVisitsPerPeriod: 1 }), true);
  assert.equal(hasConfiguredVisitEntitlements({ planType: 'ONE_TIME_SERVICE', includedVisitsPerPeriod: 2 }), false);
  assert.equal(hasConfiguredVisitEntitlements({ planType: 'WEEKLY', includedVisitsPerPeriod: 2, minimumVisitIntervalDays: 7, maxRenewalCycles: 11 }), true);
  assert.equal(hasConfiguredVisitEntitlements({ planType: 'WEEKLY', includedVisitsPerPeriod: null, minimumVisitIntervalDays: 7, maxRenewalCycles: 11 }), false);
});

test('renewal count respects the ten-year Razorpay horizon', () => {
  assert.equal(getMaxAllowedRenewals('ONE_YEAR'), 9);
  assert.equal(getMaxAllowedRenewals('ONE_MONTH'), 119);
  assert.equal(getMaxAllowedRenewals('WEEKLY'), 520);
});

test('visit credits are usable only within their paid period and while quota remains', () => {
  const credit = { periodStart: '2026-11-01T00:00:00.000Z', periodEnd: '2026-12-01T00:00:00.000Z', visitsGranted: 4, visitsUsed: 3 };
  assert.equal(isVisitCreditInPeriod(credit, new Date('2026-11-30T23:59:59.000Z')), true);
  assert.equal(isVisitCreditInPeriod(credit, new Date('2026-12-01T00:00:00.000Z')), false);
  assert.equal(isVisitCreditInPeriod({ ...credit, visitsUsed: 4 }, new Date('2026-11-10T00:00:00Z')), false);
});

test('visit credit restoration is one-time and only before service starts', () => {
  assert.equal(canRestoreVisitCredit({ bookingStatus: 'ARRIVED' }), true);
  assert.equal(canRestoreVisitCredit({ bookingStatus: 'CANCELLED' }), false);
  assert.equal(canRestoreVisitCredit({ bookingStatus: 'SERVICE_STARTED' }), false);
  assert.equal(canRestoreVisitCredit({ bookingStatus: 'CONFIRMED', assignmentStartedAt: new Date() }), false);
  assert.equal(canRestoreVisitCredit({ bookingStatus: 'CONFIRMED', creditRestoredAt: new Date() }), false);
});
