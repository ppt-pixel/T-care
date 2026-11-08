import crypto from 'node:crypto';

const buckets = new Map();

export function requestSecurity(req, res, next) {
  const requestId = req.get('x-request-id')?.slice(0, 100) || crypto.randomUUID();
  res.setHeader('X-Request-Id', requestId);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  if (process.env.NODE_ENV === 'production') res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  next();
}

export function createRateLimiter({ windowMs = 60_000, max = 60, keyPrefix = 'global' } = {}) {
  return (req, res, next) => {
    const key = `${keyPrefix}:${req.ip || req.socket.remoteAddress || 'unknown'}`;
    const now = Date.now();
    let bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) bucket = { count: 0, resetAt: now + windowMs };
    bucket.count += 1;
    buckets.set(key, bucket);
    if (buckets.size > 10_000) {
      for (const [k, v] of buckets) if (v.resetAt <= now) buckets.delete(k);
    }
    res.setHeader('RateLimit-Limit', String(max));
    res.setHeader('RateLimit-Remaining', String(Math.max(0, max - bucket.count)));
    res.setHeader('RateLimit-Reset', String(Math.ceil((bucket.resetAt - now) / 1000)));
    if (bucket.count > max) {
      return res.status(429).json({ error: 'RATE_LIMITED', message: 'Too many requests. Please try again later.' });
    }
    next();
  };
}


export function requireTrustedOrigin(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (req.path === '/webhook') return next();
  if (process.env.NODE_ENV !== 'production') return next();
  const origin = req.get('origin');
  const referer = req.get('referer');
  if (origin === process.env.FRONTEND_ORIGIN) return next();
  if (!origin && referer && referer.startsWith(process.env.FRONTEND_ORIGIN + '/')) return next();
  return res.status(403).json({ error: 'UNTRUSTED_ORIGIN', message: 'Request origin is not allowed.' });
}
