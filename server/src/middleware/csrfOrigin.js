import { env } from '../config/env.js';
import { authError } from '../utils/authErrors.js';

export function requireTrustedOrigin(req, _res, next) {
  const origin = req.get('origin');
  if (!origin || !env.corsOrigin.includes(origin)) {
    return next(authError(403, 'CSRF_ORIGIN_REJECTED', 'Request origin is not allowed.'));
  }
  return next();
}
