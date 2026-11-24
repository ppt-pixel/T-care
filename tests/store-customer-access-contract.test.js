import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');

test('public Store browsing remains available while cart actions require a Customer account', () => {
  const main = read('../src/main.jsx');
  const pages = read('../src/landing/Pages.jsx');
  const sections = read('../src/landing/Sections.jsx');
  assert.match(main, /function useRequireCustomerForStore/);
  assert.match(main, /navigate\('\/login',\{state:\{from:returnTo\}\}\)/);
  assert.match(main, /onRequireCustomer=\{requireCustomer\}/);
  assert.match(pages, /const addProduct=product=>\{if\(!requireCustomer\('\/store'\)\)return false/);
  assert.match(sections, /if\(requireCustomer\('\/store'\)\)cart\.add/);
  assert.match(sections, /onCartClick\|\|\(\(\)=>cart\.setOpen\(true\)\)/);
});

test('direct Plant Store checkout hides cart details until a signed-in Customer session exists', () => {
  const checkout = read('../src/store/StoreCheckout.jsx');
  const gateIndex = checkout.indexOf("if (!authUser) return <section className=\"store-checkout-page store-checkout-access-page\">");
  const summaryIndex = checkout.indexOf('<aside className="store-order-summary">');
  assert.ok(gateIndex >= 0, 'guest checkout gate should exist');
  assert.ok(summaryIndex > gateIndex, 'customer order summary should only follow the gate');
  assert.match(checkout, /state=\{\{ from: '\/store\/checkout' \}\}/);
  assert.match(checkout, /authUser\.role !== 'CUSTOMER'/);
  assert.match(checkout, /if \(!authReady\) return/);
  assert.match(checkout, /if \(!cart\?\.customerReady\) return[\s\S]*?Preparing your cart/);
  assert.ok(checkout.indexOf('if (!cart?.customerReady) return') < summaryIndex, 'checkout summary waits for the signed-in Customer cart to finish restoring');
});

test('Customer login returns to the gated Store route after authentication', () => {
  const main = read('../src/main.jsx');
  assert.match(main, /user\.role==='CUSTOMER' && \['\/store','\/store\/checkout'\]\.includes\(requestedPath\)/);
});

test('guest and non-Customer sessions do not retain a persisted cart in the public app state', () => {
  const main = read('../src/main.jsx');
  const sections = read('../src/landing/Sections.jsx');
  assert.match(main, /cartOwnerId=authUser\?\.role==='CUSTOMER'\?authUser\.id:null/);
  assert.match(sections, /useCart\(toast,authReady,customerId\)/);
  assert.match(sections, /if\(!isCustomerReady\)[\s\S]*?Sign in with a Customer account before adding products/);
  assert.match(sections, /localStorage\.removeItem\('tcare-cart'\)/);
  assert.match(sections, /tcare-cart-v2/);
  assert.match(sections, /if\(next&&!isCustomerReady\)/);
});
