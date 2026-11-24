import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(new URL(path, import.meta.url), 'utf8');
const publicSections = read('../src/landing/Sections.jsx');
const publicPages = read('../src/landing/Pages.jsx');
const workspace = read('../src/phase5.jsx');
const schema = read('../backend/prisma/schema.prisma');
const migration = read('../backend/prisma/migrations/20261123000200_subscription_plan_catalogue/migration.sql');

test('public plan cards show the same structured service and customer-term fields as the API', () => {
  assert.match(publicSections, /function PublicPlanDetails\(\{ plan \}\)/);
  for (const field of ['serviceFrequency', 'plantLimit', 'includedServices', 'benefits', 'limitations', 'planTypeLabel', 'billingCycle']) {
    assert.ok(publicSections.includes(field), `public plan catalogue must render ${field}`);
  }
  assert.match(publicSections, /paid-through date/);
});

test('customer dashboard exposes complete plan terms and does not start checkout during catalogue phase', () => {
  assert.match(workspace, /function PlanDetails\(\{ plan \}\)/);
  assert.match(workspace, /subscription_id:\s*setup\.checkout\.subscriptionId/);
  assert.match(workspace, /Start UPI AutoPay/);
  assert.match(workspace, /paid-through date/);
});

test('Admin plan editor supports the four required plan types and their complete catalogue fields', () => {
  for (const type of ['ONE_TIME_SERVICE', 'WEEKLY', 'ONE_MONTH', 'ONE_YEAR']) {
    assert.ok(workspace.includes(`value="${type}"`), `Admin editor must support ${type}`);
  }
  for (const field of ['serviceFrequency', 'includedServiceIds', 'benefits', 'limitations', 'plantLimit']) {
    assert.ok(workspace.includes(field), `Admin editor must configure ${field}`);
  }
});

test('existing plan records are preserved as legacy until explicitly reviewed', () => {
  assert.match(schema, /planType\s+SubscriptionPlanType\s+@default\(LEGACY_RECURRING\)/);
  assert.match(migration, /Existing plans remain LEGACY_RECURRING/);
  assert.doesNotMatch(migration, /UPDATE\s+"SubscriptionPlan"\s+SET\s+"planType"/i);
});

test('UPI AutoPay mandate cancellation terms are stated consistently in the Plans FAQ', () => {
  assert.match(publicPages, /Cancel the UPI AutoPay mandate from the UPI payment app/);
  assert.match(publicPages, /paid for remain available until the paid-through date/);
});
