import { rateLimit } from 'express-rate-limit';
import { env } from '../config/env.js';

export function createAuthRateLimiter(limit, windowMs = env.authRateLimitWindowMs) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: { code: 'RATE_LIMITED', message: 'Too many attempts. Please try again later.' } },
  });
}

export const authRateLimiters = Object.freeze({
  register: createAuthRateLimiter(env.authRateLimits.register),
  login: createAuthRateLimiter(env.authRateLimits.login),
  verification: createAuthRateLimiter(env.authRateLimits.verification),
  passwordReset: createAuthRateLimiter(env.authRateLimits.passwordReset),
});
