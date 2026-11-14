import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPublicProductWhere, buildStockAdjustmentWhere, deactivateProductWithAudit, MAX_PRODUCT_STOCK } from '../src/lib/productRules.js';

test('stock decrement predicate prevents negative inventory atomically', () => {
  assert.deepEqual(buildStockAdjustmentWhere('p-1', -3), { id: 'p-1', stockQuantity: { gte: 3 } });
});

test('stock increment predicate prevents exceeding the supported inventory cap', () => {
  assert.deepEqual(buildStockAdjustmentWhere('p-2', 7), { id: 'p-2', stockQuantity: { lte: MAX_PRODUCT_STOCK - 7 } });
});

test('invalid product stock changes are rejected', () => {
  for (const delta of [0, 1.5, NaN, Infinity, -MAX_PRODUCT_STOCK - 1, MAX_PRODUCT_STOCK + 1]) {
    assert.throws(() => buildStockAdjustmentWhere('p-3', delta), RangeError);
  }
  assert.throws(() => buildStockAdjustmentWhere('', 1), TypeError);
});


test('Admin product deactivation sets INACTIVE and records the audit trail transactionally', async () => {
  const calls = [];
  const tx = {
    product: {
      update: async args => {
        calls.push(['product.update', args]);
        return { id: 'product-1', status: args.data.status, sku: 'SKU-1' };
      }
    },
    auditLog: {
      create: async args => { calls.push(['auditLog.create', args]); return { id: 'audit-1' }; }
    }
  };

  const result = await deactivateProductWithAudit(tx, { id: 'product-1', status: 'ACTIVE' }, 'admin-1');

  assert.deepEqual(result, { id: 'product-1', status: 'INACTIVE', sku: 'SKU-1' });
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0], ['product.update', { where: { id: 'product-1' }, data: { status: 'INACTIVE' } }]);
  assert.deepEqual(calls[1][1].data, {
    actorUserId: 'admin-1', action: 'STATUS_CHANGE', entityType: 'Product', entityId: 'product-1',
    metadata: { from: 'ACTIVE', to: 'INACTIVE' }
  });
});

test('Admin product deactivation rejects missing or invalid records before writing', async () => {
  const tx = { product: { update: async () => assert.fail('must not update') }, auditLog: { create: async () => assert.fail('must not audit') } };
  await assert.rejects(() => deactivateProductWithAudit(tx, null, 'admin-1'), TypeError);
  await assert.rejects(() => deactivateProductWithAudit(tx, { id: 'product-1', status: 'ACTIVE' }, ''), TypeError);
});


test('public product catalogue can filter to products with available stock', () => {
  assert.deepEqual(buildPublicProductWhere({ inStock: true }), { status: 'ACTIVE', stockQuantity: { gt: 0 } });
});

test('public product catalogue can filter to products that are out of stock', () => {
  assert.deepEqual(buildPublicProductWhere({ inStock: false }), { status: 'ACTIVE', stockQuantity: 0 });
});

test('public product catalogue preserves category and search filters', () => {
  assert.deepEqual(buildPublicProductWhere({ category: 'Indoor', search: 'fern' }), {
    status: 'ACTIVE', category: 'Indoor',
    OR: [
      { name: { contains: 'fern', mode: 'insensitive' } },
      { description: { contains: 'fern', mode: 'insensitive' } },
      { sku: { contains: 'fern', mode: 'insensitive' } }
    ]
  });
});
