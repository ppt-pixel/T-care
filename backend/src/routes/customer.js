import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { createSignedDownloadUrl, removeObject } from '../lib/supabaseStorage.js';

const router = Router();
router.use(requireAuth, requireRole('CUSTOMER'));

const addressSchema = z.object({
  label: z.string().trim().min(1).max(80),
  type: z.enum(['HOME', 'OFFICE', 'OTHER']).default('HOME'),
  line1: z.string().trim().min(1).max(200),
  line2: z.string().trim().max(200).optional(),
  city: z.string().trim().min(1).max(80),
  state: z.string().trim().min(1).max(80),
  postalCode: z.string().trim().min(3).max(20),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  isDefault: z.boolean().default(false)
});

const plantSchema = z.object({
  name: z.string().trim().min(1).max(120),
  type: z.string().trim().max(120).optional(),
  locationInHome: z.string().trim().max(160).optional(),
  notes: z.string().trim().max(2000).optional(),
  nextCareAt: z.coerce.date().optional()
});


async function withSignedPlantPhotos(plants, userId) {
  const rows = Array.isArray(plants) ? plants : [plants];
  const keys = [...new Set(rows.flatMap(plant => (plant.photos || []).map(photo => photo.objectKey)))];
  if (!keys.length) return Array.isArray(plants) ? rows : rows[0];
  const assets = await prisma.mediaAsset.findMany({ where: { ownerUserId: userId, kind: 'PLANT_PHOTO', status: 'UPLOADED', objectKey: { in: keys } }, select: { id: true, objectKey: true } });
  const byKey = new Map(assets.map(asset => [asset.objectKey, asset]));
  const hydrated = await Promise.all(rows.map(async plant => ({ ...plant, photos: await Promise.all((plant.photos || []).map(async photo => {
    const asset = byKey.get(photo.objectKey);
    let url = photo.url || null;
    if (asset) { try { url = (await createSignedDownloadUrl(asset.objectKey, 300)).url; } catch { /* keep an empty preview if Storage is temporarily unavailable */ } }
    return { ...photo, mediaAssetId: asset?.id || null, url };
  })) })));
  return Array.isArray(plants) ? hydrated : hydrated[0];
}

async function getCustomer(userId) {
  const customer = await prisma.customerProfile.findUnique({ where: { userId } });
  if (!customer) throw Object.assign(new Error('Customer profile not found.'), { statusCode: 404, code: 'CUSTOMER_PROFILE_NOT_FOUND' });
  return customer;
}

router.get('/profile', async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.auth.id },
      select: { id: true, email: true, fullName: true, phone: true, role: true, status: true }
    });
    return res.json({ user });
  } catch (error) { next(error); }
});

router.patch('/profile', async (req, res, next) => {
  try {
    const input = z.object({ fullName: z.string().trim().min(2).max(120), phone: z.string().trim().max(30).nullable().optional() }).parse(req.body);
    const user = await prisma.user.update({ where: { id: req.auth.id }, data: input, select: { id: true, email: true, fullName: true, phone: true, role: true, status: true } });
    return res.json({ user });
  } catch (error) { next(error); }
});

router.get('/addresses', async (req, res, next) => {
  try {
    const customer = await getCustomer(req.auth.id);
    const addresses = await prisma.address.findMany({ where: { customerId: customer.id }, orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }] });
    return res.json({ addresses });
  } catch (error) { next(error); }
});

router.post('/addresses', async (req, res, next) => {
  try {
    const customer = await getCustomer(req.auth.id);
    const input = addressSchema.parse(req.body);
    const address = await prisma.$transaction(async (tx) => {
      if (input.isDefault) await tx.address.updateMany({ where: { customerId: customer.id }, data: { isDefault: false } });
      return tx.address.create({ data: { ...input, customerId: customer.id } });
    });
    return res.status(201).json({ address });
  } catch (error) { next(error); }
});

router.patch('/addresses/:id', async (req, res, next) => {
  try {
    const customer = await getCustomer(req.auth.id);
    const input = addressSchema.partial().parse(req.body);
    const existing = await prisma.address.findFirst({ where: { id: req.params.id, customerId: customer.id } });
    if (!existing) return res.status(404).json({ error: 'ADDRESS_NOT_FOUND', message: 'Address not found.' });
    const address = await prisma.$transaction(async (tx) => {
      if (input.isDefault) await tx.address.updateMany({ where: { customerId: customer.id }, data: { isDefault: false } });
      return tx.address.update({ where: { id: existing.id }, data: input });
    });
    return res.json({ address });
  } catch (error) { next(error); }
});

router.delete('/addresses/:id', async (req, res, next) => {
  try {
    const customer = await getCustomer(req.auth.id);
    const existing = await prisma.address.findFirst({ where: { id: req.params.id, customerId: customer.id } });
    if (!existing) return res.status(404).json({ error: 'ADDRESS_NOT_FOUND', message: 'Address not found.' });
    await prisma.$transaction(async tx => {
      await tx.address.delete({ where: { id: existing.id } });
      if (existing.isDefault) {
        const nextDefault = await tx.address.findFirst({ where: { customerId: customer.id }, orderBy: { createdAt: 'desc' }, select: { id: true } });
        if (nextDefault) await tx.address.update({ where: { id: nextDefault.id }, data: { isDefault: true } });
      }
      await tx.auditLog.create({ data: { actorUserId: req.auth.id, action: 'DELETE', entityType: 'Address', entityId: existing.id, metadata: { label: existing.label, wasDefault: existing.isDefault } } });
    });
    return res.status(204).send();
  } catch (error) { next(error); }
});

