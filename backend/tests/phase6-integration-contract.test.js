import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const read = path => readFileSync(resolve(root, path), 'utf8');

test('all role workspaces use client route guards and role-specific prefixes', () => {
  const main = read('src/main.jsx');
  assert.match(main, /function ProtectedRole\(/);
  assert.match(main, /p\.startsWith\('\/garden'\)\s*\?\s*'CUSTOMER'/);
  assert.match(main, /p\.startsWith\('\/crew'\)\s*\?\s*'GARDENER'/);
  assert.match(main, /p\.startsWith\('\/hq'\)\s*\?\s*'ADMIN'/);
  assert.match(main, /role\s*\?\s*<ProtectedRole role=\{role\}>/);
});

test('protected-route login restores only a destination within the authenticated role workspace', () => {
  const main = read('src/main.jsx');
  assert.match(main, /location\.state\?\.from/);
  assert.match(main, /requestedPath===rolePrefix\|\|requestedPath\.startsWith\(`\$\{rolePrefix\}\/`\)/);
  assert.match(main, /state:\{from:`\$\{location\.pathname\}\$\{location\.search\}\$\{location\.hash\}`\}/);
  assert.match(main, /setMode\('login'\);setStep\('form'\)/);
});

test('public makeover links do not route guests into the protected services workspace', () => {
  const sections = read('src/landing/Sections.jsx');
  assert.equal((sections.match(/to="\/makeover"/g) || []).length, 2);
  assert.doesNotMatch(sections, /Green Makeover[\s\S]{0,80}to="\/garden\/shop"/);
});

test('Gardener assigned work and service reports require current KYC verification', () => {
  const gardener = read('backend/src/routes/gardener.js');
  const serviceExecution = read('backend/src/routes/serviceExecution.js');
  const media = read('backend/src/routes/media.js');
  assert.match(gardener, /router\.use\(\['\/dashboard', '\/jobs', '\/history'\], requireVerifiedGardener\)/);
  assert.match(serviceExecution, /router\.use\(requireAuth,\s*requireRole\('GARDENER'\),\s*requireVerifiedGardener\)/);
  assert.match(media, /kycStatus !== 'VERIFIED'/);
});

test('subscription payments have a database active-payment uniqueness guard and cancellation guard', () => {
  const migration = read('backend/prisma/migrations/20261115000100_harden_active_subscription_payments/migration.sql');
  const payment = read('backend/src/routes/payments.js');
  const subscriptions = read('backend/src/routes/subscriptions.js');
  const bookings = read('backend/src/routes/bookings.js');
  assert.match(migration, /CREATE UNIQUE INDEX[\s\S]*"subscriptionId"[\s\S]*'PENDING', 'AUTHORIZED'/);
  assert.match(payment, /FOR UPDATE/);
  assert.match(payment, /SELECT "id" FROM "Payment" WHERE "id" = \$\{payment\.id\} FOR UPDATE/);
  assert.match(subscriptions, /status: \{ in: \['PENDING', 'AUTHORIZED'\] \}/);
  assert.match(bookings, /payment\?\.status === 'PENDING' \|\| payment\?\.status === 'AUTHORIZED'/);
});

test('refund analytics count successful full and partial refunds, and unsupported channels fail explicitly', () => {
  const analytics = read('backend/src/routes/analytics.js');
  const notifications = read('backend/src/routes/notifications.js');
  assert.match(analytics, /status: \{ in: \['REFUNDED', 'PARTIALLY_REFUNDED'\] \}/);
  assert.match(notifications, /NOTIFICATION_CHANNEL_UNAVAILABLE/);
  assert.match(notifications, /input\.channel !== 'IN_APP'/);
});

test('backend enforces database-backed role guards on Customer, Gardener and Admin APIs', () => {
  const customer = read('backend/src/routes/customer.js');
  const bookings = read('backend/src/routes/bookings.js');
  const gardener = read('backend/src/routes/gardener.js');
  const admin = read('backend/src/routes/admin.js');
  const payment = read('backend/src/routes/payments.js');
  assert.match(customer, /router\.use\(requireAuth,\s*requireRole\('CUSTOMER'\)\)/);
  assert.match(bookings, /router\.use\(requireAuth,\s*requireRole\('CUSTOMER'\)\)/);
  assert.match(gardener, /router\.use\(requireAuth,\s*requireRole\('GARDENER'\)\)/);
  assert.match(admin, /router\.use\(requireAuth,\s*requireRole\('ADMIN'\)\)/);
  assert.match(payment, /customer\.use\(requireAuth,\s*requireRole\('CUSTOMER'\)\)/);
  assert.match(payment, /admin\.use\(requireAuth,\s*requireRole\('ADMIN'\)\)/);
});

test('payment webhook preserves raw body before JSON parsing and standard routes', () => {
  const app = read('backend/src/app.js');
  const webhook = app.indexOf("app.post('/api/v1/payments/webhook'");
  const parser = app.indexOf('app.use(express.json');
  assert.notEqual(webhook, -1);
  assert.notEqual(parser, -1);
  assert.ok(webhook < parser, 'raw webhook route must be registered before express.json');
  assert.match(app, /express\.raw\(\{\s*type:\s*'application\/json'/);
});

test('production API routing retains same-origin Netlify proxy and SPA fallback', () => {
  const redirects = read('public/_redirects');
  assert.match(redirects, /\/api\/\*\s+https:\/\/t-care-api\.onrender\.com\/api\/:splat\s+200/);
  assert.match(redirects, /\/\*\s+\/index\.html\s+200/);
  const api = read('src/phase5Api.js');
  assert.match(api, /import\.meta\.env\.PROD\s*\?\s*''/);
  const readme = read('README.md');
  assert.match(readme, /same-origin Netlify API proxy: leave `VITE_API_BASE_URL` unset in Netlify/);
});

test('Customer billing route now consumes the authenticated customer payment ledger', () => {
  const main = read('src/main.jsx');
  const phase = read('src/phase5.jsx');
  const payment = read('backend/src/routes/payments.js');
  assert.match(main, /\/garden\/billing'.*Phase5\.CustomerPaymentsPage/);
  assert.match(phase, /useLoad\('\/payments\/customer'/);
  assert.match(payment, /customer\.get\('\/'/);
});


test('customer payment projection is used by every customer-facing payment response', () => {
  const payment = read('backend/src/routes/payments.js');
  assert.ok((payment.match(/customerProfile\.id/g) || []).length >= 4, 'list and detail queries must be scoped to the authenticated Customer profile');
  assert.match(payment, /payments\.map\(serializeCustomerPayment\)/);
  assert.match(payment, /payment: serializeCustomerPayment\(payment\)/);
  assert.doesNotMatch(payment, /function serializePayment\(/);
});


test('all core customer, Gardener, Admin and public routers are mounted in the Express app', () => {
  const app = read('backend/src/app.js');
  for (const route of [
    '/api/v1/customer', '/api/v1/services', '/api/v1/bookings', '/api/v1/gardener',
    '/api/v1/subscriptions', '/api/v1/payments', '/api/v1/notifications',
    '/api/v1/admin', '/api/v1/reviews-issues', '/api/v1/products', '/api/v1/cms', '/api/v1/analytics'
  ]) assert.ok(app.includes(`'${route}'`), `Missing router mount: ${route}`);
});

test('public catalogues return their expected collection keys and only approved public routes', () => {
  const services = read('backend/src/routes/services.js');
  const gardener = read('backend/src/routes/gardener.js');
  const reviews = read('backend/src/routes/reviewsIssues.js');
  const products = read('backend/src/routes/products.js');
  const subscriptions = read('backend/src/routes/subscriptions.js');
  assert.match(services, /router\.get\('\/'/);
  assert.match(gardener, /router\.get\('\/public'/);
  assert.match(reviews, /router\.get\('\/public'/);
  assert.match(products, /router\.get\('\/'/);
  assert.match(subscriptions, /router\.get\('\/plans'/);
  assert.match(gardener, /kycStatus:\s*'VERIFIED'/);
  assert.match(reviews, /where:\s*\{\s*status:\s*'PUBLISHED'/);
});

test('access authorization resolves the current account role from the database', () => {
  const middleware = read('backend/src/middleware/auth.js');
  assert.match(middleware, /prisma\.user\.findUnique/);
  assert.match(middleware, /select:\s*\{[^}]*role:\s*true/s);
  assert.match(middleware, /user\.status\s*!==\s*'ACTIVE'/);
  assert.match(middleware, /!user\.emailVerifiedAt/);
});

test('production auth cookies are HttpOnly and Secure with explicit SameSite behavior', () => {
  const auth = read('backend/src/routes/auth.js');
  assert.match(auth, /const secure = env\.NODE_ENV === 'production'/);
  assert.match(auth, /const sameSite = secure \? 'none' : 'lax'/);
  assert.match(auth, /httpOnly:\s*true/);
  assert.match(auth, /secure,/);
  assert.match(auth, /sameSite,/);
});

test('session bootstrap and refresh treat guests or stale cookies as normal unauthenticated state', () => {
  const auth = read('backend/src/routes/auth.js');
  const frontend = read('src/main.jsx');
  const sessionHandler = auth.slice(auth.indexOf("router.get('/session'"), auth.indexOf("router.get('/me'"));
  const refreshHandler = auth.slice(auth.indexOf("router.post('/refresh'"), auth.indexOf("router.post('/logout'"));
  assert.doesNotMatch(sessionHandler, /status\(401\)/);
  assert.match(sessionHandler, /authenticated: false, user: null, refreshRequired: true/);
  assert.match(refreshHandler, /authenticated: false, user: null/);
  assert.match(refreshHandler, /authenticated: true, user: publicUser\(session\.user\)/);
  assert.match(frontend, /payload\?\.refreshRequired/);
  assert.match(frontend, /response\.status===401\|\|payload\?\.refreshRequired/);
});

test('production write requests require the configured frontend origin', () => {
  const security = read('backend/src/middleware/security.js');
  assert.match(security, /export function requireTrustedOrigin/);
  assert.match(security, /origin === process\.env\.FRONTEND_ORIGIN/);
  assert.match(security, /UNTRUSTED_ORIGIN/);
});

test('Render Blueprint installs Prisma dev tooling and pins its Node runtime', () => {
  const render = read('render.yaml');
  assert.match(render, /buildCommand:\s*npm ci --include=dev && npm run prisma:generate/);
  assert.match(render, /key:\s*NODE_VERSION\s*\n\s*value:\s*["']22\.22\.0["']/);
  assert.match(read('backend/package.json'), /"node":\s*">=22\.22\.0 <23"/);
});

test('frontend direct dependency declarations exactly match the committed lockfile', () => {
  const packageJson = JSON.parse(read('package.json'));
  const lock = JSON.parse(read('package-lock.json'));
  assert.deepEqual(packageJson.dependencies, lock.packages[''].dependencies);
  assert.deepEqual(packageJson.engines, lock.packages[''].engines);
  assert.doesNotMatch(JSON.stringify(packageJson.dependencies), /latest/);
});

test('Netlify static security headers are saved and SPA fallback is centralized', () => {
  const headers = read('public/_headers');
  assert.match(headers, /X-Content-Type-Options:\s*nosniff/i);
  assert.match(headers, /X-Frame-Options:\s*DENY/i);
  assert.match(headers, /Referrer-Policy:/i);
  assert.match(headers, /Cross-Origin-Opener-Policy:\s*same-origin/i);
  const netlify = read('netlify.toml');
  assert.doesNotMatch(netlify, /\[\[redirects\]\]/);
  assert.match(read('public/_redirects'), /\/\*\s+\/index\.html\s+200/);
});

test('backend and frontend env examples are present and production migration instructions are guarded', () => {
  const backendEnv = read('backend/.env.example');
  assert.match(backendEnv, /DATABASE_URL=/);
  assert.match(backendEnv, /SUPABASE_SECRET_KEY=/);
  assert.match(backendEnv, /JWT_ACCESS_SECRET=/);
  assert.match(backendEnv, /RAZORPAY_WEBHOOK_SECRET=/);
  const readme = read('README.md');
  assert.match(readme, /compare the migration list with the database's `_prisma_migrations` table first/);
  assert.match(readme, /Never run `prisma migrate reset` against production/);
});


test('Supabase database guidance matches the current single-URL Prisma session-pooler setup', () => {
  const schema = read('backend/prisma/schema.prisma');
  const envExample = read('backend/.env.example');
  const setup = read('docs/T-CARE-SUPABASE-SETUP.md');
  assert.match(schema, /url\s*=\s*env\("DATABASE_URL"\)/);
  assert.doesNotMatch(schema, /directUrl\s*=/);
  assert.match(envExample, /SESSION mode \(port 5432\)/);
  assert.match(envExample, /PROJECT_REF.*5432|PROJECT_REF.*pooler/);
  assert.match(setup, /Session mode.*port `5432`/);
  assert.match(setup, /Do not use the Shared\/Transaction Pooler URI on port `6543`/);
  assert.match(setup, /no separate `DIRECT_URL`/);
});


test('payment mutations and webhooks are fail-closed behind PAYMENTS_ENABLED', () => {
  const env = read('backend/src/config/env.js');
  const payments = read('backend/src/routes/payments.js');
  const render = read('render.yaml');
  const sample = read('backend/.env.example');
  assert.match(env, /PAYMENTS_ENABLED:[\s\S]{0,180}default\(false\)/);
  assert.match(sample, /PAYMENTS_ENABLED=false/);
  assert.match(render, /key:\s*PAYMENTS_ENABLED\s*\n\s*value:\s*["']false["']/);
  assert.match(payments, /assertPaymentsEnabled\(env\.PAYMENTS_ENABLED\)/);
  assert.ok((payments.match(/requireRazorpayConfig\(\);/g) || []).length >= 4, 'booking/subscription order, client verification and refunds must be gated');
  assert.match(payments, /razorpayWebhook[\s\S]*?requireRazorpayConfig\(\{ webhook: true \}\)/);
});


test('React app has a top-level error boundary with an explicit recovery action', () => {
  const main = read('src/main.jsx');
  assert.match(main, /class AppErrorBoundary extends React\.Component/);
  assert.match(main, /static getDerivedStateFromError/);
  assert.match(main, /componentDidCatch/);
  assert.match(main, /<AppErrorBoundary><App\/>/);
  assert.match(main, /window\.location\.reload\(\)/);
});


test('all Prisma models have matching CREATE TABLE declarations across migrations', () => {
  const schema = read('backend/prisma/schema.prisma');
  const modelNames = [...schema.matchAll(/^model\s+(\w+)\s*\{/gm)].map(match => match[1]);
  const migrationFiles = [
    'backend/prisma/migrations/20261004125945_init/migration.sql',
    'backend/prisma/migrations/20261107131341_add_email_verification/migration.sql',
    'backend/prisma/migrations/20261109000100_add_gardener_kyc_documents/migration.sql',
    'backend/prisma/migrations/20261109000200_add_cancelled_assignment_status/migration.sql',
    'backend/prisma/migrations/20261112000200_add_product_catalogue/migration.sql'
  ];
  const tables = migrationFiles.flatMap(file => [...read(file).matchAll(/CREATE TABLE\s+"([^"]+)"/gi)].map(match => match[1]));
  assert.equal(new Set(modelNames).size, modelNames.length, 'Prisma model names must be unique');
  assert.deepEqual([...modelNames].sort(), [...tables].sort());
});


test('frontend and backend package manifests and lockfiles agree on supported Node runtime', () => {
  const rootPackage = JSON.parse(read('package.json'));
  const rootLock = JSON.parse(read('package-lock.json'));
  const backendPackage = JSON.parse(read('backend/package.json'));
  const backendLock = JSON.parse(read('backend/package-lock.json'));
  assert.equal(rootPackage.engines.node, '>=22.22.0 <23');
  assert.equal(rootLock.packages[''].engines.node, rootPackage.engines.node);
  assert.equal(backendPackage.engines.node, '>=22.22.0 <23');
  assert.equal(backendLock.packages[''].engines.node, backendPackage.engines.node);
  assert.equal(backendPackage.dependencies['@prisma/client'], '^6.16.0');
  assert.ok(backendPackage.devDependencies.prisma);
});
