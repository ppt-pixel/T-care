import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const authSource = readFileSync(resolve(here, '../src/routes/auth.js'), 'utf8');
const sessionStart = authSource.indexOf("router.get('/session'");
const sessionEnd = authSource.indexOf("router.get('/me'", sessionStart);
const sessionRoute = authSource.slice(sessionStart, sessionEnd);

test('session restoration rejects stale access tokens and tries a still-valid refresh session', () => {
  assert.notEqual(sessionStart, -1);
  assert.notEqual(sessionEnd, -1);
  assert.match(sessionRoute, /Number\(payload\.av\s*\?\?\s*0\)\s*!==\s*Number\(user\.authVersion\s*\?\?\s*0\)/);
  assert.match(sessionRoute, /authenticated:\s*false,\s*user:\s*null,\s*refreshRequired:\s*true/);
});
