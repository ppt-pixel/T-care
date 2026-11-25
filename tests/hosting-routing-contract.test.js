import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(new URL(path, import.meta.url), 'utf8');

test('Hostinger Apache config preserves assets and sends frontend deep links to the SPA entry', () => {
  const htaccess = read('../public/.htaccess');
  assert.match(htaccess, /RewriteRule\s+\^api\(\?:\/\|\$\)\s+-\s+\[L\]/);
  assert.match(htaccess, /RewriteCond\s+%\{REQUEST_FILENAME\}\s+-f\s+\[OR\]/);
  assert.match(htaccess, /RewriteCond\s+%\{REQUEST_FILENAME\}\s+-d/);
  assert.match(htaccess, /RewriteRule\s+\^\s+index\.html\s+\[L\]/);
});

test('Hostinger cache policy revalidates the SPA shell and only long-caches fingerprinted build assets', () => {
  const htaccess = read('../public/.htaccess');
  const htmlPolicy = htaccess.match(/<FilesMatch \"[^\"]*html[^\"]*\">([\s\S]*?)<\/FilesMatch>/i)?.[1];
  const immutablePolicy = htaccess.match(/<FilesMatch \"\^\[\^\/\]\+?-[^\"]+\">([\s\S]*?)<\/FilesMatch>/)?.[1];
  assert.match(htaccess, /Header always set Cache-Control \"no-cache, max-age=0, must-revalidate\"/);
  assert.match(htaccess, /<IfModule LiteSpeed>[\s\S]*?\[E=Cache-Control:no-cache\]/);
  assert.match(htaccess, /REQUEST_URI\} !\^\/assets\//);
  assert.ok(htmlPolicy, 'HTML must have a dedicated cache policy');
  assert.match(htmlPolicy, /no-store, no-cache, must-revalidate, max-age=0/);
  assert.ok(immutablePolicy, 'fingerprinted build assets must have a dedicated cache policy');
  assert.match(immutablePolicy, /public, max-age=31536000, immutable/);
  assert.ok(htaccess.includes(String.raw`[A-Za-z0-9_-]{8,}`), 'the immutable cache rule must require a content-hash suffix');
  assert.match(htaccess, /Header always set Expires \"0\"/);
});

test('Netlify API proxy is evaluated before its SPA catch-all rewrite', () => {
  const redirects = read('../public/_redirects');
  const lines = redirects.split(/\r?\n/).map(line => line.trim());
  const apiRule = lines.findIndex(line => line.startsWith('/api/*'));
  const spaRule = lines.findIndex(line => line === '/*      /index.html                                  200');
  assert.notEqual(apiRule, -1);
  assert.notEqual(spaRule, -1);
  assert.ok(apiRule < spaRule);
  assert.match(redirects, /https:\/\/t-care-api\.onrender\.com\/api\/:splat/);
});

test('frontend entry points share the build-time VITE_API_BASE_URL contract', () => {
  const main = read('../src/main.jsx');
  const api = read('../src/phase5Api.js');
  assert.match(main, /import\.meta\.env\.VITE_API_BASE_URL/);
  assert.match(api, /import\.meta\.env\.VITE_API_BASE_URL/);
  assert.match(main, /import\.meta\.env\.PROD\s*\?\s*''/);
  assert.match(api, /import\.meta\.env\.PROD\s*\?\s*''/);
});

test('workspace navigation destinations have registered frontend routes', () => {
  const main = read('../src/main.jsx');
  const routeSection = main.slice(main.indexOf('const routes=['), main.indexOf('function ProtectedRole'));
  const registered = new Set([...routeSection.matchAll(/\['(\/[^']*)'/g)].map(match => match[1]));
  const expected = [
    '/garden', '/garden/book', '/garden/visits', '/garden/plants', '/garden/addresses',
    '/garden/shop', '/garden/plan', '/garden/billing', '/garden/store-orders', '/garden/inbox', '/garden/me',
    '/crew', '/crew/jobs', '/crew/reports', '/crew/hours', '/crew/kyc', '/crew/pay', '/crew/inbox', '/crew/me',
    '/hq', '/hq/accounts', '/hq/people', '/hq/crew', '/hq/visits', '/hq/catalog', '/hq/store', '/hq/botany',
    '/hq/reviews', '/hq/issues', '/hq/notifications', '/hq/insights', '/hq/cms', '/hq/plans', '/hq/money'
  ];
  for (const path of expected) assert.ok(registered.has(path), `Missing route registration: ${path}`);
});
