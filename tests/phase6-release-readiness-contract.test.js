import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(new URL(path, import.meta.url), 'utf8');

test('booking resource loader cancels stale requests and ignores obsolete responses', () => {
  const source = read('../src/phase5.jsx');
  const booking = source.slice(source.indexOf('export function CustomerBookingCreatePage'), source.indexOf('function PlanDetails'));
  assert.match(booking, /new AbortController\(\)/);
  assert.match(booking, /signal: controller\.signal/);
  assert.match(booking, /version !== loadVersion\.current/);
  assert.match(booking, /loadController\.current\?\.abort\(\)/);
});

test('store order detail and order workspace loaders cancel obsolete requests', () => {
  const source = read('../src/store/StoreCheckout.jsx');
  assert.equal((source.match(/const loadController = React\.useRef\(null\)/g) || []).length, 2);
  assert.ok((source.match(/loadController\.current\?\.abort\(\)/g) || []).length >= 4);
  assert.match(source, /orders\/customer\/\$\{encodeURIComponent\(id\)\}.*signal: controller\.signal/s);
  assert.match(source, /request\('\/orders\/customer', \{ signal: controller\.signal \}\)/);
});

test('authentication and booking forms lock controls while requests are pending', () => {
  const auth = read('../src/main.jsx');
  const booking = read('../src/phase5.jsx');
  assert.equal((auth.match(/className="auth-form-fields" disabled=\{busy\}/g) || []).length, 4);
  assert.match(auth, /<form onSubmit=\{submit\} aria-busy=\{busy\}>/);
  assert.match(auth, /onClick=\{\(\)=>switchMode\('login'\)\} disabled=\{busy\}/);
  assert.match(booking, /<form className="p5-panel" onSubmit=\{submit\} aria-busy=\{busy\}>\s*<fieldset className="p5-form-lock" disabled=\{busy\}>/);
  assert.match(booking, /const createAddress = async e => \{\s*e\.preventDefault\(\); if \(busy\) return;/);
});

test('Plant Store checkout prevents duplicate submit and locks delivery inputs during payment setup', () => {
  const source = read('../src/store/StoreCheckout.jsx');
  assert.match(source, /const submit = async event => \{\s*event\.preventDefault\(\);\s*if \(busy\) return;/);
  assert.match(source, /<form className="store-address-form" onSubmit=\{submit\} aria-busy=\{busy\}>\s*<fieldset className="store-checkout-fields" disabled=\{busy \|\| Boolean\(qrPayment\)\}>/);
  assert.match(source, /store-pay-button" type="submit" disabled=\{busy/);
});

test('loading states expose busy status and reduced-motion-safe skeletons', () => {
  const phase5 = read('../src/phase5.jsx');
  const pages = read('../src/landing/Pages.jsx');
  const sections = read('../src/landing/Sections.jsx');
  const css = read('../src/phase5.css');
  const landingCss = read('../src/landing/pages.css');
  assert.match(phase5, /p5-loading-state[\s\S]*?aria-busy="true"/);
  assert.match(pages, /aria-busy="true"[\s\S]*?public-product-skeletons/);
  assert.match(sections, /aria-busy="true"[\s\S]*?public-product-skeletons/);
  assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*?p5-loading-skeletons/);
  assert.match(landingCss, /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*?public-product-skeletons/);
});

test('cart exposes the 20-item quantity cap and accessible quantity controls', () => {
  const cart = read('../src/landing/Sections.jsx');
  assert.match(cart, /Math\.min\(20,x\.qty\+1\)/);
  assert.match(cart, /disabled=\{x\.qty>=20\}/);
  assert.match(cart, /aria-label=\{`Increase quantity of \$\{x\.name\}`\}/);
});
