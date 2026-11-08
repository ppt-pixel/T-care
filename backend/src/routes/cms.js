import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router = Router();

const publicContent = z.object({ key: z.string().trim().min(1).max(120) });
const contentInput = z.object({
  key: z.string().trim().min(1).max(120),
  title: z.string().trim().min(1).max(200),
  body: z.string().max(50000),
  status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']).default('DRAFT')
}).strict();

router.get('/public/:key', async (req, res, next) => {
  try {
    const { key } = publicContent.parse(req.params);
    const content = await prisma.cmsContent.findFirst({
      where: { key, status: 'PUBLISHED', publishedAt: { not: null } },
      select: { key: true, title: true, body: true, publishedAt: true, updatedAt: true }
    });
    if (!content) return res.status(404).json({ error: 'CONTENT_NOT_FOUND', message: 'Published content not found.' });
    res.json({ content });
  } catch (error) { next(error); }
});

const admin = Router();
admin.use(requireAuth, requireRole('ADMIN'));

admin.get('/', async (req, res, next) => {
  try {
    const q = z.object({
      status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']).optional(),
      search: z.string().trim().max(120).optional(),
      page: z.coerce.number().int().min(1).default(1),
      limit: z.coerce.number().int().min(1).max(100).default(25)
    }).parse(req.query);
    const where = {
      ...(q.status ? { status: q.status } : {}),
      ...(q.search ? { OR: [
        { key: { contains: q.search, mode: 'insensitive' } },
        { title: { contains: q.search, mode: 'insensitive' } }
      ] } : {})
    };
    const [items, total] = await prisma.$transaction([
      prisma.cmsContent.findMany({ where, orderBy: { updatedAt: 'desc' }, skip: (q.page - 1) * q.limit, take: q.limit }),
      prisma.cmsContent.count({ where })
    ]);
    res.json({ items, pagination: { page: q.page, limit: q.limit, total, pages: Math.ceil(total / q.limit) } });
  } catch (error) { next(error); }
});

admin.post('/', async (req, res, next) => {
  try {
    const input = contentInput.parse(req.body);
    const existing = await prisma.cmsContent.findUnique({ where: { key: input.key } });
    if (existing) return res.status(409).json({ error: 'CONTENT_KEY_EXISTS', message: 'A CMS item with this key already exists.' });
    const publishedAt = input.status === 'PUBLISHED' ? new Date() : null;
    const item = await prisma.cmsContent.create({ data: { ...input, publishedAt, createdBy: req.auth.id, updatedBy: req.auth.id } });
    await prisma.auditLog.create({ data: { actorUserId: req.auth.id, action: 'CREATE', entityType: 'CmsContent', entityId: item.id, metadata: { status: item.status, key: item.key } } });
    res.status(201).json({ content: item });
  } catch (error) { next(error); }
});

admin.get('/:id', async (req, res, next) => {
  try {
    const item = await prisma.cmsContent.findUnique({ where: { id: req.params.id } });
    if (!item) return res.status(404).json({ error: 'CONTENT_NOT_FOUND', message: 'CMS content not found.' });
    res.json({ content: item });
  } catch (error) { next(error); }
});

admin.patch('/:id', async (req, res, next) => {
  try {
    const input = contentInput.partial().parse(req.body);
    const existing = await prisma.cmsContent.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'CONTENT_NOT_FOUND', message: 'CMS content not found.' });
    const status = input.status ?? existing.status;
    const data = { ...input, updatedBy: req.auth.id };
    if (status === 'PUBLISHED' && existing.status !== 'PUBLISHED') data.publishedAt = new Date();
    if (status !== 'PUBLISHED') data.publishedAt = null;
    const item = await prisma.cmsContent.update({ where: { id: existing.id }, data });
    await prisma.auditLog.create({ data: { actorUserId: req.auth.id, action: 'UPDATE', entityType: 'CmsContent', entityId: item.id, metadata: { fromStatus: existing.status, toStatus: item.status } } });
    res.json({ content: item });
  } catch (error) { next(error); }
});

admin.post('/:id/publish', async (req, res, next) => {
  try {
    const existing = await prisma.cmsContent.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'CONTENT_NOT_FOUND', message: 'CMS content not found.' });
    const item = await prisma.cmsContent.update({ where: { id: existing.id }, data: { status: 'PUBLISHED', publishedAt: new Date(), updatedBy: req.auth.id } });
    await prisma.auditLog.create({ data: { actorUserId: req.auth.id, action: 'STATUS_CHANGE', entityType: 'CmsContent', entityId: item.id, metadata: { from: existing.status, to: 'PUBLISHED' } } });
    res.json({ content: item });
  } catch (error) { next(error); }
});

admin.post('/:id/archive', async (req, res, next) => {
  try {
    const existing = await prisma.cmsContent.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'CONTENT_NOT_FOUND', message: 'CMS content not found.' });
    const item = await prisma.cmsContent.update({ where: { id: existing.id }, data: { status: 'ARCHIVED', publishedAt: null, updatedBy: req.auth.id } });
    await prisma.auditLog.create({ data: { actorUserId: req.auth.id, action: 'STATUS_CHANGE', entityType: 'CmsContent', entityId: item.id, metadata: { from: existing.status, to: 'ARCHIVED' } } });
    res.json({ content: item });
  } catch (error) { next(error); }
});

router.use('/admin', admin);
export default function cmsRouter() { return router; }
