import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');

test('booking includes all Customer plants automatically without a plant-selection step', () => {
  const ui = read('../src/phase5.jsx');
  const start = ui.indexOf('export function CustomerBookingCreatePage');
  const end = ui.indexOf('function PlanDetails', start);
  assert.ok(start >= 0 && end > start, 'booking component should be present');
  const booking = ui.slice(start, end);
  assert.match(booking, /const plantIds = plants\.map\(plant => plant\.id\)/);
  assert.match(booking, /plantIds,/);
  assert.match(booking, /included automatically/);
  assert.doesNotMatch(booking, /p5-booking-plant-grid|p5-booking-plant-card|type="datetime-local"/);
});

test('booking date and time are selected through local dynamic horizontal scrollers', () => {
  const ui = read('../src/phase5.jsx');
  const booking = ui.slice(ui.indexOf('export function CustomerBookingCreatePage'), ui.indexOf('function PlanDetails'));
  const schedule = read('../src/bookingSchedule.js');
  assert.match(booking, /getPreferredVisitDates/);
  assert.match(booking, /p5-visit-date-scroller/);
  assert.match(booking, /p5-visit-time-scroller/);
  assert.match(booking, /scrollIntoView/);
  assert.match(booking, /new Date\(scheduledStart\)\.toISOString\(\)/);
  assert.match(schedule, /MINIMUM_LEAD_TIME_MS/);
  assert.match(schedule, /DEFAULT_INTERVAL_MINUTES = 30/);
});
