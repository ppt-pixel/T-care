import test from 'node:test';
import assert from 'node:assert/strict';
import { canEditVisitPlantList, sumCompletedBookingValue } from '../src/lib/gardenerRules.js';

test('Gardener can edit a visit plant list before service starts', () => {
  for (const assignmentStatus of ['ASSIGNED', 'ACCEPTED']) {
    for (const bookingStatus of ['GARDENER_ASSIGNED', 'GARDENER_ACCEPTED', 'ON_THE_WAY', 'ARRIVED']) {
      assert.equal(canEditVisitPlantList({ status: assignmentStatus, booking: { status: bookingStatus } }), true);
    }
  }
});

test('Gardener cannot edit a visit plant list after work starts or when assignment is not editable', () => {
  for (const assignmentStatus of ['IN_PROGRESS', 'COMPLETED', 'REJECTED', 'CANCELLED']) {
    assert.equal(canEditVisitPlantList({ status: assignmentStatus, booking: { status: 'ARRIVED' } }), false);
  }
  for (const bookingStatus of ['SERVICE_STARTED', 'SERVICE_COMPLETED', 'CANCELLED']) {
    assert.equal(canEditVisitPlantList({ status: 'ACCEPTED', booking: { status: bookingStatus } }), false);
  }
  assert.equal(canEditVisitPlantList(null), false);
  assert.equal(canEditVisitPlantList({ status: 'ACCEPTED' }), false);
});

test('monthly completed booking value sums gross booking totals without applying a commission formula', () => {
  const rows = [
    { booking: { total: '499.00' } },
    { booking: { total: 1250.5 } },
    { booking: { total: null } },
    { booking: null }
  ];
  assert.equal(sumCompletedBookingValue(rows), 1749.5);
  assert.equal(sumCompletedBookingValue([]), 0);
  assert.equal(sumCompletedBookingValue(null), 0);
});
