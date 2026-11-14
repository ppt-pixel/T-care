import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDailyBookingSeries, summarizeFinance } from '../src/lib/adminMetrics.js';

test('daily booking series retains all days and counts completed/cancelled states', () => {
  const now = new Date('2026-11-12T18:00:00.000Z');
  const rows = buildDailyBookingSeries([
    { createdAt: new Date('2026-11-12T07:00:00.000Z'), status: 'SERVICE_COMPLETED' },
    { createdAt: new Date('2026-11-12T08:00:00.000Z'), status: 'CANCELLED' },
    { createdAt: new Date('2026-11-11T22:00:00.000Z'), status: 'CONFIRMED' },
    { createdAt: new Date('invalid'), status: 'CONFIRMED' }
  ], { days: 3, now });
  assert.equal(rows.length, 3);
  assert.deepEqual(rows.at(-1), { day: '2026-11-12', total: 2, completed: 1, cancelled: 1 });
  assert.deepEqual(rows.at(-2), { day: '2026-11-11', total: 1, completed: 0, cancelled: 0 });
});

test('finance summary keeps gross collection, refunds and payout records distinct', () => {
  assert.deepEqual(summarizeFinance({ grossCollected: '1200.50', refunded: '200.25', paidPayouts: '300', pendingPayouts: '75', paidTransactionCount: 4 }), {
    grossCollected: 1200.5,
    refunded: 200.25,
    netCollected: 1000.25,
    paidTransactionCount: 4,
    paidPayouts: 300,
    pendingPayouts: 75
  });
});

test('finance summary rejects invalid and negative amounts without inventing net collection', () => {
  const result = summarizeFinance({ grossCollected: -10, refunded: 50, paidPayouts: 'NaN', pendingPayouts: null, paidTransactionCount: -5 });
  assert.deepEqual(result, { grossCollected: 0, refunded: 50, netCollected: 0, paidTransactionCount: 0, paidPayouts: 0, pendingPayouts: 0 });
});
