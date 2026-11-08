import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(4000),
    // Supabase PostgreSQL connection string. Use the pooled connection string
    // recommended by Supabase for server-side/production workloads.
    DATABASE_URL: z.string().min(1),
    // Supabase project URL + new server-only secret API key.
    // Secret keys bypass RLS and must never be exposed to the browser.
    SUPABASE_URL: z.string().url(),
    SUPABASE_SECRET_KEY: z.string().min(1),
    SUPABASE_STORAGE_BUCKET: z.string().min(1).default('tcare-media'),
    FRONTEND_ORIGIN: z.string().url(),
    JWT_ACCESS_SECRET: z.string().min(32),
    JWT_REFRESH_SECRET: z.string().min(32),
    ACCESS_TOKEN_TTL: z.string().default('15m'),
    REFRESH_TOKEN_TTL: z.string().default('7d'),
    // SMTP settings are optional at process startup so non-email API work remains available.
    // OTP endpoints explicitly fail closed when credentials are not configured.
    SMTP_HOST: z.string().default('smtp.gmail.com'),
    SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(465),
    SMTP_SECURE: z.preprocess(
        (value) => value === undefined ? true : String(value).trim().toLowerCase() === 'true',
        z.boolean()
    ),
    SMTP_USER: z.preprocess((value) => value === '' ? undefined : value, z.string().email().optional()),
    SMTP_PASSWORD: z.preprocess((value) => value === '' ? undefined : value, z.string().min(1).optional()),
    SMTP_FROM: z.preprocess((value) => value === '' ? undefined : value, z.string().min(3).optional()),
    OTP_TTL_MINUTES: z.coerce.number().int().min(5).max(30).default(10),
    OTP_RESEND_COOLDOWN_SECONDS: z.coerce.number().int().min(30).max(600).default(60),
    OTP_MAX_ATTEMPTS: z.coerce.number().int().min(3).max(10).default(5),
    // Used only by the one-time CLI admin provisioner. Never expose to frontend.
    ADMIN_EMAIL: z.preprocess((value) => value === '' ? undefined : value, z.string().email().optional()),
    ADMIN_FULL_NAME: z.preprocess((value) => value === '' ? undefined : value, z.string().trim().min(2).max(100).optional()),
    ADMIN_INITIAL_PASSWORD: z.preprocess((value) => value === '' ? undefined : value, z.string().min(12).max(72).optional()),
    BOOKING_CONVENIENCE_FEE: z.coerce.number().finite().nonnegative().default(0),
    PAYMENT_PROVIDER: z.enum(['razorpay']).default('razorpay'),
    RAZORPAY_KEY_ID: z.string().min(1).optional(),
    RAZORPAY_KEY_SECRET: z.string().min(1).optional(),
    RAZORPAY_WEBHOOK_SECRET: z.string().min(1).optional(),
    PAYMENT_WEBHOOK_TOLERANCE_SECONDS: z.coerce.number().int().positive().max(3600).default(300)
});

export const env = schema.parse(process.env);