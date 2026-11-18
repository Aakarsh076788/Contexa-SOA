export function errorHandler(err, req, res, next) {
  const databaseUnavailable = ['ECONNREFUSED', 'ETIMEDOUT', 'P1001', 'P1002', 'P1017'].includes(err.code);
  const status = databaseUnavailable ? 503 : Number.isInteger(err.status) && err.status >= 400 && err.status < 600 ? err.status : 500;
  if (process.env.NODE_ENV !== 'test') {
    console.error(JSON.stringify({ level: 'error', event: 'request_failed', requestId: req.requestId, status, code: databaseUnavailable ? 'DATABASE_UNAVAILABLE' : 'REQUEST_FAILED' }));
  }
  const message = databaseUnavailable
    ? 'The database is unavailable. Please try again once the database service is running.'
    : status >= 500 ? 'An unexpected server error occurred.' : err.message || 'Request failed.';
  res.status(status).json({ error: message });
}
