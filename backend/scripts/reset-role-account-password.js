import 'dotenv/config';
import bcrypt from 'bcrypt';
import { prisma } from '../src/lib/prisma.js';

const email = String(process.env.ACCOUNT_RESET_EMAIL || '').trim().toLowerCase();
const role = String(process.env.ACCOUNT_RESET_ROLE || '').trim().toUpperCase();
const password = String(process.env.ACCOUNT_RESET_PASSWORD || '');
const confirmEmail = String(process.env.ACCOUNT_RESET_CONFIRM_EMAIL_VERIFIED || '').trim().toLowerCase() === 'true';
const confirmActivation = String(process.env.ACCOUNT_RESET_CONFIRM_ACTIVATION || '').trim().toLowerCase() === 'true';

function fail(message) { throw new Error(message); }

async function run() {
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail('Set ACCOUNT_RESET_EMAIL to the exact account email.');
  if (!['ADMIN', 'GARDENER'].includes(role)) fail('ACCOUNT_RESET_ROLE must be ADMIN or GARDENER.');
  if (password.length < 12 || Buffer.byteLength(password, 'utf8') > 72) {
    fail('ACCOUNT_RESET_PASSWORD must contain at least 12 characters and no more than 72 UTF-8 bytes.');
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const result = await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "email" = ${email} FOR UPDATE`;
    const user = await tx.user.findUnique({
      where: { email },
      select: { id: true, email: true, role: true, status: true, emailVerifiedAt: true, gardenerProfile: { select: { id: true } } }
    });
    if (!user) fail('No account exists for this email in the configured database.');
    if (user.role !== role) fail(`Role mismatch: this email belongs to ${user.role}, not ${role}. No changes were made.`);
    if (role === 'GARDENER' && !user.gardenerProfile) fail('The GARDENER account has no Gardener profile. No changes were made.');
    if (user.status === 'BLOCKED') fail('This account is BLOCKED. Password reset will not override an explicit security block.');
    if (!user.emailVerifiedAt && !confirmEmail) fail('Email is not verified. Confirm the email address with its owner, then set ACCOUNT_RESET_CONFIRM_EMAIL_VERIFIED=true.');
    if (user.status !== 'ACTIVE' && !confirmActivation) fail(`Account status is ${user.status}. Set ACCOUNT_RESET_CONFIRM_ACTIVATION=true only after confirming Admin approval to reactivate it.`);

    const now = new Date();
    const updated = await tx.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        authVersion: { increment: 1 },
        ...(user.emailVerifiedAt ? {} : { emailVerifiedAt: now }),
        ...(user.status === 'ACTIVE' ? {} : { status: 'ACTIVE' })
      },
      select: { id: true, email: true, role: true, status: true, emailVerifiedAt: true }
    });
    const revoked = await tx.refreshSession.updateMany({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: now }
    });
    await tx.passwordResetToken.updateMany({
      where: { userId: user.id, consumedAt: null },
      data: { consumedAt: now }
    });
    await tx.auditLog.create({
      data: {
        actorUserId: null,
        action: 'UPDATE',
        entityType: 'User',
        entityId: user.id,
        metadata: {
          event: 'ROLE_ACCOUNT_ACCESS_REPAIRED_BY_OPERATOR',
          role: user.role,
          emailVerified: !user.emailVerifiedAt,
          activated: user.status !== 'ACTIVE',
          refreshSessionsRevoked: revoked.count
        }
      }
    });
    return { user: updated, revokedSessions: revoked.count };
  });

  console.log(`Account credentials reset for ${result.user.email} (${result.user.role}).`);
  console.log(`Status: ${result.user.status}; email verified: ${Boolean(result.user.emailVerifiedAt)}; active refresh sessions revoked: ${result.revokedSessions}.`);
  console.log('The new password was not printed. Share it with the account owner through a trusted channel.');
}

try {
  await run();
} catch (error) {
  console.error('Account password reset failed:', error?.message || 'Unknown error');
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
