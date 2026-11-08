import crypto from 'node:crypto';
import bcrypt from 'bcrypt';
import { prisma } from '../src/lib/prisma.js';
import { env } from '../src/config/env.js';

async function provisionAdmin() {
  const { ADMIN_EMAIL, ADMIN_INITIAL_PASSWORD } = env;
  const fullName = env.ADMIN_FULL_NAME || 'T-CARE Administrator';
  if (!ADMIN_EMAIL) {
    throw new Error('Set ADMIN_EMAIL in backend/.env before provisioning.');
  }
  const initialPassword = ADMIN_INITIAL_PASSWORD || crypto.randomBytes(24).toString('base64url');

  const email = ADMIN_EMAIL.toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email } });

  if (existing) {
    if (existing.role !== 'ADMIN') {
      throw new Error('The configured ADMIN_EMAIL already belongs to a non-admin account. No changes were made.');
    }
    console.log('An account with this email already has the ADMIN role. No changes were made.');
    return;
  }

  const passwordHash = await bcrypt.hash(initialPassword, 12);
  const created = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        email,
        fullName,
        passwordHash,
        role: 'ADMIN',
        status: 'ACTIVE',
        emailVerifiedAt: new Date()
      }
    });

    await tx.auditLog.create({
      data: {
        actorUserId: user.id,
        action: 'CREATE',
        entityType: 'User',
        entityId: user.id,
        metadata: { event: 'ADMIN_PROVISIONED_BY_CLI' }
      }
    });

    return user;
  });

  console.log(`ADMIN account provisioned: ${created.email}`);
  if (!ADMIN_INITIAL_PASSWORD) {
    console.log('One-time generated initial password (copy it now; it will not be stored in plaintext):');
    console.log(initialPassword);
  } else {
    console.log('The configured initial password was hashed and was not printed.');
  }
  console.log('Store the initial password securely. A self-service password-change endpoint is still to be completed before production launch.');
}

try {
  await provisionAdmin();
} catch (error) {
  console.error('ADMIN provisioning failed:', error?.message || 'Unknown error');
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
