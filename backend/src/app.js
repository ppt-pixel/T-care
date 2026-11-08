import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import { env } from './config/env.js';
import healthRouter from './routes/health.js';
import authRouter from './routes/auth.js';
import customerRouter from './routes/customer.js';
import servicesRouter from './routes/services.js';
import bookingsRouter from './routes/bookings.js';
import gardenerRouter from './routes/gardener.js';
import serviceExecutionRouter from './routes/serviceExecution.js';
import mediaRouter from './routes/media.js';
import reviewsIssuesRouter from './routes/reviewsIssues.js';
import subscriptionsRouter from './routes/subscriptions.js';
import paymentsRouter, { razorpayWebhook } from './routes/payments.js';
import notificationsRouter from './routes/notifications.js';
import adminRouter from './routes/admin.js';
import { notFound, errorHandler } from './middleware/error.js';
import { requestSecurity, createRateLimiter, requireTrustedOrigin } from './middleware/security.js';
import cmsRouter from './routes/cms.js';
import analyticsRouter from './routes/analytics.js';

export const app = express();

app.disable('x-powered-by');
app.set('trust proxy', env.NODE_ENV === 'production' ? 1 : false);
app.use(requestSecurity);
app.use('/api/v1', (_req, res, next) => { res.set('Cache-Control', 'private, no-store, no-cache, must-revalidate'); next(); });

// Payment webhooks must receive the exact raw request body for HMAC verification.
app.post('/api/v1/payments/webhook', express.raw({ type: 'application/json', limit: '1mb' }), razorpayWebhook);
app.use(cors({ origin: env.FRONTEND_ORIGIN, credentials: true }));
app.use(express.json({ limit: '2mb' }));
app.use(requireTrustedOrigin);
app.use(cookieParser());

app.get('/api/v1', (req, res) => {
  res.json({ name: 'T-CARE API', version: 'v1' });
});

app.use('/api/v1/health', healthRouter);
app.use('/api/v1/auth', createRateLimiter({ windowMs: 15 * 60_000, max: 30, keyPrefix: 'auth' }), authRouter(express.Router()));
app.use('/api/v1/customer', customerRouter());
app.use('/api/v1/services', servicesRouter());
app.use('/api/v1/bookings', bookingsRouter());
app.use('/api/v1/gardener', gardenerRouter());
app.use('/api/v1/gardener', serviceExecutionRouter());
app.use('/api/v1/media', mediaRouter());
app.use('/api/v1/reviews-issues', reviewsIssuesRouter());
app.use('/api/v1/subscriptions', subscriptionsRouter());
app.use('/api/v1/payments', paymentsRouter());
app.use('/api/v1/notifications', notificationsRouter());
app.use('/api/v1/admin', adminRouter());
app.use('/api/v1/cms', cmsRouter());
app.use('/api/v1/analytics', analyticsRouter());

app.use(notFound);
app.use(errorHandler);
