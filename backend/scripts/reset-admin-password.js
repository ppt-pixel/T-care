import bcrypt from 'bcrypt';
import { prisma } from '../src/lib/prisma.js';
import { env } from '../src/config/env.js';

async function resetAdminPassword() {
  const { ADMIN_EMAIL, ADMIN_RESET_PASSWORD } = env;
  if (!ADMIN_EMAIL) throw new Error('Set ADMIN_EMAIL in backend/.env before resetting an Admin password.');
  if (!ADMIN_RESET_PASSWORD) throw new Error('Set ADMIN_RESET_PASSWORD in backend/.env for this explicit password reset.');
  if (Buffer.byteLength(ADMIN_RESET_PASSWORD, 'utf8') > 72) {
    throw new Error("ADMIN_RESET_PASSWORD must not exceed bcrypt's 72-byte limit.");
  }

  const email = ADMIN_EMAIL.trim().toLowerCase();
  const existing = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, role: true }
  });
  if (!existing) throw new Error('No account exists for ADMIN_EMAIL.');
  if (existing.role !== 'ADMIN') throw new Error('ADMIN_EMAIL belongs to a non-admin account. No changes were made.');

  const passwordHash = await bcrypt.hash(ADMIN_RESET_PASSWORD, 12);
  const revokedAt = new Date();
  const revokedCount = await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${existing.id} FOR UPDATE`;
    const current = await tx.user.findUnique({ where: { id: existing.id }, select: { role: true } });
    if (!current || current.role !== 'ADMIN') {
      throw new Error('The configured account is no longer an Admin. No changes were made.');
    }

    await tx.user.update({ where: { id: existing.id }, data: { passwordHash } });
    const revoked = await tx.refreshSession.updateMany({
      where: { userId: existing.id, revokedAt: null },
      data: { revokedAt }
    });
    await tx.auditLog.create({
      data: {
        actorUserId: null,
        action: 'UPDATE',
        entityType: 'User',
        entityId: existing.id,
        metadata: { event: 'ADMIN_PASSWORD_RESET_BY_CLI', refreshSessionsRevoked: revoked.count }
      }
    });
    return revoked.count;
  });

  console.log(`Admin password reset for ${existing.email}; ${revokedCount} active refresh session(s) revoked.`);
  console.log('Remove ADMIN_RESET_PASSWORD from backend/.env after this command.');
}

try {
  await resetAdminPassword();
} catch (error) {
  console.error('Admin password reset failed:', error?.message || 'Unknown error');
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
