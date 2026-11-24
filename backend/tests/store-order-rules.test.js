import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  calculateStoreTotals,
  canTransitionShopOrder,
  decimalToMinorUnits,
  minorUnitsToDecimal,
  normalizeOrderItems
} from '../src/lib/storeOrderRules.js';

test('money conversions use exact minor units', () => {
  assert.equal(decimalToMinorUnits('1299.95'), 129995);
  assert.equal(decimalToMinorUnits('0.10'), 10);
  assert.equal(minorUnitsToDecimal(129995), '1299.95');
  assert.throws(() => decimalToMinorUnits('1.001'), /decimal value/);
});

test('checkout totals calculate tax with integer basis points', () => {
  const result = calculateStoreTotals({
    itemLines: [{ unitPriceMinor: 10000, quantity: 2 }, { unitPriceMinor: 2500, quantity: 1 }],
    shippingFeeMinor: 500,
    taxRateBps: 1800
  });
  assert.deepEqual(result, { subtotalMinor: 22500, shippingFeeMinor: 500, taxRateBps: 1800, taxAmountMinor: 4050, totalMinor: 27050 });
});

test('checkout totals reject overflow and invalid rates', () => {
  assert.throws(() => calculateStoreTotals({ itemLines: [{ unitPriceMinor: Number.MAX_SAFE_INTEGER, quantity: 2 }], shippingFeeMinor: 0, taxRateBps: 0 }), /supported range/);
  assert.throws(() => calculateStoreTotals({ itemLines: [{ unitPriceMinor: 100, quantity: 1 }], shippingFeeMinor: 0, taxRateBps: 10001 }), /basis points/);
});

test('checkout totals stay within the database DECIMAL(10,2) limit', () => {
  assert.throws(() => calculateStoreTotals({ itemLines: [{ unitPriceMinor: 6000000000, quantity: 2 }], shippingFeeMinor: 0, taxRateBps: 0 }), /DECIMAL\(10,2\)/);
});

test('cart normalization merges duplicate product IDs and sorts them', () => {
  assert.deepEqual(normalizeOrderItems([{ productId: 'b', quantity: 2 }, { productId: 'a', quantity: 1 }, { productId: 'b', quantity: 3 }]), [
    { productId: 'a', quantity: 1 }, { productId: 'b', quantity: 5 }
  ]);
  assert.throws(() => normalizeOrderItems([{ productId: 'p', quantity: 12 }, { productId: 'p', quantity: 9 }]), /cannot exceed 20/);
});

test('fulfilment only follows paid order progression', () => {
  assert.equal(canTransitionShopOrder('PAID', 'PROCESSING'), true);
  assert.equal(canTransitionShopOrder('PROCESSING', 'SHIPPED'), true);
  assert.equal(canTransitionShopOrder('SHIPPED', 'DELIVERED'), true);
  assert.equal(canTransitionShopOrder('PENDING_PAYMENT', 'SHIPPED'), false);
  assert.equal(canTransitionShopOrder('DELIVERED', 'PROCESSING'), false);
});

test('Store checkout remains independent from booking and subscription payment feature flags', () => {
  const source = fs.readFileSync(new URL('../src/routes/orders.js', import.meta.url), 'utf8');
  assert.match(source, /STORE_CHECKOUT_ENABLED !== true/);
  assert.match(source, /requireStoreCheckout\(\)/);
  assert.match(source, /router\.get\('\/status'.*checkoutEnabled/s);
});
