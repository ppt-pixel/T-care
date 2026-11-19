import 'dotenv/config';
import { prisma } from '../src/lib/prisma.js';

const emails = process.argv.slice(2)
  .map(value => String(value).trim().toLowerCase())
  .filter(Boolean);

if (!emails.length) {
  console.error('Usage: npm run auth:diagnose -- admin@example.com gardener@example.com');
  process.exitCode = 2;
} else {
  try {
    for (const email of [...new Set(emails)]) {
      const matches = await prisma.user.findMany({
        where: { email: { equals: email, mode: 'insensitive' } },
        select: {
          id: true,
          email: true,
          fullName: true,
          role: true,
          status: true,
          emailVerifiedAt: true,
          authVersion: true,
          customerProfile: { select: { id: true } },
          gardenerProfile: { select: { id: true, kycStatus: true } }
        },
        take: 3
      });

      if (!matches.length) {
        console.log(JSON.stringify({ email, exists: false, diagnosis: 'ACCOUNT_NOT_FOUND_IN_THIS_DATABASE' }, null, 2));
        continue;
      }
      if (matches.length > 1) {
        console.log(JSON.stringify({
          email, exists: true, diagnosis: 'AMBIGUOUS_CASE_INSENSITIVE_EMAIL_MATCHES',
          matches: matches.map(match => ({ id: match.id, email: match.email, role: match.role, status: match.status }))
        }, null, 2));
        continue;
      }

      const user = matches[0];
      const blockers = [];
      if (user.email !== email) blockers.push('EMAIL_STORED_WITH_DIFFERENT_CASE');
      if (user.status !== 'ACTIVE') blockers.push(`ACCOUNT_STATUS_${user.status}`);
      if (!user.emailVerifiedAt) blockers.push('EMAIL_NOT_VERIFIED');
      if (user.role === 'GARDENER' && !user.gardenerProfile) blockers.push('GARDENER_PROFILE_MISSING');
      if (user.role === 'CUSTOMER' && !user.customerProfile) blockers.push('CUSTOMER_PROFILE_MISSING');

      const notes = [];
      if (user.role === 'GARDENER' && user.gardenerProfile && user.gardenerProfile.kycStatus !== 'VERIFIED') {
        notes.push('KYC_NOT_VERIFIED: authentication should still work; job/history access remains restricted until KYC is approved.');
      }
      if (user.role === 'CUSTOMER') notes.push('This address belongs to a CUSTOMER account; it cannot sign in as ADMIN or GARDENER.');
      if (user.email !== email) notes.push('The login route accepts case-insensitive matching for this legacy email; normalize the stored email during a reviewed maintenance window.');

      console.log(JSON.stringify({
        email: user.email,
        exists: true,
        id: user.id,
        fullName: user.fullName,
        role: user.role,
        status: user.status,
        emailVerifiedAt: user.emailVerifiedAt,
        authVersion: user.authVersion,
        hasCustomerProfile: Boolean(user.customerProfile),
        gardenerProfile: user.gardenerProfile ? { id: user.gardenerProfile.id, kycStatus: user.gardenerProfile.kycStatus } : null,
        loginEligibleByAccountState: blockers.length === 0,
        blockers,
        notes
      }, null, 2));
    }
  } catch (error) {
    console.error('Account diagnostic failed.');
    if (error?.code === 'P2022' || error?.code === 'P2021') {
      console.error('The deployed database schema may be missing a required migration. Check `npx prisma migrate status` before changing account records.');
    } else {
      console.error(error?.code || error?.message || 'Unknown database error');
    }
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}
