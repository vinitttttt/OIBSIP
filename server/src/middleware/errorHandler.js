export function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);
  const isParserError = error.type === 'entity.parse.failed' || error.type === 'entity.too.large';
  const status = error.expose === true && Number.isInteger(error.status)
    ? error.status
    : error.type === 'entity.too.large' ? 413 : isParserError ? 400 : 500;
  if (status >= 500 && status !== 501) {
    const details = { status, method: req.method, route: req.route?.path ?? 'unmatched', name: error.name ?? 'Error' };
    if (error.code && typeof error.code === 'string' && /^[A-Z0-9_]+$/.test(error.code)) details.code = error.code;
    if (process.env.NODE_ENV !== 'production' && typeof error.stack === 'string') {
      details.stack = error.stack.split('\n').slice(1).join('\n');
    }
    console.error('Request failed', details);
  }
  res.status(status).json({
    error: {
      code: error.expose === true ? error.code : status === 413 ? 'PAYLOAD_TOO_LARGE' : status === 400 ? 'INVALID_REQUEST' : 'INTERNAL_SERVER_ERROR',
      message: error.expose === true ? error.message : status === 413 ? 'Request body is too large.' : status === 400 ? 'Request body is invalid.' : 'An unexpected server error occurred.',
    },
  });
}
