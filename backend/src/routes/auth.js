import crypto from 'node:crypto';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { env } from '../config/env.js';
import { requireAuth } from '../middleware/auth.js';
import { createRateLimiter } from '../middleware/security.js';
import {
    isEmailDeliveryConfigured,
    sendEmailVerificationCode
} from '../lib/email.js';

const registerSchema = z.object({
    fullName: z.string().trim().min(2).max(100),
    email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
    password: z.string().min(8).max(72),
    phone: z.string().trim().min(7).max(20).optional(),
    // Public registration may create only Customer or Gardener accounts.
    accountType: z.enum(['CUSTOMER', 'GARDENER'])
});

const loginSchema = z.object({
    email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
    password: z.string().min(1).max(72)
});

const verifyEmailSchema = z.object({
    email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
    code: z.string().trim().regex(/^\d{6}$/, 'Verification code must contain exactly six digits.')
});

const resendSchema = z.object({
    email: z.string().trim().email().max(254).transform((value) => value.toLowerCase())
});

const changePasswordSchema = z.object({
    currentPassword: z.string().min(1).max(72),
    newPassword: z.string().min(12).max(72)
});

const registrationLimiter = createRateLimiter({
    windowMs: 15 * 60_000,
    max: 5,
    keyPrefix: 'auth-register'
});
const verificationLimiter = createRateLimiter({
    windowMs: 15 * 60_000,
    max: 10,
    keyPrefix: 'auth-verify-email'
});
const resendLimiter = createRateLimiter({
    windowMs: 15 * 60_000,
    max: 5,
    keyPrefix: 'auth-resend-email'
});

function ttlToMs(value) {
    const match = /^([0-9]+)([smhd])$/.exec(value.trim());
    if (!match) throw new Error(`Unsupported TTL format: ${value}`);
    const amount = Number(match[1]);
    const multiplier = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[match[2]];
    return amount * multiplier;
}

const refreshTtlMs = ttlToMs(env.REFRESH_TOKEN_TTL);
const otpTtlMs = env.OTP_TTL_MINUTES * 60_000;

function publicUser(user) {
    return {
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        phone: user.phone,
        role: user.role,
        status: user.status,
        emailVerified: Boolean(user.emailVerifiedAt),
        customerProfile: user.customerProfile ?? null,
        gardenerProfile: user.gardenerProfile ?? null
    };
}

function setAuthCookies(res, accessToken, refreshToken) {
    const secure = env.NODE_ENV === 'production';
    const sameSite = secure ? 'none' : 'lax';
    res.cookie('tcare_access', accessToken, {
        httpOnly: true,
        secure,
        sameSite,
        path: '/',
        maxAge: ttlToMs(env.ACCESS_TOKEN_TTL)
    });
    res.cookie('tcare_refresh', refreshToken, {
        httpOnly: true,
        secure,
        sameSite,
        path: '/api/v1/auth',
        maxAge: refreshTtlMs
    });
}

function clearAuthCookies(res) {
    const secure = env.NODE_ENV === 'production';
    const sameSite = secure ? 'none' : 'lax';
    res.clearCookie('tcare_access', { httpOnly: true, secure, sameSite, path: '/' });
    res.clearCookie('tcare_refresh', { httpOnly: true, secure, sameSite, path: '/api/v1/auth' });
}

function createAccessToken(user) {
    return jwt.sign({ sub: user.id, role: user.role },
        env.JWT_ACCESS_SECRET, { expiresIn: env.ACCESS_TOKEN_TTL, issuer: 't-care-api', audience: 't-care-web' }
    );
}

function createRefreshToken() {
    return crypto.randomBytes(48).toString('base64url');
}

function hashToken(token) {
    return crypto.createHash('sha256').update(token).digest('hex');
}

// HMAC prevents offline brute-force of a six-digit OTP if the database alone is exposed.
// Domain separation keeps OTP hashes distinct from refresh-token hashes.
function hashOtp(userId, code) {
    return crypto
        .createHmac('sha256', env.JWT_REFRESH_SECRET)
        .update(`tcare-email-otp:v1:${userId}:${code}`)
        .digest('hex');
}

