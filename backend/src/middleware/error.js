import { ZodError } from 'zod';

export function notFound(req, res) {
  res.status(404).json({ error: 'NOT_FOUND', message: 'Route not found.' });
}

export function errorHandler(err, req, res, next) {
  console.error(err);
  if (res.headersSent) return next(err);

  if (err instanceof ZodError) {
    return res.status(400).json({
      error: 'VALIDATION_ERROR',
      message: 'Request validation failed.',
      details: err.issues.map(({ path, message, code }) => ({ path, message, code }))
    });
  }

  const statusCode = Number(err?.statusCode);
  if (Number.isInteger(statusCode) && statusCode >= 400 && statusCode <= 599) {
    return res.status(statusCode).json({
      error: typeof err.code === 'string' ? err.code : 'REQUEST_FAILED',
      message: typeof err.message === 'string' ? err.message : 'The request could not be completed.'
    });
  }

  res.status(500).json({ error: 'INTERNAL_SERVER_ERROR', message: 'An unexpected server error occurred.' });
}
