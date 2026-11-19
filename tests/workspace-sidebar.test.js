import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8');

test('Customer sidebar includes a direct Book a service destination', () => {
  assert.match(source, /garden:\{label:'Customer',base:'\/garden',nav:\[\['','Today',LayoutGrid\],\['book','Book a service',CalendarDays\]/);
});

test('workspace shell no longer renders the legacy bottom dock', () => {
  assert.doesNotMatch(source, /<Dock\b/);
  assert.match(source, /<WorkspaceSidebar R=\{R\}/);
});

test('sidebar derives its workspace role from the current route', () => {
  assert.match(source, /function WorkspaceSidebar\([\s\S]*?const role=roleOf\(pathname\)/);
});
