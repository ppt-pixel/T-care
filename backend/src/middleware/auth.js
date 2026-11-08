import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { prisma } from '../lib/prisma.js';

export async function requireAuth(req, res, next) {
  const token = req.cookies?.tcare_access;
  if (!token) return res.status(401).json({ error: 'UNAUTHENTICATED', message: 'Authentication required.' });

  try {
    const payload = jwt.verify(token, env.JWT_ACCESS_SECRET, {
      issuer: 't-care-api',
      audience: 't-care-web'
    });
    if (typeof payload !== 'object' || !payload.sub) {
      throw new Error('Invalid access token payload');
    }

    const user = await prisma.user.findUnique({
      where: { id: String(payload.sub) },
      select: { id: true, email: true, fullName: true, role: true, status: true, emailVerifiedAt: true }
    });

    if (!user || user.status !== 'ACTIVE' || !user.emailVerifiedAt) {
      return res.status(401).json({ error: 'INVALID_SESSION', message: 'Session is invalid, expired or email is unverified.' });
    }

    // Role is read from the database rather than trusted from the browser token.
    // This makes role changes/revocation effective immediately for protected APIs.
    req.auth = user;
    next();
  } catch (error) {
    if (error?.name === 'JsonWebTokenError' || error?.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'INVALID_SESSION', message: 'Session is invalid, expired or email is unverified.' });
    }
    next(error);
  }
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.auth) return res.status(401).json({ error: 'UNAUTHENTICATED', message: 'Authentication required.' });
    if (!roles.includes(req.auth.role)) {
      return res.status(403).json({ error: 'FORBIDDEN', message: 'You do not have permission to access this resource.' });
    }
    next();
  };
}
