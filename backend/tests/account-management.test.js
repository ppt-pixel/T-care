import test from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcrypt';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createManagedAccount, resetManagedCustomerPassword, repairMissingGardenerProfile } from '../src/lib/adminAccounts.js';
import { publicRegistrationSchema } from '../src/lib/authValidation.js';

const here = dirname(fileURLToPath(import.meta.url));

function project(user, select) {
  if (!select) return user;
  return Object.fromEntries(Object.keys(select).filter(key => select[key]).map(key => [key, user[key]]));
}

function fakePrisma({ users = [], sessions = [], resetTokens = [] } = {}) {
  const state = {
    users: users.map(user => ({ ...user })),
    sessions: sessions.map(session => ({ ...session })),
    resetTokens: resetTokens.map(token => ({ ...token })),
    createData: null,
    updateData: null,
    auditEntries: [],
    createCount: 0
  };
  const userDelegate = {
    findUnique: async ({ where, select }) => {
      const user = state.users.find(item => where.id ? item.id === where.id : item.email === where.email);
      return user ? project(user, select) : null;
    },
    create: async ({ data, select }) => {
      state.createCount += 1;
      state.createData = data;
      if (state.users.some(user => user.email === data.email)) {
        throw Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
      }
      const user = {
        id: `user-${state.createCount}`,
        ...data,
        createdAt: new Date(),
        lastLoginAt: null,
        authVersion: 0
      };
      state.users.push(user);
      return project(user, select);
    },
    update: async ({ where, data, select }) => {
      state.updateData = data;
      const user = state.users.find(item => item.id === where.id);
      if (!user) throw Object.assign(new Error('Record not found'), { code: 'P2025' });
      if (data.authVersion?.increment) user.authVersion = (user.authVersion || 0) + data.authVersion.increment;
      if (data.passwordHash) user.passwordHash = data.passwordHash;
      return project(user, select);
    }
  };
  const transactionClient = {
    user: userDelegate,
    auditLog: {
      create: async ({ data }) => { state.auditEntries.push(data); return data; }
    },
    refreshSession: {
      updateMany: async ({ where, data }) => {
        const matches = state.sessions.filter(session => session.userId === where.userId && session.revokedAt === where.revokedAt);
        matches.forEach(session => Object.assign(session, data));
        return { count: matches.length };
      }
    },
    passwordResetToken: {
      updateMany: async ({ where, data }) => {
        const matches = state.resetTokens.filter(token => token.userId === where.userId && token.consumedAt === where.consumedAt);
        matches.forEach(token => Object.assign(token, data));
        return { count: matches.length };
      }
    },
    $queryRaw: async () => []
  };
  return {
    state,
    client: {
      user: userDelegate,
      $transaction: operation => operation(transactionClient)
    }
  };
}

const registration = {
  fullName: 'Example User',
  email: ' Example@Example.com ',
  password: 'a-customer-password',
  acceptTerms: true,
  acceptPrivacy: true
};

test('public registration always defaults to Customer and rejects Gardener role selection', () => {
  const parsed = publicRegistrationSchema.parse(registration);
  assert.equal(parsed.email, 'example@example.com');
  assert.equal(parsed.accountType, undefined);
  assert.throws(() => publicRegistrationSchema.parse({ ...registration, accountType: 'GARDENER' }), error => error.name === 'ZodError');
  assert.equal(publicRegistrationSchema.parse({ ...registration, accountType: 'CUSTOMER' }).accountType, 'CUSTOMER');

  const authRoute = readFileSync(resolve(here, '../src/routes/auth.js'), 'utf8');
  assert.match(authRoute, /role:\s*'CUSTOMER'/);
  assert.doesNotMatch(authRoute, /input\.accountType/);
});

