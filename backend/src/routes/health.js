import { Router } from 'express';
import { prisma } from '../lib/prisma.js';

const router = Router();

router.get('/', async (req, res) => {
  let database = 'ok';
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    database = 'unavailable';
  }

  res.json({
    service: 't-care-backend',
    status: database === 'ok' ? 'ok' : 'degraded',
    database,
    environment: process.env.NODE_ENV || 'development'
  });
});

export default router;
