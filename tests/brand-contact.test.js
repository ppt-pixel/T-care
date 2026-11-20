import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');

test('official customer-care email is the canonical public contact', () => {
  const content = read('src/landing/content.js');
  const footer = read('src/landing/Sections.jsx');
  const contact = read('src/landing/Pages.jsx');
  assert.match(content, /PUBLIC_CONTACT_EMAIL\s*=\s*'support@t-care\.in'/);
  assert.match(footer, /mailto:\$\{C\.PUBLIC_CONTACT_EMAIL\}/);
  assert.match(footer, /<small>Customer care<\/small>/);
  assert.doesNotMatch(footer, /C\.PUBLIC_CONTACT_EMAIL&&/);
  assert.match(contact, /const email=C\.PUBLIC_CONTACT_EMAIL/);
  assert.match(contact, /t==='Customer care'\?\s*<a href=\{`mailto:\$\{value\}`\}/);
});

test('T-CARE brand assets are wired into public, workspace and authentication branding', () => {
  for (const asset of [
    'public/brand/t-care-logo.jpg',
    'public/brand/t-care-mark.png',
    'public/brand/t-care-wordmark.png',
  ]) assert.equal(existsSync(resolve(root, asset)), true, `${asset} should exist`);

  const publicNav = read('src/landing/Sections.jsx');
  const app = read('src/main.jsx');
  const index = read('index.html');
  assert.match(publicNav, /src="\/brand\/t-care-mark\.png"/);
  assert.match(publicNav, /src="\/brand\/t-care-wordmark\.png"/);
  assert.match(app, /src="\/brand\/t-care-mark\.png"/);
  assert.match(app, /src="\/brand\/t-care-logo\.jpg"/);
  assert.match(index, /href="\/brand\/t-care-mark\.png"/);
  assert.match(index, /T-CARE \| Plant Care Management as a Service/);
});

test('footer gardener link routes to enquiries rather than Customer registration', () => {
  const content = read('src/landing/content.js');
  assert.match(content, /\['Gardener enquiries','\/contact'\]/);
  assert.doesNotMatch(content, /\['Join as a gardener','\/register'\]/);
});
