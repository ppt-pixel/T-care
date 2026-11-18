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
  assert.match(payment, /isFinalPaymentStatus\(current\.status\)/);
  assert.match(payment, /return \{ payment: current, activatedSubscription: null \}/);
});

test('booking APIs use the safe customer payment projection', () => {
  const bookings = read('backend/src/routes/bookings.js');
  assert.equal((bookings.match(/serializeCustomerPayment\(/g) || []).length, 2);
  assert.match(bookings, /payment:\s*\{\s*include:\s*\{\s*refunds:\s*true\s*\}\s*\}/);
  assert.doesNotMatch(bookings, /payment:\s*b\.payment\s*\?\s*\{\s*\.\.\.b\.payment/);
  assert.doesNotMatch(bookings, /payment:\s*hydrated\.payment\s*\?\s*\{\s*\.\.\.hydrated\.payment/);
});

test('booking checkout is customer-scoped and uses server-created orders and verified callbacks', () => {
  const payment = read('backend/src/routes/payments.js');
  const phase = read('src/phase5.jsx');
  assert.match(payment, /customer\.get\('\/availability'/);
  assert.match(payment, /enabled:\s*env\.PAYMENTS_ENABLED === true && Boolean\(env\.RAZORPAY_KEY_ID && env\.RAZORPAY_KEY_SECRET\)/);
  assert.match(payment, /customer\.post\('\/booking\/:bookingId\/order'/);
  assert.match(payment, /createProviderOrder\(payment,\s*`TC-\$\{payment\.id\}`\)/);
  assert.doesNotMatch(payment, /createProviderOrder\(payment,\s*`TC-\$\{booking\.reference\}/);
  assert.match(phase, /payments\/customer\/availability/);
  assert.match(phase, /payments\/customer\/booking\/\$\{encodeURIComponent\(id\)\}\/order/);
  assert.match(phase, /payments\/customer\/\$\{encodeURIComponent\(payment\.id\)\}\/verify/);
  assert.match(phase, /razorpaySignature:\s*result\.razorpay_signature/);
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
  const apiRequest = read('src/apiRequest.js');
  const sessionHandler = auth.slice(auth.indexOf("router.get('/session'"), auth.indexOf("router.get('/me'"));
  const refreshHandler = auth.slice(auth.indexOf("router.post('/refresh'"), auth.indexOf("router.post('/logout'"));
  assert.doesNotMatch(sessionHandler, /status\(401\)/);
  assert.match(sessionHandler, /authenticated: false, user: null, refreshRequired: true/);
  assert.match(refreshHandler, /authenticated: false, user: null/);
  assert.match(refreshHandler, /authenticated: true, user: publicUser\(session\.user\)/);
  assert.match(frontend, /restoreAuthSession\(\{apiV1:API_V1\}\)/);
  assert.match(apiRequest, /session\?\.refreshRequired\s*!==\s*true/);
});

test('refresh-token rotation is single-use under concurrent requests', () => {
  const auth = read('backend/src/routes/auth.js');
  const refreshHandler = auth.slice(auth.indexOf("router.post('/refresh'"), auth.indexOf("router.post('/logout'"));
  assert.match(refreshHandler, /refreshSession\.updateMany\(\{\s*where:\s*\{\s*id:\s*session\.id,\s*revokedAt:\s*null,\s*expiresAt:\s*\{\s*gt:\s*now\s*\}/);
  assert.match(refreshHandler, /if \(revoked\.count !== 1\) return false/);
  assert.ok(refreshHandler.indexOf('if (revoked.count !== 1)') < refreshHandler.indexOf('refreshSession.create'));
});

test('verification-code resend serializes concurrent requests and enforces cooldown after locking', () => {
  const auth = read('backend/src/routes/auth.js');
  const resend = auth.slice(auth.indexOf('async function createAndSendOtp'), auth.indexOf("router.post('/register'"));
  assert.match(resend, /SELECT "id" FROM "User" WHERE "id" = \$\{user\.id\} FOR UPDATE/);
  assert.match(resend, /latestOtp[\s\S]*OTP_RESEND_COOLDOWN_SECONDS/);
  assert.match(resend, /emailOtp\.updateMany/);
  assert.ok(resend.indexOf('FOR UPDATE') < resend.indexOf('emailOtp.findFirst'));
});

test('booking conflict checks are serialized per customer before creating a booking', () => {
  const bookings = read('backend/src/routes/bookings.js');
  const createHandler = bookings.slice(bookings.indexOf("router.post('/',"), bookings.indexOf("router.get('/',"));
  assert.match(createHandler, /SELECT "id" FROM "CustomerProfile" WHERE "id" = \$\{customer\.id\} FOR UPDATE/);
  assert.ok(createHandler.indexOf('FOR UPDATE') < createHandler.indexOf('overlappingBooking'));
  assert.ok(createHandler.indexOf('overlappingBooking') < createHandler.indexOf('tx.booking.create'));
});

test('Gardener availability overlap validation is serialized with slot writes', () => {
  const gardener = read('backend/src/routes/gardener.js');
  const availability = gardener.slice(gardener.indexOf("router.post('/availability'"), gardener.indexOf("router.delete('/availability"));
  assert.match(availability, /SELECT "id" FROM "GardenerProfile" WHERE "id" = \$\{gardener\.id\} FOR UPDATE/);
  assert.ok(availability.indexOf('FOR UPDATE') < availability.indexOf('gardenerAvailability.findMany'));
  assert.ok(availability.indexOf('gardenerAvailability.findMany') < availability.indexOf('gardenerAvailability.create'));
});

test('customer subscription creation rechecks exclusivity while holding the customer lock', () => {
  const subscriptions = read('backend/src/routes/subscriptions.js');
  const createHandler = subscriptions.slice(subscriptions.indexOf("customer.post('/',"), subscriptions.indexOf("customer.post('/:id/cancel'"));
  assert.match(createHandler, /SELECT "id" FROM "CustomerProfile" WHERE "id" = \$\{profile\.id\} FOR UPDATE/);
  assert.ok(createHandler.indexOf('FOR UPDATE') < createHandler.indexOf('subscription.findFirst'));
  assert.ok(createHandler.indexOf('subscription.findFirst') < createHandler.indexOf('subscription.create'));
});

test('report photo URLs are generated from owned Storage assets, not caller-provided URLs', () => {
  const serviceExecution = read('backend/src/routes/serviceExecution.js');
  const photoInput = serviceExecution.slice(serviceExecution.indexOf('const photoSchema'), serviceExecution.indexOf('async function getGardener'));
  const createPhoto = serviceExecution.slice(serviceExecution.indexOf("router.post('/jobs/:id/report/photos'"), serviceExecution.indexOf("router.delete('/jobs/:id/report/photos"));
  assert.doesNotMatch(photoInput, /url:/);
  assert.match(createPhoto, /url: null/);
  assert.match(serviceExecution, /let url = null/);
});

test('Admin password reset is explicit, role-checked, audited and revokes refresh sessions', () => {
  const reset = read('backend/scripts/reset-admin-password.js');
  const env = read('backend/src/config/env.js');
  const packageJson = JSON.parse(read('backend/package.json'));
  assert.equal(packageJson.scripts['admin:reset-password'], 'node scripts/reset-admin-password.js');
  assert.match(env, /ADMIN_RESET_PASSWORD:/);
  assert.match(reset, /existing\.role !== 'ADMIN'/);
  assert.match(reset, /Buffer\.byteLength\(ADMIN_RESET_PASSWORD, 'utf8'\) > 72/);
  assert.match(reset, /refreshSession\.updateMany/);
  assert.match(reset, /ADMIN_PASSWORD_RESET_BY_CLI/);
  assert.doesNotMatch(reset, /console\.log\(\s*ADMIN_RESET_PASSWORD\s*\)/);
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
  const paymentPolicy = read('backend/src/lib/paymentPolicy.js');
  const payments = read('backend/src/routes/payments.js');
  const render = read('render.yaml');
  const sample = read('backend/.env.example');
  assert.match(env, /PAYMENTS_ENABLED:[\s\S]{0,180}default\(false\)/);
  assert.match(sample, /PAYMENTS_ENABLED=false/);
  assert.match(render, /key:\s*PAYMENTS_ENABLED\s*\n\s*value:\s*["']false["']/);
  assert.match(payments, /assertPaymentsEnabled\(env\.PAYMENTS_ENABLED\)/);
  assert.ok((payments.match(/requireRazorpayConfig\(\);/g) || []).length >= 4, 'booking/subscription order, client verification and refunds must be gated');
  assert.match(payments, /razorpayWebhook[\s\S]*?requireRazorpayConfig\(\{ webhook: true \}\)/);
  assert.match(env, /assertPaymentConfiguration\(parsedEnv\)/);
  assert.match(paymentPolicy, /config\.NODE_ENV === 'production' \? 'rzp_live_' : 'rzp_test_'/);
});

test('payment verification uses shared signature, ownership and amount guards', () => {
  const payments = read('backend/src/routes/payments.js');
  assert.match(payments, /hasValidClientPaymentSignature\(env\.RAZORPAY_KEY_SECRET/);
  assert.match(payments, /hasValidWebhookSignature\(env\.RAZORPAY_WEBHOOK_SECRET/);
  assert.match(payments, /paymentBelongsToCustomer\(payment, customer\.id\)/);
  assert.match(payments, /providerAmountMatches\(amountToPaise\(payment\.amount\), remote\.amount\)/);
  assert.match(payments, /providerAmountMatches\(amountToPaise\(localPayment\.amount\), remoteAmount\)/);
  assert.match(payments, /providerCurrencyMatches\(localPayment\.currency, remoteCurrency\)/);
});

test('payment and refund webhook handlers acknowledge concurrent duplicate event insertions', () => {
  const payments = read('backend/src/routes/payments.js');
  assert.ok((payments.match(/runWebhookTransaction\(\{/g) || []).length >= 3);
  assert.match(payments, /eventExists:\s*\(\)\s*=>\s*prisma\.paymentEvent\.findUnique/);
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
    'backend/prisma/migrations/20261112000200_add_product_catalogue/migration.sql',
    'backend/prisma/migrations/20261118000100_add_registration_consent_password_reset_receipts/migration.sql'
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

test('registration consent is enforced by the API and stored with policy versions', () => {
  const auth = read('backend/src/routes/auth.js');
  const registrationSchema = read('backend/src/lib/authValidation.js');
  const main = read('src/main.jsx');
  const schema = read('backend/prisma/schema.prisma');
  assert.match(registrationSchema, /acceptTerms:\s*z\.literal\(true\)/);
  assert.match(registrationSchema, /acceptPrivacy:\s*z\.literal\(true\)/);
  assert.match(registrationSchema, /accountType:\s*z\.literal\('CUSTOMER'\)\.optional\(\)/);
  assert.match(auth, /termsAcceptedAt:\s*consentAt/);
  assert.match(auth, /termsPolicyVersion:\s*TERMS_POLICY_VERSION/);
  assert.match(auth, /privacyAcceptedAt:\s*consentAt/);
  assert.match(auth, /privacyPolicyVersion:\s*PRIVACY_POLICY_VERSION/);
  assert.match(auth, /role:\s*'CUSTOMER'/);
  assert.doesNotMatch(auth, /input\.accountType/);
  assert.match(main, /legalConsent\.terms/);
  assert.match(main, /legalConsent\.privacy/);
  assert.doesNotMatch(main, /role-pick/);
  assert.match(main, /\['accounts','Account management',UserRound\]/);
  assert.match(main, /\/hq\/accounts/);
  const accountManagement = read('src/phase5.jsx');
  assert.match(accountManagement, /export function AdminAccountManagementPage/);
  assert.match(accountManagement, /Find a Customer/);
  assert.match(accountManagement, /Copy temporary password/);
  assert.match(schema, /termsAcceptedAt\s+DateTime\?/);
  assert.match(schema, /privacyPolicyVersion\s+String\?/);
});

test('password recovery is limited, non-enumerating, one-time and revokes sessions', () => {
  const auth = read('backend/src/routes/auth.js');
  assert.match(auth, /router\.post\('\/forgot-password',\s*forgotPasswordLimiter/);
  assert.match(auth, /router\.post\('\/reset-password',\s*resetPasswordLimiter/);
  assert.match(auth, /If an active, verified T-CARE account exists/);
  assert.match(auth, /hashPasswordResetCode/);
  assert.match(auth, /attempts:\s*\{\s*lt:\s*env\.OTP_MAX_ATTEMPTS\s*\}/);
  assert.match(auth, /consumedAt:\s*now/);
  assert.match(auth, /refreshSession\.updateMany/);
  assert.match(auth, /bcrypt\.hash\(input\.newPassword,\s*12\)/);
  assert.match(auth, /authVersion:\s*\{\s*increment:\s*1\s*\}/);
  assert.match(auth, /Buffer\.byteLength\(value,\s*'utf8'\)\s*<=\s*72/);
  assert.match(read('backend/src/middleware/auth.js'), /payload\.av[\s\S]*?user\.authVersion/);
});

test('password and account status changes immediately invalidate existing access JWTs', () => {
  const schema = read('backend/prisma/schema.prisma');
  const migration = read('backend/prisma/migrations/20261118000100_add_registration_consent_password_reset_receipts/migration.sql');
  const middleware = read('backend/src/middleware/auth.js');
  const auth = read('backend/src/routes/auth.js');
  const admin = read('backend/src/routes/admin.js');
  assert.match(schema, /authVersion\s+Int\s+@default\(0\)/);
  assert.match(migration, /ADD COLUMN "authVersion" INTEGER NOT NULL DEFAULT 0/);
  assert.match(auth, /av:\s*Number\(user\.authVersion \?\? 0\)/);
  assert.match(middleware, /Number\(payload\.av \?\? 0\) !== Number\(user\.authVersion \?\? 0\)/);
  assert.ok((auth.match(/authVersion:\s*\{\s*increment:\s*1\s*\}/g) || []).length >= 2);
  assert.match(admin, /authVersion:\s*\{\s*increment:\s*1\s*\}/);
});

test('payment receipts require provider-confirmed states and Admin can retry delivery', () => {
  const receipts = read('backend/src/lib/paymentReceipts.js');
  const payments = read('backend/src/routes/payments.js');
  const admin = read('backend/src/routes/admin.js');
  const finance = read('src/phase5.jsx');
  assert.match(receipts, /!\['PAID',\s*'PARTIALLY_REFUNDED',\s*'REFUNDED'\]\.includes\(payment\.status\)/);
  assert.match(receipts, /paymentReceipt\.upsert/);
  assert.match(receipts, /deliveryStatus:\s*'SENDING'/);
  assert.match(receipts, /paymentStatus:\s*receipt\.payment\.status/);
  assert.match(payments, /ensureAndDeliverPaymentReceipt\(result\.payment\.id\)/);
  assert.match(payments, /admin\.post\('\/:id\/receipt\/resend'/);
  assert.match(admin, /receipt:\s*true/);
  assert.match(finance, /\/payments\/admin\/\$\{payment\.id\}\/receipt\/resend/);
  assert.match(read('backend/src/lib/email.js'), /Original amount paid/);
  assert.match(read('backend/src/lib/email.js'), /Current status: \$\{safe\.status\}/);
});

test('Admin and Gardener workspaces use the sidebar and a shared notification preview poller', () => {
  const main = read('src/main.jsx');
  const dashboard = read('src/phase5.jsx');
  const store = read('src/notificationStore.js');
  assert.match(main, /function WorkspaceSidebar/);
  assert.match(main, /hasSidebar\s*=\s*rk==='hq'\|\|rk==='crew'/);
  assert.match(main, /<WorkspaceSidebar/);
  assert.match(store, /setInterval\(\(\)\s*=>\s*refreshNotificationFeed\(\),\s*60_000\)/);
  assert.match(store, /\/notifications\?limit=5/);
  assert.doesNotMatch(dashboard, /useLoad\('\/notifications\?limit=5'/);
  assert.match(dashboard, /useNotificationFeed\(\)/);
});

test('Admin payment ledger supports searchable pagination beyond the first page', () => {
  const admin = read('backend/src/routes/admin.js');
  const finance = read('src/phase5.jsx');
  assert.match(admin, /providerOrderId: searchFilter/);
  assert.match(admin, /booking: \{ customer: \{ user: \{ fullName: searchFilter \} \} \}/);
  assert.match(admin, /subscription: \{ customer: \{ user: \{ email: searchFilter \} \} \}/);
  assert.match(admin, /skip: \(q\.page - 1\) \* q\.limit/);
  assert.match(admin, /pagination: \{ page: q\.page, limit: q\.limit, total, pages:/);
  assert.match(finance, /admin\/payments\?page=\$\{paymentPage\}&limit=25/);
  assert.match(finance, /paymentsState\.data\?\.pagination/);
  assert.match(finance, /setPaymentPage\(value=>value\+1\)/);
});