function safeHexEqual(expectedHex, actualHex) {
    const expected = Buffer.from(expectedHex, 'hex');
    const actual = Buffer.from(actualHex, 'hex');
    return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

function createOtpCode() {
    return crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
}

async function issueSession(user, res) {
    const accessToken = createAccessToken(user);
    const refreshToken = createRefreshToken();
    const now = new Date();

    await prisma.refreshSession.create({
        data: {
            userId: user.id,
            tokenHash: hashToken(refreshToken),
            expiresAt: new Date(now.getTime() + refreshTtlMs),
            lastUsedAt: now
        }
    });

    setAuthCookies(res, accessToken, refreshToken);
}

async function createAndSendOtp(user) {
    if (!isEmailDeliveryConfigured()) {
        const error = new Error('Email verification is temporarily unavailable. SMTP credentials are not configured.');
        error.code = 'EMAIL_PROVIDER_NOT_CONFIGURED';
        error.statusCode = 503;
        throw error;
    }

    const code = createOtpCode();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + otpTtlMs);

    const otpRecord = await prisma.$transaction(async(tx) => {
        await tx.emailOtp.updateMany({
            where: { userId: user.id, consumedAt: null },
            data: { consumedAt: now }
        });

        return tx.emailOtp.create({
            data: {
                userId: user.id,
                codeHash: hashOtp(user.id, code),
                expiresAt
            }
        });
    });

    try {
        await sendEmailVerificationCode({
            to: user.email,
            fullName: user.fullName,
            code,
            expiresInMinutes: env.OTP_TTL_MINUTES
        });
    } catch (error) {
        // Do not leave a valid code that was never delivered.
        await prisma.emailOtp.updateMany({
            where: { id: otpRecord.id, consumedAt: null },
            data: { consumedAt: new Date() }
        }).catch(() => {});
        console.error('[auth] verification email delivery failed', {
            userId: user.id,
            code: error?.code || 'SMTP_DELIVERY_ERROR'
        });
        const deliveryError = new Error('Your account was created, but the verification email could not be delivered. Please request a new code.');
        deliveryError.code = 'EMAIL_DELIVERY_FAILED';
        deliveryError.statusCode = 503;
        deliveryError.accountCreated = true;
        throw deliveryError;
    }
}