test('Admin can create Customer and Gardener accounts with safe one-time credentials', async t => {
  for (const role of ['CUSTOMER', 'GARDENER']) {
    await t.test(role, async () => {
      const { client, state } = fakePrisma();
      const result = await createManagedAccount({
        prismaClient: client,
        actorUserId: 'admin-1',
        account: { email: `${role.toLowerCase()}@example.com`, fullName: 'Managed User', role }
      });

      assert.equal(result.user.role, role);
      assert.equal(result.user.status, 'ACTIVE');
      assert.ok(result.user.emailVerifiedAt instanceof Date);
      assert.ok(Buffer.byteLength(result.temporaryPassword, 'utf8') <= 72);
      assert.equal(await bcrypt.compare(result.temporaryPassword, state.createData.passwordHash), true);
      assert.equal(Object.hasOwn(state.createData, 'temporaryPassword'), false);
      assert.equal(state.createData.customerProfile?.create != null, role === 'CUSTOMER');
      assert.equal(state.createData.gardenerProfile?.create != null, role === 'GARDENER');
      assert.equal(state.auditEntries[0].actorUserId, 'admin-1');
      assert.doesNotMatch(JSON.stringify(state.auditEntries), new RegExp(result.temporaryPassword));
      assert.equal('passwordHash' in result.user, false);
    });
  }
});

test('duplicate account creation returns a conflict without modifying the existing record', async () => {
  const existing = { id: 'existing-1', email: 'customer@example.com', role: 'CUSTOMER', fullName: 'Existing Customer' };
  const { client, state } = fakePrisma({ users: [existing] });

  await assert.rejects(
    createManagedAccount({
      prismaClient: client,
      actorUserId: 'admin-1',
      account: { email: existing.email, fullName: 'Overwrite Attempt', role: 'GARDENER' }
    }),
    error => error.statusCode === 409 && error.code === 'EMAIL_IN_USE'
  );
  assert.equal(state.createCount, 0);
  assert.equal(state.users[0].fullName, 'Existing Customer');
  assert.equal(state.auditEntries.length, 0);
});

test('a concurrent duplicate create is rejected by the unique constraint', async () => {
  const uniqueError = Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
  const client = {
    user: { findUnique: async () => null },
    $transaction: async operation => operation({
      user: { findUnique: async () => null, create: async () => { throw uniqueError; } }
    })
  };

  await assert.rejects(
    createManagedAccount({
      prismaClient: client,
      actorUserId: 'admin-1',
      account: { email: 'race@example.com', fullName: 'Race User', role: 'CUSTOMER' }
    }),
    error => error.statusCode === 409 && error.code === 'EMAIL_IN_USE'
  );
});

test('Customer password reset changes only credentials, revokes sessions and invalidates outstanding reset tokens', async () => {
  const originalPasswordHash = await bcrypt.hash('previous-customer-password', 4);
  const { client, state } = fakePrisma({
    users: [{
      id: 'customer-1',
      email: 'customer@example.com',
      fullName: 'Existing Customer',
      role: 'CUSTOMER',
      status: 'ACTIVE',
      authVersion: 4,
      passwordHash: originalPasswordHash,
      customerProfile: { id: 'profile-1', plants: ['preserved-plant'] }
    }],
    sessions: [
      { id: 'active-session', userId: 'customer-1', revokedAt: null },
      { id: 'old-session', userId: 'customer-1', revokedAt: new Date(0) }
    ],
    resetTokens: [{ id: 'reset-1', userId: 'customer-1', consumedAt: null }]
  });

  const result = await resetManagedCustomerPassword({ prismaClient: client, actorUserId: 'admin-1', userId: 'customer-1' });
  const user = state.users[0];
  assert.equal(await bcrypt.compare(result.temporaryPassword, user.passwordHash), true);
  assert.equal(user.authVersion, 5);
  assert.equal(state.sessions[0].revokedAt instanceof Date, true);
  assert.equal(state.sessions[1].revokedAt.getTime(), 0);
  assert.equal(state.resetTokens[0].consumedAt instanceof Date, true);
  assert.deepEqual(state.updateData.authVersion, { increment: 1 });
  assert.deepEqual(Object.keys(state.updateData).sort(), ['authVersion', 'passwordHash']);
  assert.deepEqual(user.customerProfile, { id: 'profile-1', plants: ['preserved-plant'] });
  assert.equal(state.auditEntries[0].actorUserId, 'admin-1');
  assert.doesNotMatch(JSON.stringify(state.auditEntries), new RegExp(result.temporaryPassword));
  assert.equal('passwordHash' in result.user, false);
});

