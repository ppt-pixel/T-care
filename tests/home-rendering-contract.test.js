import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const main = fs.readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8');

test('homepage reads authReady from app context before passing it to the public Plant Store section', () => {
  const homeStart = main.indexOf('function Home(){');
  const homeEnd = main.indexOf('\n\n/* ---------- reusable loading and error states ---------- */', homeStart);
  assert.notEqual(homeStart, -1, 'Home component must exist');
  assert.notEqual(homeEnd, -1, 'Home component boundary must exist');

  const home = main.slice(homeStart, homeEnd);
  assert.match(home, /const\s*\{[^}]*\bauthReady\b[^}]*\}\s*=\s*useApp\(\)/);
  assert.match(home, /<Market[^>]*\bauthReady=\{authReady\}/);
});
