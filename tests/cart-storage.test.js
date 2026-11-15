import assert from 'node:assert/strict';
import test from 'node:test';
import { parseStoredCart } from '../src/cartStorage.js';

test('restores valid cart entries and normalizes optional display fields', () => {
  const cart = parseStoredCart(JSON.stringify([
    { id: 'plant-1', name: 'Fern', price: '125.50', qty: 2 },
    { id: 'plant-2', name: 'Palm', price: 90, qty: 1, kind: 'palm', pot: '#fff' }
  ]));

  assert.deepEqual(cart, [
    { id: 'plant-1', name: 'Fern', price: 125.5, kind: 'snake', pot: '#e8e1d2', qty: 2 },
    { id: 'plant-2', name: 'Palm', price: 90, kind: 'palm', pot: '#fff', qty: 1 }
  ]);
});

test('ignores malformed storage and invalid cart entries', () => {
  assert.deepEqual(parseStoredCart('not-json'), []);
  assert.deepEqual(parseStoredCart(JSON.stringify([
    null,
    { id: 'bad-price', name: 'Fern', price: 'NaN', qty: 1 },
    { id: 'bad-qty', name: 'Palm', price: 90, qty: 0 }
  ])), []);
});
