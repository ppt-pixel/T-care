import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const root = new URL('../', import.meta.url);
const read = path => fs.readFileSync(new URL(path, root), 'utf8');
const main = read('src/main.jsx');
const phase5 = read('src/phase5.jsx');
const publicPages = read('src/landing/Pages.jsx');
const storePages = read('src/store/StoreCheckout.jsx');

test('large workspace, public-page and checkout modules are not statically imported by the app entry', () => {
  assert.doesNotMatch(main, /import\s+\*\s+as\s+Phase5\s+from\s+['"]\.\/phase5\.jsx['"]/);
  assert.doesNotMatch(main, /from\s+['"]\.\/landing\/Pages\.jsx['"]/);
  assert.doesNotMatch(main, /from\s+['"]\.\/store\/StoreCheckout\.jsx['"]/);
  assert.match(main, /import\('\.\/phase5\.jsx'\)/);
  assert.match(main, /import\('\.\/landing\/Pages\.jsx'\)/);
  assert.match(main, /import\('\.\/store\/StoreCheckout\.jsx'\)/);
});

test('every lazy public-page export exists in the public page module', () => {
  const names = [...main.matchAll(/const\s+(\w+)\s*=\s*lazyPublicPage\('([^']+)'\)/g)];
  assert.ok(names.length > 0, 'public pages must be lazy-loaded');
  for (const [, , exportName] of names) {
    assert.match(publicPages, new RegExp(`export\\s+function\\s+${exportName}\\b`), `${exportName} must be exported`);
  }
});

test('every lazy store-page export exists in the store module', () => {
  const names = [...main.matchAll(/const\s+(\w+)\s*=\s*lazyStorePage\('([^']+)'\)/g)];
  assert.ok(names.length > 0, 'store pages must be lazy-loaded');
  for (const [, , exportName] of names) {
    assert.match(storePages, new RegExp(`export\\s+function\\s+${exportName}\\b`), `${exportName} must be exported`);
  }
});

test('every lazy workspace-page export exists in the workspace module', () => {
  const names = [...main.matchAll(/const\s+(\w+)\s*=\s*lazyWorkspacePage\('([^']+)'\)/g)];
  assert.ok(names.length >= 30, 'all workspace pages should be lazy-loaded');
  for (const [, , exportName] of names) {
    assert.match(phase5, new RegExp(`export\\s+function\\s+${exportName}\\b`), `${exportName} must be exported`);
  }
});

test('lazy routes render through a visible Suspense fallback', () => {
  assert.match(main, /React\.Suspense\s+fallback=\{<LoadingState\s+label="Loading page…"\s*\/>\}/);
  assert.match(main, /<Routes\s+location=\{loc\}>/);
});


test('homepage product catalogue requests only the eight products it renders', () => {
  const sections = read('src/landing/Sections.jsx');
  assert.match(sections, /usePublicList\('\/products\?limit=8','products'\)/);
  assert.match(sections, /products\.slice\(0,8\)/);
});

test('homepage product images stay lazy and decode asynchronously', () => {
  const sections = read('src/landing/Sections.jsx');
  assert.match(sections, /loading="lazy" decoding="async"/);
  const landingCss = read('src/landing/landing.css');
  assert.match(landingCss, /\.pimg img\s*\{[^}]*object-fit:cover/s);
});
