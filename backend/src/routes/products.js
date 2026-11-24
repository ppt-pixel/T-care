import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { buildPublicProductWhere, buildStockAdjustmentWhere, deactivateProductWithAudit } from '../lib/productRules.js';

const router = Router();

const productFields = {
  sku: z.string().trim().min(2).max(80),
  name: z.string().trim().min(2).max(160),
  description: z.string().trim().max(5000).default(''),
  category: z.string().trim().min(2).max(80),
  kind: z.string().trim().max(40).nullable().optional(),
  imageUrl: z.string().url().max(2000).nullable().optional(),
  careInstructions: z.string().trim().max(3000).nullable().optional(),
  lightRequirements: z.string().trim().max(500).nullable().optional(),
  wateringFrequency: z.string().trim().max(500).nullable().optional(),
  safetyNote: z.string().trim().max(500).nullable().optional(),
  potColor: z.string().trim().max(40).nullable().optional(),
  price: z.number().finite().nonnegative(),
  compareAtPrice: z.number().finite().nonnegative().nullable().optional(),
  stockQuantity: z.number().int().min(0).max(100000).default(0),
  status: z.enum(['ACTIVE', 'INACTIVE']).default('ACTIVE')
};
const validatePriceComparison = (value, ctx) => {
  if (value.compareAtPrice != null && value.price != null && value.compareAtPrice < value.price) {
    ctx.addIssue({ code: 'custom', path: ['compareAtPrice'], message: 'compareAtPrice must be greater than or equal to price.' });
  }
};
const productInput = z.object(productFields).strict().superRefine(validatePriceComparison);
const { stockQuantity: _stockQuantity, ...productPatchFields } = productFields;
const productPatch = z.object(productPatchFields).partial().strict().superRefine(validatePriceComparison);
const stockInput = z.object({
  delta: z.number().int().min(-100000).max(100000).refine(value => value !== 0, 'Stock adjustment cannot be zero.'),
  reason: z.string().trim().min(3).max(250)
}).strict();

function serializeProduct(product) {
  return {
    ...product,
    price: Number(product.price),
    compareAtPrice: product.compareAtPrice == null ? null : Number(product.compareAtPrice)
  };
}

