import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { findLoginAccount } from '../src/lib/loginAccount.js';

const here = dirname(fileURLToPath(import.meta.url));
const authRoute = readFileSync(resolve(here, '../src/routes/auth.js'), 'utf8');
const accountHelper = readFileSync(resolve(here, '../src/lib/adminAccounts.js'), 'utf8');
const provisioner = readFileSync(resolve(here, '../scripts/provision-admin.js'), 'utf8');
const diagnostic = readFileSync(resolve(here, '../scripts/diagnose-auth-accounts.js'), 'utf8');
const repair = readFileSync(resolve(here, '../scripts/reset-role-account-password.js'), 'utf8');

const loginStart = authRoute.indexOf("router.post('/login'");
const loginEnd = authRoute.indexOf("router.post('/change-password'", loginStart);
const loginRoute = authRoute.slice(loginStart, loginEnd);

test('Admin, Gardener and Customer use the same role-neutral login route', () => {
  assert.notEqual(loginStart, -1);
  assert.match(loginRoute, /findLoginAccount\(prisma, input\.email\)/);
  assert.match(loginRoute, /bcrypt\.compare\(input\.password, user\.passwordHash\)/);
  assert.match(loginRoute, /if \(!user\.emailVerifiedAt\)/);
  assert.match(loginRoute, /if \(user\.status !== 'ACTIVE'\)/);
  assert.doesNotMatch(loginRoute, /user\.role\s*!==|role\s*===\s*'CUSTOMER'|role\s*===\s*'GARDENER'|role\s*===\s*'ADMIN'/);
});

test('Admin-created Gardeners are ACTIVE, email-verified, and get a Gardener profile', () => {
  assert.match(accountHelper, /role,\s*status:\s*'ACTIVE'/);
  assert.match(accountHelper, /emailVerifiedAt:\s*verifiedAt/);
  assert.match(accountHelper, /gardenerProfile:\s*\{\s*create:\s*\{\s*kycStatus:\s*'NOT_STARTED'/);
});

test('Admin provisioning remains an explicit CLI action and refuses role escalation', () => {
  assert.match(provisioner, /ADMIN_EMAIL/);
  assert.match(provisioner, /existing\.role !== 'ADMIN'/);
  assert.match(provisioner, /ADMIN_PROVISIONED_BY_CLI/);
});

test('account diagnostic never selects or prints password hashes or session tokens', () => {
  assert.match(diagnostic, /emailVerifiedAt/);
  assert.match(diagnostic, /gardenerProfile/);
  assert.doesNotMatch(diagnostic, /passwordHash|tcare_access|tcare_refresh/);
});

test('managed account password repair requires exact role and explicit legacy-state confirmations', () => {
  assert.match(repair, /ACCOUNT_RESET_ROLE/);
  assert.match(repair, /ACCOUNT_RESET_CONFIRM_EMAIL_VERIFIED/);
  assert.match(repair, /ACCOUNT_RESET_CONFIRM_ACTIVATION/);
  assert.match(repair, /user\.role !== role/);
  assert.match(repair, /user\.status === 'BLOCKED'/);
  assert.match(repair, /authVersion:\s*\{\s*increment:\s*1\s*\}/);
  assert.match(repair, /refreshSession\.updateMany/);
  assert.doesNotMatch(repair, /console\.log\([^\n]*password\)/i);
});


test('login resolves legacy email casing but refuses ambiguous case-only duplicates', async t => {
  await t.test('single legacy mixed-case record', async () => {
    const legacy = { id: 'g-1', email: 'Gardener@Example.com', role: 'GARDENER' };
    let query;
    const result = await findLoginAccount({ user: { findMany: async value => { query = value; return [legacy]; } } }, 'gardener@example.com');
    assert.equal(result, legacy);
    assert.deepEqual(query.where.email, { equals: 'gardener@example.com', mode: 'insensitive' });
    assert.equal(query.take, 2);
  });
  await t.test('case-only duplicates fail closed', async () => {
    const matches = [
      { id: 'one', email: 'admin@example.com' },
      { id: 'two', email: 'Admin@example.com' }
    ];
    const result = await findLoginAccount({ user: { findMany: async () => matches } }, 'admin@example.com');
    assert.equal(result, null);
  });
});
