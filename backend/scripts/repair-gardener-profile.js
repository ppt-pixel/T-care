import 'dotenv/config';
import { prisma } from '../src/lib/prisma.js';
import { repairMissingGardenerProfile } from '../src/lib/adminAccounts.js';

const email = String(process.env.GARDENER_PROFILE_REPAIR_EMAIL || '').trim().toLowerCase();
const confirmed = String(process.env.GARDENER_PROFILE_REPAIR_CONFIRM || '').trim().toLowerCase() === 'true';

try {
  if (!email) throw new Error('Set GARDENER_PROFILE_REPAIR_EMAIL to the exact registered Gardener email.');
  const result = await repairMissingGardenerProfile({ prismaClient: prisma, email, confirmed });
  console.log(result.created
    ? `Missing Gardener profile created for ${result.user.email}; KYC status is NOT_STARTED.`
    : `Gardener profile already exists for ${result.user.email}; no changes were made.`);
  console.log(`Account status: ${result.user.status}; email verified: ${Boolean(result.user.emailVerifiedAt)}.`);
  console.log('This command does not change the account role, status, email verification, password, or business history.');
} catch (error) {
  console.error('Gardener profile repair failed:', error?.message || 'Unknown error');
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