// Public catalogue: only active products are disclosed; stock is current inventory.
router.get('/', async (req, res, next) => {
  try {
    const query = z.object({
      category: z.string().trim().max(80).optional(),
      search: z.string().trim().max(120).optional(),
      inStock: z.enum(['true', 'false']).transform(value => value === 'true').optional(),
      page: z.coerce.number().int().min(1).default(1),
      limit: z.coerce.number().int().min(1).max(100).default(48)
    }).parse(req.query);
    const where = buildPublicProductWhere(query);
    const [items, total] = await prisma.$transaction([
      prisma.product.findMany({
        where,
        select: { id: true, name: true, description: true, category: true, kind: true, imageUrl: true, careInstructions: true, lightRequirements: true, wateringFrequency: true, safetyNote: true, potColor: true, price: true, compareAtPrice: true, stockQuantity: true },
        orderBy: [{ category: 'asc' }, { name: 'asc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit
      }),
      prisma.product.count({ where })
    ]);
    res.set('Cache-Control', 'public, max-age=15, stale-while-revalidate=30');
    return res.json({ products: items.map(serializeProduct), pagination: { page: query.page, limit: query.limit, total, pages: Math.ceil(total / query.limit) }, generatedAt: new Date().toISOString() });
  } catch (error) { next(error); }
});

const admin = Router();
admin.use(requireAuth, requireRole('ADMIN'));

admin.get('/', async (req, res, next) => {
  try {
    const status = req.query.status ? z.enum(['ACTIVE', 'INACTIVE']).parse(req.query.status) : undefined;
    const products = await prisma.product.findMany({ where: status ? { status } : undefined, orderBy: [{ updatedAt: 'desc' }], take: 200 });
    return res.json({ products: products.map(serializeProduct) });
  } catch (error) { next(error); }
});

admin.post('/', async (req, res, next) => {
  try {
    const input = productInput.parse(req.body);
    const product = await prisma.$transaction(async tx => {
      const created = await tx.product.create({ data: input });
      if (input.stockQuantity > 0) {
        await tx.productStockMovement.create({ data: { productId: created.id, quantityChange: input.stockQuantity, reason: 'Initial stock', actorUserId: req.auth.id } });
      }
      await tx.auditLog.create({ data: { actorUserId: req.auth.id, action: 'CREATE', entityType: 'Product', entityId: created.id, metadata: { sku: created.sku, name: created.name, initialStock: input.stockQuantity } } });
      return created;
    });
    return res.status(201).json({ product: serializeProduct(product) });
  } catch (error) { next(error); }
});

admin.get('/:id/stock-movements', async (req, res, next) => {
  try {
    const product = await prisma.product.findUnique({ where: { id: req.params.id }, select: { id: true, name: true, sku: true } });
    if (!product) return res.status(404).json({ error: 'PRODUCT_NOT_FOUND', message: 'Product not found.' });
    const movements = await prisma.productStockMovement.findMany({
      where: { productId: product.id },
      select: { id: true, quantityChange: true, reason: true, actorUserId: true, createdAt: true },
      orderBy: { createdAt: 'desc' }, take: 100
    });
    return res.json({ product, movements });
  } catch (error) { next(error); }
});

admin.patch('/:id', async (req, res, next) => {
  try {
    const input = productPatch.parse(req.body);
    const existing = await prisma.product.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'PRODUCT_NOT_FOUND', message: 'Product not found.' });
    const effectivePrice = input.price ?? Number(existing.price);
    const effectiveCompareAtPrice = Object.prototype.hasOwnProperty.call(input, 'compareAtPrice') ? input.compareAtPrice : (existing.compareAtPrice == null ? null : Number(existing.compareAtPrice));
    if (effectiveCompareAtPrice != null && effectiveCompareAtPrice < effectivePrice) {
      return res.status(400).json({ error: 'INVALID_PRICE_COMPARISON', message: 'Compare-at price must be greater than or equal to the selling price.' });
    }
    const product = await prisma.$transaction(async tx => {
      const updated = await tx.product.update({ where: { id: existing.id }, data: input });
      await tx.auditLog.create({ data: { actorUserId: req.auth.id, action: 'UPDATE', entityType: 'Product', entityId: updated.id, metadata: { changedFields: Object.keys(input) } } });
      return updated;
    });
    return res.json({ product: serializeProduct(product) });
  } catch (error) { next(error); }
});

admin.post('/:id/stock', async (req, res, next) => {
  try {
    const input = stockInput.parse(req.body);
    const result = await prisma.$transaction(async tx => {
      const updated = await tx.product.updateMany({
        where: buildStockAdjustmentWhere(req.params.id, input.delta),
        data: { stockQuantity: { increment: input.delta } }
      });
      if (!updated.count) {
        const exists = await tx.product.findUnique({ where: { id: req.params.id }, select: { id: true, stockQuantity: true } });
        if (!exists) return { missing: true };
        return input.delta < 0 ? { insufficient: true } : { limitExceeded: true };
      }
      const product = await tx.product.findUnique({ where: { id: req.params.id } });
      await tx.productStockMovement.create({ data: { productId: product.id, quantityChange: input.delta, reason: input.reason, actorUserId: req.auth.id } });
      await tx.auditLog.create({ data: { actorUserId: req.auth.id, action: 'UPDATE', entityType: 'ProductStock', entityId: product.id, metadata: { delta: input.delta, reason: input.reason, resultingStock: product.stockQuantity } } });
      return { product };
    });
    if (result.missing) return res.status(404).json({ error: 'PRODUCT_NOT_FOUND', message: 'Product not found.' });
    if (result.insufficient) return res.status(409).json({ error: 'INSUFFICIENT_STOCK', message: 'Stock cannot become negative.' });
    if (result.limitExceeded) return res.status(409).json({ error: 'STOCK_LIMIT_EXCEEDED', message: 'Stock cannot exceed 100,000 units.' });
    return res.json({ product: serializeProduct(result.product) });
  } catch (error) { next(error); }
});

admin.delete('/:id', async (req, res, next) => {
  try {
    const existing = await prisma.product.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'PRODUCT_NOT_FOUND', message: 'Product not found.' });
    const product = await prisma.$transaction(tx =>
      deactivateProductWithAudit(tx, existing, req.auth.id)
    );
    return res.json({ product: serializeProduct(product), deactivated: true });
  } catch (error) { next(error); }
});

router.use('/admin', admin);
export default function productsRouter() { return router; }
