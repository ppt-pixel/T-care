import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getBillingCycleForPlanType,
  getPlanCancellationPolicy,
  getPlanRenewalMode,
  getPlanTypeLabel,
  isEligibleForUpiAutopay,
  isRecurringPlanType
} from '../src/lib/subscriptionPlanRules.js';

test('maps the four requested plan types to stable billing cycles', () => {
  assert.equal(getBillingCycleForPlanType('ONE_TIME_SERVICE'), 'one-time');
  assert.equal(getBillingCycleForPlanType('WEEKLY'), 'weekly');
  assert.equal(getBillingCycleForPlanType('ONE_MONTH'), 'monthly');
  assert.equal(getBillingCycleForPlanType('ONE_YEAR'), 'yearly');
});

test('preserves existing custom billing cycles as legacy recurring plans', () => {
  assert.equal(getBillingCycleForPlanType('LEGACY_RECURRING', '6 months'), '6 months');
  assert.equal(getBillingCycleForPlanType('LEGACY_RECURRING', ''), null);
  assert.equal(getPlanTypeLabel('LEGACY_RECURRING'), 'Legacy recurring plan');
});

test('one-time plans do not renew and recurring plans use UPI AutoPay', () => {
  assert.equal(isRecurringPlanType('ONE_TIME_SERVICE'), false);
  assert.equal(isRecurringPlanType('WEEKLY'), true);
  assert.equal(getPlanRenewalMode('ONE_TIME_SERVICE'), 'NO_RENEWAL');
  assert.equal(getPlanRenewalMode('ONE_MONTH'), 'UPI_AUTOPAY');
  assert.equal(getPlanRenewalMode('LEGACY_RECURRING'), 'LEGACY_REVIEW_REQUIRED');
});

test('UPI AutoPay recurring amounts must be positive and below INR 5,000', () => {
  assert.equal(isEligibleForUpiAutopay(4999.99), true);
  assert.equal(isEligibleForUpiAutopay(5000), false);
  assert.equal(isEligibleForUpiAutopay(0), false);
  assert.equal(isEligibleForUpiAutopay(Number.NaN), false);
});

test('recurring cancellation stops future renewals without revoking paid access', () => {
  assert.equal(getPlanCancellationPolicy('ONE_TIME_SERVICE'), 'NO_RENEWAL');
  assert.equal(getPlanCancellationPolicy('WEEKLY'), 'STOP_FUTURE_RENEWALS_KEEP_PAID_ACCESS');
  assert.equal(getPlanCancellationPolicy('ONE_YEAR'), 'STOP_FUTURE_RENEWALS_KEEP_PAID_ACCESS');
  assert.equal(getPlanCancellationPolicy('LEGACY_RECURRING'), 'LEGACY_REVIEW_REQUIRED');
});
