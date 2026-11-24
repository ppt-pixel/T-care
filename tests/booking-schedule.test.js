import test from 'node:test';
import assert from 'node:assert/strict';
import { getPreferredTimeSlots, getPreferredVisitDates } from '../src/bookingSchedule.js';

test('preferred time slots are local-time half-hour choices and enforce one-hour lead time', () => {
  const now = new Date(2026, 10, 24, 8, 5, 0, 0);
  const slots = getPreferredTimeSlots('2026-11-24', { now, durationMinutes: 60 });
  assert.equal(slots[0].value, '09:30');
  assert.equal(slots.at(-1).value, '16:00');
  assert.ok(slots.every((slot, index) => index === 0 || slot.timestamp - slots[index - 1].timestamp === 30 * 60 * 1000));
});

test('preferred slots fit the selected service duration inside the 09:00–17:00 request window', () => {
  const now = new Date(2026, 10, 24, 7, 0, 0, 0);
  const slots = getPreferredTimeSlots('2026-11-25', { now, durationMinutes: 90 });
  assert.equal(slots[0].value, '09:00');
  assert.equal(slots.at(-1).value, '15:30');
});

test('date carousel skips a day when no preferred time remains today', () => {
  const now = new Date(2026, 10, 24, 18, 30, 0, 0);
  const dates = getPreferredVisitDates({ now, days: 3, durationMinutes: 60 });
  assert.equal(dates.length, 2);
  assert.equal(dates[0].value, '2026-11-25');
  assert.equal(dates[0].dayLabel, 'Tomorrow');
  assert.equal(dates[0].slots[0].value, '09:00');
});

test('invalid date keys return no slots and the date carousel has a bounded horizon', () => {
  assert.deepEqual(getPreferredTimeSlots('2026-02-30', { now: new Date(2026, 1, 1) }), []);
  const dates = getPreferredVisitDates({ now: new Date(2026, 10, 24, 7), days: 999 });
  assert.equal(dates.length, 90);
});
