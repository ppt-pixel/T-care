import test from 'node:test';
import assert from 'node:assert/strict';
import { workspaceForRole, usesWorkspaceSidebar } from '../src/authNavigation.js';

test('authenticated roles resolve to their own workspace', () => {
  assert.equal(workspaceForRole('CUSTOMER'), '/garden');
  assert.equal(workspaceForRole('GARDENER'), '/crew');
  assert.equal(workspaceForRole('ADMIN'), '/hq');
});

test('all authenticated roles use the workspace sidebar', () => {
  assert.equal(usesWorkspaceSidebar('garden'), true);
  assert.equal(usesWorkspaceSidebar('crew'), true);
  assert.equal(usesWorkspaceSidebar('hq'), true);
  assert.equal(usesWorkspaceSidebar('public'), false);
});