test('password reset refuses non-Customer and missing accounts without writes', async t => {
  for (const account of [
    { id: 'gardener-1', email: 'gardener@example.com', role: 'GARDENER' },
    null
  ]) {
    await t.test(account ? 'Gardener' : 'missing account', async () => {
      const { client, state } = fakePrisma({ users: account ? [account] : [] });
      await assert.rejects(
        resetManagedCustomerPassword({ prismaClient: client, actorUserId: 'admin-1', userId: account?.id || 'missing' }),
        error => error.statusCode === (account ? 409 : 404)
      );
      assert.equal(state.updateData, null);
      assert.equal(state.sessions.length, 0);
      assert.equal(state.auditEntries.length, 0);
    });
  }
});

test('Admin account routes stay behind authentication and Admin role checks', () => {
  const adminRoute = readFileSync(resolve(here, '../src/routes/admin.js'), 'utf8');
  assert.match(adminRoute, /router\.use\(requireAuth,\s*requireRole\('ADMIN'\)\)/);
  assert.match(adminRoute, /router\.post\('\/users'/);
  assert.match(adminRoute, /router\.get\('\/users\/lookup'/);
  assert.match(adminRoute, /router\.post\('\/users\/:id\/password-reset'/);
  assert.match(adminRoute, /role: z\.enum\(\['CUSTOMER', 'GARDENER'\]\)/);
});


test('legacy Gardener profile repair is role-checked, idempotent and does not alter account access', async t => {
  const user = { id: 'gardener-legacy', email: 'gardener@example.com', role: 'GARDENER', status: 'ACTIVE', emailVerifiedAt: new Date() };
  const state = { profile: null, profileCreates: 0, auditEntries: [] };
  const client = {
    user: { findUnique: async () => ({ id: user.id }) },
    $transaction: async operation => operation({
      $queryRaw: async () => [],
      user: { findUnique: async () => user },
      gardenerProfile: {
        findUnique: async () => state.profile,
        create: async ({ data }) => {
          state.profileCreates += 1;
          state.profile = { id: 'gardener-profile-1', ...data };
          return state.profile;
        }
      },
      auditLog: { create: async ({ data }) => { state.auditEntries.push(data); return data; } }
    })
  };

  await assert.rejects(
    repairMissingGardenerProfile({ prismaClient: client, email: user.email, confirmed: false }),
    error => error.code === 'EXPLICIT_CONFIRMATION_REQUIRED'
  );
  const repaired = await repairMissingGardenerProfile({ prismaClient: client, email: user.email, confirmed: true });
  const repeated = await repairMissingGardenerProfile({ prismaClient: client, email: user.email, confirmed: true });
  assert.equal(repaired.created, true);
  assert.equal(repaired.gardenerProfile.kycStatus, 'NOT_STARTED');
  assert.equal(repeated.created, false);
  assert.equal(state.profileCreates, 1);
  assert.equal(state.auditEntries.length, 1);
  assert.equal(user.role, 'GARDENER');
  assert.equal(user.status, 'ACTIVE');
});

test('legacy Gardener profile repair refuses non-Gardener and blocked accounts', async t => {
  for (const user of [
    { id: 'customer-1', email: 'customer@example.com', role: 'CUSTOMER', status: 'ACTIVE' },
    { id: 'blocked-1', email: 'blocked@example.com', role: 'GARDENER', status: 'BLOCKED' }
  ]) {
    await t.test(user.email, async () => {
      const client = {
        user: { findUnique: async () => ({ id: user.id }) },
        $transaction: async operation => operation({
          $queryRaw: async () => [],
          user: { findUnique: async () => user },
          gardenerProfile: { findUnique: async () => null, create: async () => { throw new Error('must not create'); } },
          auditLog: { create: async () => { throw new Error('must not audit'); } }
        })
      };
      await assert.rejects(
        repairMissingGardenerProfile({ prismaClient: client, email: user.email, confirmed: true }),
        error => error.code === (user.role === 'GARDENER' ? 'ACCOUNT_BLOCKED' : 'GARDENER_ROLE_REQUIRED')
      );
    });
  }
});
