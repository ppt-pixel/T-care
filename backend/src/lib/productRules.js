export const MAX_PRODUCT_STOCK = 100000;


export function buildPublicProductWhere(query = {}) {
  if (query.inStock !== undefined && typeof query.inStock !== 'boolean') {
    throw new TypeError('inStock must be a boolean when provided.');
  }
  return {
    status: 'ACTIVE',
    ...(query.category && query.category !== 'All' ? { category: query.category } : {}),
    ...(query.search ? { OR: [
      { name: { contains: query.search, mode: 'insensitive' } },
      { description: { contains: query.search, mode: 'insensitive' } },
      { sku: { contains: query.search, mode: 'insensitive' } }
    ] } : {}),
    ...(query.inStock === true ? { stockQuantity: { gt: 0 } } : {}),
    ...(query.inStock === false ? { stockQuantity: 0 } : {})
  };
}

export function buildStockAdjustmentWhere(productId, delta) {
  if (typeof productId !== 'string' || !productId.trim()) throw new TypeError('productId is required.');
  if (!Number.isSafeInteger(delta) || delta === 0 || Math.abs(delta) > MAX_PRODUCT_STOCK) {
    throw new RangeError('Stock adjustment must be a non-zero whole number within the supported limit.');
  }
  if (delta < 0) return { id: productId, stockQuantity: { gte: Math.abs(delta) } };
  return { id: productId, stockQuantity: { lte: MAX_PRODUCT_STOCK - delta } };
}


// Shared transactional operation used by the Admin deactivation endpoint.
// Keeping the product status update and audit record in one transaction
// prevents a successful deactivation from being saved without its audit trail.
export async function deactivateProductWithAudit(tx, existing, actorUserId) {
  if (!tx?.product?.update || !tx?.auditLog?.create) {
    throw new TypeError('A Prisma transaction client is required.');
  }
  if (!existing?.id) throw new TypeError('An existing product record is required.');
  if (typeof actorUserId !== 'string' || !actorUserId.trim()) {
    throw new TypeError('actorUserId is required.');
  }

  const updated = await tx.product.update({
    where: { id: existing.id },
    data: { status: 'INACTIVE' }
  });
  await tx.auditLog.create({
    data: {
      actorUserId,
      action: 'STATUS_CHANGE',
      entityType: 'Product',
      entityId: updated.id,
      metadata: { from: existing.status, to: 'INACTIVE' }
    }
  });
  return updated;
}
