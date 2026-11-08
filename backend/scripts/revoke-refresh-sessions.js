import { prisma } from '../src/lib/prisma.js';

try {
  const result = await prisma.refreshSession.updateMany({
    where: { revokedAt: null },
    data: { revokedAt: new Date() }
  });
  console.log(`Revoked ${result.count} active refresh session(s). All users must sign in again.`);
  console.log('Previously issued access tokens remain valid only until their short expiry (ACCESS_TOKEN_TTL).');
} catch (error) {
  console.error('Could not revoke refresh sessions:', error?.message || 'Unknown error');
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
