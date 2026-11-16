import { env } from '../config/env.js';

function durationMs(value) {
  const [, amount, unit] = /^(\d+)([smhd])$/.exec(value);
  const factor = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[unit];
  return Number(amount) * factor;
}

export function getRefreshCookieOptions(audience = 'customer') {
  if (!['customer', 'admin'].includes(audience)) throw new TypeError('Unknown refresh-cookie audience');
  return Object.freeze({
  httpOnly: true,
  secure: env.nodeEnv === 'production',
  sameSite: env.authCookieSameSite,
  path: audience === 'admin' ? '/api/v1/admin/auth' : '/api/v1/auth',
  maxAge: durationMs(env.jwtRefreshTtl),
  });
}

export const refreshCookieOptions = getRefreshCookieOptions('customer');
