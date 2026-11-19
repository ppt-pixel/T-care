import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const gardenerRoute = readFileSync(resolve(here, '../src/routes/gardener.js'), 'utf8');
const kycGuard = readFileSync(resolve(here, '../src/middleware/requireVerifiedGardener.js'), 'utf8');
const gardenerUi = readFileSync(resolve(here, '../../src/phase5.jsx'), 'utf8');

test('Gardener dashboard remains accessible before KYC while operational jobs/history stay protected', () => {
  assert.match(gardenerRoute, /router\.use\(\['\/jobs', '\/history'\],\s*requireVerifiedGardener\)/);
  assert.doesNotMatch(gardenerRoute, /router\.use\(\['\/dashboard',\s*'\/jobs',\s*'\/history'\],\s*requireVerifiedGardener\)/);
  assert.match(kycGuard, /kycStatus !== 'VERIFIED'/);
});

test('Gardener dashboard gives unverified accounts a path to submit KYC', () => {
  assert.match(gardenerUi, /Complete your verification/);
  assert.match(gardenerUi, /to="\/crew\/kyc"/);
});
