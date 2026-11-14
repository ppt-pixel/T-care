import test from 'node:test';
import assert from 'node:assert/strict';
import { addBillingPeriod, isSupportedBillingCycle, parseBillingCycle } from '../src/lib/billingPeriod.js';

test('supports common subscription cycle names and explicit durations', () => {
  assert.deepEqual(parseBillingCycle('Monthly'), { unit: 'month', count: 1 });
  assert.deepEqual(parseBillingCycle('6 months'), { unit: 'month', count: 6 });
  assert.deepEqual(parseBillingCycle('12 months'), { unit: 'month', count: 12 });
  assert.deepEqual(parseBillingCycle('1 year'), { unit: 'year', count: 1 });
  assert.equal(isSupportedBillingCycle('three seasons'), false);
});

test('adds six and twelve calendar months rather than one month', () => {
  const start = new Date('2026-11-12T10:30:00.000Z');
  assert.equal(addBillingPeriod(start, '6 months').toISOString(), '2027-05-12T10:30:00.000Z');
  assert.equal(addBillingPeriod(start, '12 months').toISOString(), '2027-11-12T10:30:00.000Z');
});

test('clamps month-end dates instead of overflowing into the following month', () => {
  assert.equal(addBillingPeriod(new Date('2025-01-31T12:00:00.000Z'), '1 month').toISOString(), '2025-02-28T12:00:00.000Z');
  assert.equal(addBillingPeriod(new Date('2024-01-31T12:00:00.000Z'), '1 month').toISOString(), '2024-02-29T12:00:00.000Z');
});

test('clamps leap-day anniversaries to February 28 in a non-leap year', () => {
  assert.equal(addBillingPeriod(new Date('2024-02-29T08:00:00.000Z'), '1 year').toISOString(), '2025-02-28T08:00:00.000Z');
});

test('supports day and week cycles while rejecting unsupported text', () => {
  assert.equal(addBillingPeriod(new Date('2026-11-12T00:00:00.000Z'), '2 weeks').toISOString(), '2026-11-26T00:00:00.000Z');
  assert.equal(addBillingPeriod(new Date('2026-11-12T00:00:00.000Z'), '10 days').toISOString(), '2026-11-22T00:00:00.000Z');
  assert.equal(addBillingPeriod(new Date('2026-11-12T00:00:00.000Z'), 'forever'), null);
});