export default function authRouter(router) {
    router.post('/register', registrationLimiter, async(req, res, next) => {
        try {
            const input = registerSchema.parse(req.body);

            if (!isEmailDeliveryConfigured()) {
                return res.status(503).json({
                    error: 'EMAIL_PROVIDER_NOT_CONFIGURED',
                    message: 'Email verification is not configured yet. Please contact support.'
                });
            }

            const existing = await prisma.user.findUnique({ where: { email: input.email } });
            if (existing) {
                return res.status(409).json({ error: 'EMAIL_IN_USE', message: 'An account with this email already exists. Sign in or request a verification code.' });
            }

            const passwordHash = await bcrypt.hash(input.password, 12);
            let user;

            try {
                user = await prisma.$transaction(async(tx) => {
                    const created = await tx.user.create({
                        data: {
                            email: input.email,
                            passwordHash,
                            fullName: input.fullName,
                            phone: input.phone,
                            role: input.accountType,
                            status: 'PENDING',
                            ...(input.accountType === 'CUSTOMER' ? { customerProfile: { create: {} } } : { gardenerProfile: { create: { kycStatus: 'NOT_STARTED' } } })
                        },
                        include: { customerProfile: true, gardenerProfile: true }
                    });

                    const code = createOtpCode();
                    await tx.emailOtp.create({
                        data: {
                            userId: created.id,
                            codeHash: hashOtp(created.id, code),
                            expiresAt: new Date(Date.now() + otpTtlMs)
                        }
                    });
                    await tx.auditLog.create({
                        data: {
                            actorUserId: created.id,
                            action: 'CREATE',
                            entityType: 'User',
                            entityId: created.id,
                            metadata: { event: 'PUBLIC_REGISTRATION', role: created.role }
                        }
                    });

                    return { created, code };
                });
            } catch (error) {
                if (error?.code === 'P2002') {
                    return res.status(409).json({ error: 'EMAIL_IN_USE', message: 'An account with this email already exists.' });
                }
                throw error;
            }

            try {
                await sendEmailVerificationCode({
                    to: user.created.email,
                    fullName: user.created.fullName,
                    code: user.code,
                    expiresInMinutes: env.OTP_TTL_MINUTES
                });
            } catch (error) {
                await prisma.emailOtp.updateMany({
                    where: { userId: user.created.id, consumedAt: null },
                    data: { consumedAt: new Date() }
                }).catch(() => {});
                console.error('[auth] registration email delivery failed', {
                    userId: user.created.id,
                    code: error?.code || 'SMTP_DELIVERY_ERROR'
                });
                return res.status(503).json({
                    error: 'EMAIL_DELIVERY_FAILED',
                    message: 'Your account was created, but the verification email could not be delivered. Correct the email settings and request a new code.',
                    accountCreated: true,
                    verificationRequired: true,
                    email: user.created.email,
                    role: user.created.role
                });
            }

            return res.status(201).json({
                verificationRequired: true,
                email: user.created.email,
                role: user.created.role,
                message: 'A six-digit verification code has been sent to your email address.'
            });
        } catch (error) {
            next(error);
        }
    });

    router.post('/verify-email', verificationLimiter, async(req, res, next) => {
        try {
            const input = verifyEmailSchema.parse(req.body);
            const user = await prisma.user.findUnique({
                where: { email: input.email },
                include: { customerProfile: true, gardenerProfile: true }
            });

            if (!user) {
                return res.status(400).json({ error: 'INVALID_OR_EXPIRED_OTP', message: 'The verification code is invalid or expired.' });
            }
            if (['BLOCKED', 'INACTIVE'].includes(user.status)) {
                return res.status(403).json({ error: 'ACCOUNT_UNAVAILABLE', message: 'This account is not currently active.' });
            }
            if (user.emailVerifiedAt) {
                return res.status(409).json({ error: 'EMAIL_ALREADY_VERIFIED', message: 'This email address has already been verified. Please sign in.' });
            }

            const now = new Date();
            const otp = await prisma.emailOtp.findFirst({
                where: { userId: user.id, consumedAt: null, expiresAt: { gt: now } },
                orderBy: { createdAt: 'desc' }
            });

            if (!otp || otp.attempts >= env.OTP_MAX_ATTEMPTS) {
                return res.status(400).json({ error: 'INVALID_OR_EXPIRED_OTP', message: 'The verification code is invalid or expired. Request a new code.' });
            }

            const candidateHash = hashOtp(user.id, input.code);
            if (!safeHexEqual(otp.codeHash, candidateHash)) {
                const attempt = await prisma.emailOtp.updateMany({
                    where: {
                        id: otp.id,
                        consumedAt: null,
                        expiresAt: { gt: now },
                        attempts: { lt: env.OTP_MAX_ATTEMPTS }
                    },
                    data: { attempts: { increment: 1 } }
                });
                const attemptsAfter = otp.attempts + (attempt.count ? 1 : 0);
                if (attemptsAfter >= env.OTP_MAX_ATTEMPTS) {
                    await prisma.emailOtp.updateMany({
                        where: { id: otp.id, consumedAt: null },
                        data: { consumedAt: new Date() }
                    });
                }
                return res.status(400).json({
                    error: 'INVALID_OTP',
                    message: attemptsAfter >= env.OTP_MAX_ATTEMPTS ?
                        'Too many incorrect attempts. Request a new verification code.' : 'The verification code is incorrect.',
                    attemptsRemaining: Math.max(0, env.OTP_MAX_ATTEMPTS - attemptsAfter)
                });
            }

            const verifiedUser = await prisma.$transaction(async(tx) => {
                const consumed = await tx.emailOtp.updateMany({
                    where: {
                        id: otp.id,
                        consumedAt: null,
                        expiresAt: { gt: new Date() },
                        attempts: { lt: env.OTP_MAX_ATTEMPTS }
                    },
                    data: { consumedAt: new Date() }
                });
                if (consumed.count !== 1) return null;

                const updated = await tx.user.update({
                    where: { id: user.id },
                    data: {
                        emailVerifiedAt: new Date(),
                        status: 'ACTIVE'
                    },
                    include: { customerProfile: true, gardenerProfile: true }
                });

                await tx.auditLog.create({
                    data: {
                        actorUserId: user.id,
                        action: 'STATUS_CHANGE',
                        entityType: 'User',
                        entityId: user.id,
                        metadata: { event: 'EMAIL_VERIFIED', role: user.role }
                    }
                });

                return updated;
            });

            if (!verifiedUser) {
                return res.status(400).json({ error: 'OTP_ALREADY_USED', message: 'This verification code is no longer valid. Request a new code.' });
            }

            // Gardener email verification activates the account, but KYC remains NOT_STARTED
            // until Admin approval. Job assignment logic must continue to enforce KYC status.
            await issueSession(verifiedUser, res);
            return res.json({
                user: publicUser(verifiedUser),
                message: 'Email verified successfully.'
            });
        } catch (error) {
            next(error);
        }
    });

    router.post('/resend-verification', resendLimiter, async(req, res, next) => {
        try {
            const input = resendSchema.parse(req.body);

            if (!isEmailDeliveryConfigured()) {
                return res.status(503).json({
                    error: 'EMAIL_PROVIDER_NOT_CONFIGURED',
                    message: 'Email verification is temporarily unavailable. Please contact support.'
                });
            }

            const genericResponse = {
                message: 'If an eligible unverified account exists, a new verification code has been sent.'
            };

            const user = await prisma.user.findUnique({ where: { email: input.email } });
            if (!user || user.emailVerifiedAt || ['BLOCKED', 'INACTIVE'].includes(user.status)) {
                return res.json(genericResponse);
            }

            const latestOtp = await prisma.emailOtp.findFirst({
                where: { userId: user.id },
                orderBy: { createdAt: 'desc' }
            });

            if (latestOtp) {
                const elapsedSeconds = Math.floor((Date.now() - latestOtp.createdAt.getTime()) / 1000);
                if (elapsedSeconds < env.OTP_RESEND_COOLDOWN_SECONDS) {
                    return res.json(genericResponse);
                }
            }

            await createAndSendOtp(user);
            return res.json(genericResponse);
        } catch (error) {
            next(error);
        }
    });

    router.post('/login', async(req, res, next) => {
        try {
            const input = loginSchema.parse(req.body);
            const user = await prisma.user.findUnique({
                where: { email: input.email },
                include: { customerProfile: true, gardenerProfile: true }
            });

            if (!user || !(await bcrypt.compare(input.password, user.passwordHash))) {
                return res.status(401).json({ error: 'INVALID_CREDENTIALS', message: 'Email or password is incorrect.' });
            }
            if (!user.emailVerifiedAt) {
                return res.status(403).json({
                    error: 'EMAIL_NOT_VERIFIED',
                    message: 'Verify your email address before signing in.',
                    verificationRequired: true,
                    email: user.email
                });
            }
            if (user.status !== 'ACTIVE') {
                return res.status(403).json({ error: 'ACCOUNT_UNAVAILABLE', message: 'This account is not currently active.' });
            }

            await prisma.$transaction([
                prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } }),
                prisma.auditLog.create({
                    data: { actorUserId: user.id, action: 'LOGIN', entityType: 'User', entityId: user.id }
                })
            ]);

            await issueSession(user, res);
            return res.json({ user: publicUser(user) });
        } catch (error) {
            next(error);
        }
    });

    router.post('/change-password', requireAuth, async(req, res, next) => {
        try {
            const input = changePasswordSchema.parse(req.body);
            const user = await prisma.user.findUnique({
                where: { id: req.auth.id },
                include: { customerProfile: true, gardenerProfile: true }
            });
            if (!user || user.status !== 'ACTIVE' || !user.emailVerifiedAt) {
                clearAuthCookies(res);
                return res.status(401).json({ error: 'INVALID_SESSION', message: 'Your session is no longer valid.' });
            }
            if (!(await bcrypt.compare(input.currentPassword, user.passwordHash))) {
                return res.status(401).json({ error: 'CURRENT_PASSWORD_INCORRECT', message: 'Current password is incorrect.' });
            }
            if (await bcrypt.compare(input.newPassword, user.passwordHash)) {
                return res.status(400).json({ error: 'PASSWORD_UNCHANGED', message: 'Choose a password different from your current password.' });
            }

            const passwordHash = await bcrypt.hash(input.newPassword, 12);
            await prisma.$transaction([
                prisma.user.update({ where: { id: user.id }, data: { passwordHash } }),
                prisma.refreshSession.updateMany({
                    where: { userId: user.id, revokedAt: null },
                    data: { revokedAt: new Date() }
                }),
                prisma.auditLog.create({
                    data: { actorUserId: user.id, action: 'UPDATE', entityType: 'User', entityId: user.id, metadata: { event: 'PASSWORD_CHANGED' } }
                })
            ]);

            const updatedUser = {...user, passwordHash };
            await issueSession(updatedUser, res);
            return res.json({ user: publicUser(updatedUser), message: 'Password changed successfully.' });
        } catch (error) {
            next(error);
        }
    });

    router.post('/refresh', async(req, res, next) => {
        try {
            const refreshToken = req.cookies?.tcare_refresh;
            if (!refreshToken) {
                return res.status(401).json({ error: 'UNAUTHENTICATED', message: 'Refresh session is required.' });
            }

            const session = await prisma.refreshSession.findUnique({
                where: { tokenHash: hashToken(refreshToken) },
                include: { user: { include: { customerProfile: true, gardenerProfile: true } } }
            });

            if (!session || session.revokedAt || session.expiresAt <= new Date() ||
                session.user.status !== 'ACTIVE' || !session.user.emailVerifiedAt) {
                clearAuthCookies(res);
                return res.status(401).json({ error: 'INVALID_REFRESH_SESSION', message: 'Refresh session is invalid, expired or not verified.' });
            }

            const replacementToken = createRefreshToken();
            const replacementHash = hashToken(replacementToken);
            const now = new Date();

            await prisma.$transaction([
                prisma.refreshSession.update({ where: { id: session.id }, data: { revokedAt: now, lastUsedAt: now } }),
                prisma.refreshSession.create({
                    data: {
                        userId: session.userId,
                        tokenHash: replacementHash,
                        expiresAt: new Date(now.getTime() + refreshTtlMs),
                        lastUsedAt: now
                    }
                })
            ]);

            setAuthCookies(res, createAccessToken(session.user), replacementToken);
            return res.json({ user: publicUser(session.user) });
        } catch (error) {
            next(error);
        }
    });

    router.post('/logout', async(req, res, next) => {
        try {
            const refreshToken = req.cookies?.tcare_refresh;
            if (refreshToken) {
                await prisma.refreshSession.updateMany({
                    where: { tokenHash: hashToken(refreshToken), revokedAt: null },
                    data: { revokedAt: new Date() }
                });
            }

            const accessToken = req.cookies?.tcare_access;
            if (accessToken) {
                try {
                    const payload = jwt.verify(accessToken, env.JWT_ACCESS_SECRET);
                    if (typeof payload === 'object' && payload.sub) {
                        await prisma.auditLog.create({
                            data: { actorUserId: String(payload.sub), action: 'LOGOUT', entityType: 'User', entityId: String(payload.sub) }
                        });
                    }
                } catch {
                    // Logout must remain successful even when the access token has expired.
                }
            }

            clearAuthCookies(res);
            return res.status(204).send();
        } catch (error) {
            next(error);
        }
    });

    // Frontend session bootstrap: a visitor with no cookies is a normal guest,
    // not an API error. If only a refresh cookie remains, return 401 so the
    // frontend can rotate it through POST /refresh and retry this endpoint.
    router.get('/session', async(req, res, next) => {
        res.set('Cache-Control', 'no-store');
        try {
            const accessToken = req.cookies?.tcare_access;
            const refreshToken = req.cookies?.tcare_refresh;

            if (!accessToken) {
                if (refreshToken) {
                    return res.status(401).json({
                        error: 'ACCESS_TOKEN_MISSING',
                        message: 'An access token needs to be restored from the refresh session.'
                    });
                }
                return res.json({ authenticated: false, user: null });
            }

            let payload;
            try {
                payload = jwt.verify(accessToken, env.JWT_ACCESS_SECRET, {
                    issuer: 't-care-api',
                    audience: 't-care-web'
                });
            } catch (tokenError) {
                if (refreshToken) {
                    return res.status(401).json({
                        error: 'ACCESS_TOKEN_EXPIRED',
                        message: 'The access token needs to be refreshed.'
                    });
                }
                clearAuthCookies(res);
                return res.json({ authenticated: false, user: null });
            }

            if (typeof payload !== 'object' || !payload.sub) {
                if (refreshToken) {
                    return res.status(401).json({ error: 'INVALID_ACCESS_TOKEN', message: 'The access token needs to be refreshed.' });
                }
                clearAuthCookies(res);
                return res.json({ authenticated: false, user: null });
            }

            const user = await prisma.user.findUnique({
                where: { id: String(payload.sub) },
                include: { customerProfile: true, gardenerProfile: true }
            });

            if (!user || user.status !== 'ACTIVE' || !user.emailVerifiedAt) {
                clearAuthCookies(res);
                return res.json({ authenticated: false, user: null });
            }

            return res.json({ authenticated: true, user: publicUser(user) });
        } catch (error) {
            next(error);
        }
    });

    router.get('/me', requireAuth, async(req, res, next) => {
        try {
            const user = await prisma.user.findUnique({
                where: { id: req.auth.id },
                include: { customerProfile: true, gardenerProfile: true }
            });
            if (!user || user.status !== 'ACTIVE' || !user.emailVerifiedAt) {
                clearAuthCookies(res);
                return res.status(401).json({ error: 'INVALID_SESSION', message: 'User session is no longer valid or email is unverified.' });
            }
            return res.json({ user: publicUser(user) });
        } catch (error) {
            next(error);
        }
    });

    return router;
}