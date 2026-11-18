import test from 'node:test';
import assert from 'node:assert/strict';
import { workspaceForRole } from '../src/authNavigation.js';

test('authenticated roles resolve to their own workspace', () => {
  assert.equal(workspaceForRole('CUSTOMER'), '/garden');
  assert.equal(workspaceForRole('GARDENER'), '/crew');
  assert.equal(workspaceForRole('ADMIN'), '/hq');
});