router.get('/plants', async (req, res, next) => {
  try {
    const customer = await getCustomer(req.auth.id);
    const plants = await prisma.plant.findMany({ where: { customerId: customer.id }, include: { photos: { orderBy: { createdAt: 'desc' } }, careRecords: { orderBy: { recordedAt: 'desc' }, take: 5 } }, orderBy: { updatedAt: 'desc' } });
    return res.json({ plants: await withSignedPlantPhotos(plants, req.auth.id) });
  } catch (error) { next(error); }
});

router.post('/plants', async (req, res, next) => {
  try {
    const customer = await getCustomer(req.auth.id);
    const input = plantSchema.parse(req.body);
    const plant = await prisma.plant.create({ data: { ...input, customerId: customer.id } });
    return res.status(201).json({ plant });
  } catch (error) { next(error); }
});

router.get('/plants/:id', async (req, res, next) => {
  try {
    const customer = await getCustomer(req.auth.id);
    const plant = await prisma.plant.findFirst({ where: { id: req.params.id, customerId: customer.id }, include: { photos: true, careRecords: { orderBy: { recordedAt: 'desc' } } } });
    if (!plant) return res.status(404).json({ error: 'PLANT_NOT_FOUND', message: 'Plant not found.' });
    return res.json({ plant: await withSignedPlantPhotos(plant, req.auth.id) });
  } catch (error) { next(error); }
});


router.post('/plants/:id/photos', async (req, res, next) => {
  try {
    const customer = await getCustomer(req.auth.id);
    const input = z.object({ objectKey: z.string().trim().min(1).max(500), altText: z.string().trim().max(500).optional() }).strict().parse(req.body);
    const plant = await prisma.plant.findFirst({ where: { id: req.params.id, customerId: customer.id }, select: { id: true } });
    if (!plant) return res.status(404).json({ error: 'PLANT_NOT_FOUND', message: 'Plant not found.' });
    const asset = await prisma.mediaAsset.findFirst({ where: { ownerUserId: req.auth.id, objectKey: input.objectKey, kind: 'PLANT_PHOTO', targetType: 'PLANT', targetId: plant.id, status: 'UPLOADED' } });
    if (!asset) return res.status(409).json({ error: 'PLANT_MEDIA_NOT_READY', message: 'Upload and complete this plant photo in T-CARE Storage before linking it.' });
    const photo = await prisma.plantPhoto.create({ data: { plantId: plant.id, objectKey: asset.objectKey, altText: input.altText || null } });
    await prisma.auditLog.create({ data: { actorUserId: req.auth.id, action: 'CREATE', entityType: 'PlantPhoto', entityId: photo.id, metadata: { plantId: plant.id, mediaAssetId: asset.id } } });
    const signed = await createSignedDownloadUrl(asset.objectKey, 300);
    return res.status(201).json({ photo: { ...photo, mediaAssetId: asset.id, url: signed.url } });
  } catch (error) { next(error); }
});

router.delete('/plants/:id/photos/:photoId', async (req, res, next) => {
  try {
    const customer = await getCustomer(req.auth.id);
    const plant = await prisma.plant.findFirst({ where: { id: req.params.id, customerId: customer.id }, select: { id: true } });
    if (!plant) return res.status(404).json({ error: 'PLANT_NOT_FOUND', message: 'Plant not found.' });
    const photo = await prisma.plantPhoto.findFirst({ where: { id: req.params.photoId, plantId: plant.id } });
    if (!photo) return res.status(404).json({ error: 'PLANT_PHOTO_NOT_FOUND', message: 'Plant photo not found.' });
    const asset = await prisma.mediaAsset.findFirst({ where: { ownerUserId: req.auth.id, objectKey: photo.objectKey, kind: 'PLANT_PHOTO' } });
    if (asset && asset.status !== 'DELETED') { await removeObject(asset.objectKey); await prisma.mediaAsset.update({ where: { id: asset.id }, data: { status: 'DELETED' } }); }
    await prisma.plantPhoto.delete({ where: { id: photo.id } });
    await prisma.auditLog.create({ data: { actorUserId: req.auth.id, action: 'DELETE', entityType: 'PlantPhoto', entityId: photo.id, metadata: { plantId: plant.id, mediaAssetId: asset?.id || null } } });
    return res.status(204).send();
  } catch (error) { next(error); }
});

router.patch('/plants/:id', async (req, res, next) => {
  try {
    const customer = await getCustomer(req.auth.id);
    const input = plantSchema.partial().parse(req.body);
    const existing = await prisma.plant.findFirst({ where: { id: req.params.id, customerId: customer.id } });
    if (!existing) return res.status(404).json({ error: 'PLANT_NOT_FOUND', message: 'Plant not found.' });
    const plant = await prisma.plant.update({ where: { id: existing.id }, data: input });
    return res.json({ plant });
  } catch (error) { next(error); }
});

router.delete('/plants/:id', async (req, res, next) => {
  try {
    const customer = await getCustomer(req.auth.id);
    const result = await prisma.plant.deleteMany({ where: { id: req.params.id, customerId: customer.id } });
    if (!result.count) return res.status(404).json({ error: 'PLANT_NOT_FOUND', message: 'Plant not found.' });
    return res.status(204).send();
  } catch (error) { next(error); }
});

export default function customerRouter() { return router; }
