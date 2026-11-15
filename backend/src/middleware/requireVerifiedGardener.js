import { prisma } from '../lib/prisma.js';

export async function requireVerifiedGardener(req, res, next) {
  const gardener = await prisma.gardenerProfile.findUnique({
    where: { userId: req.auth.id },
    select: { kycStatus: true }
  });
  if (!gardener || gardener.kycStatus !== 'VERIFIED') {
    return res.status(403).json({
      error: 'GARDENER_KYC_REQUIRED',
      message: 'Verified Gardener status is required to access assigned jobs and service reports.'
    });
  }
  return next();
}
