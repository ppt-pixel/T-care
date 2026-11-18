import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const backendRoot = resolve(here, '..');
const packageJson = JSON.parse(readFileSync(resolve(backendRoot, 'package.json'), 'utf8'));
const provisionScript = readFileSync(resolve(backendRoot, 'scripts/provision-admin.js'), 'utf8');

test('Admin CLI commands generate Prisma Client before running', () => {
  assert.equal(packageJson.scripts['preadmin:provision'], 'npm run prisma:generate');
  assert.equal(packageJson.scripts['preadmin:reset-password'], 'npm run prisma:generate');
});

test('initial Admin provisioning rejects passwords beyond bcrypt byte limit before database access', () => {
  const validation = provisionScript.indexOf("Buffer.byteLength(initialPassword, 'utf8') > 72");
  const databaseLookup = provisionScript.indexOf('prisma.user.findUnique');
  assert.ok(validation >= 0);
  assert.ok(databaseLookup > validation);
});

test('Admin provisioning instructions do not claim password recovery is unavailable', () => {
  assert.doesNotMatch(provisionScript, /forgotten-password flow is not available yet/);
});
