import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';

dotenv.config({ path: fileURLToPath(new URL('../../.env', import.meta.url)) });

const required = ['MONGODB_URI', 'CORS_ORIGIN'];
const missing = required.filter((name) => !process.env[name]?.trim());
if (missing.length) throw new Error(`Missing required environment variables: ${missing.join(', ')}`);

const port = Number(process.env.PORT ?? 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be a valid TCP port');

const nodeEnv = process.env.NODE_ENV ?? 'development';
if (!['development', 'test', 'production'].includes(nodeEnv)) throw new Error('NODE_ENV must be development, test, or production');

const corsOrigin = (process.env.CORS_ORIGIN ?? '').split(',').map((origin) => origin.trim()).filter(Boolean);
if (!corsOrigin.length || corsOrigin.some((origin) => {
  try {
    const parsed = new URL(origin);
    return !['http:', 'https:'].includes(parsed.protocol) || parsed.origin !== origin;
  } catch {
    return true;
  }
})) throw new Error('CORS_ORIGIN must contain comma-separated HTTP(S) origins without paths');

const frontendOrigin = process.env.FRONTEND_ORIGIN?.trim() || corsOrigin[0];
try {
  const parsedFrontendOrigin = new URL(frontendOrigin);
  if (!['http:', 'https:'].includes(parsedFrontendOrigin.protocol) || parsedFrontendOrigin.origin !== frontendOrigin) throw new Error();
} catch {
  throw new Error('FRONTEND_ORIGIN must be an HTTP(S) origin without a path');
}
const emailFrom = process.env.EMAIL_FROM?.trim() || 'onboarding@resend.dev';
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailFrom)) throw new Error('EMAIL_FROM must be a valid email address');

const authRequired = ['JWT_ACCESS_SECRET', 'JWT_ACCESS_TTL', 'JWT_REFRESH_SECRET', 'JWT_REFRESH_TTL', 'TOKEN_HASH_PEPPER'];
const missingAuth = authRequired.filter((name) => !process.env[name]?.trim());
if (missingAuth.length) throw new Error(`Missing required authentication environment variables: ${missingAuth.join(', ')}`);
for (const name of ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET', 'TOKEN_HASH_PEPPER']) {
  if (Buffer.byteLength(process.env[name], 'utf8') < 32) throw new Error(`${name} must be at least 32 bytes`);
  if (process.env[name].startsWith('replace-with-')) throw new Error(`${name} must be replaced with a locally generated secret`);
}
if (new Set(['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET', 'TOKEN_HASH_PEPPER'].map((name) => process.env[name])).size !== 3) {
  throw new Error('JWT secrets and token hash pepper must be distinct');
}

function durationMs(name, fallback, maximum) {
  const value = process.env[name] ?? fallback;
  const match = /^(\d+)([smhd])$/.exec(value);
  if (!match) throw new Error(`${name} must be a duration such as 15m or 7d`);
  const factor = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[match[2]];
  const result = Number(match[1]) * factor;
  if (!Number.isSafeInteger(result) || result <= 0 || result > maximum) throw new Error(`${name} must be a positive duration within its maximum`);
  return { value, milliseconds: result };
}

const accessTtl = durationMs('JWT_ACCESS_TTL', '15m', 15 * 60_000);
const refreshTtl = durationMs('JWT_REFRESH_TTL', '7d', 30 * 86_400_000);
const sameSite = process.env.AUTH_COOKIE_SAME_SITE ?? 'lax';
if (!['strict', 'lax', 'none'].includes(sameSite)) throw new Error('AUTH_COOKIE_SAME_SITE must be strict, lax, or none');
if (sameSite === 'none' && nodeEnv !== 'production') throw new Error('AUTH_COOKIE_SAME_SITE=none requires NODE_ENV=production and HTTPS');

function positiveInt(name, fallback, max) {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(value) || value <= 0 || value > max) throw new Error(`${name} must be a positive integer no greater than ${max}`);
  return value;
}

const authRateLimitWindowMs = positiveInt('AUTH_RATE_LIMIT_WINDOW_MS', '600000', 86_400_000);
const authRateLimits = Object.freeze({
  register: positiveInt('AUTH_REGISTER_RATE_LIMIT_MAX', '5', 1000),
  login: positiveInt('AUTH_LOGIN_RATE_LIMIT_MAX', '10', 1000),
  verification: positiveInt('AUTH_VERIFY_RATE_LIMIT_MAX', '10', 1000),
  passwordReset: positiveInt('AUTH_PASSWORD_RESET_RATE_LIMIT_MAX', '5', 1000),
});
const emailVerificationTtl = durationMs('EMAIL_VERIFICATION_TTL', '24h', 7 * 86_400_000);
const passwordResetTtl = durationMs('PASSWORD_RESET_TTL', '1h', 24 * 3_600_000);
const emailVerificationResendCooldown = durationMs('EMAIL_VERIFICATION_RESEND_COOLDOWN', '60s', 3_600_000);
const trustProxyHops = Number(process.env.TRUST_PROXY_HOPS ?? 0);
if (!Number.isInteger(trustProxyHops) || trustProxyHops < 0 || trustProxyHops > 5) throw new Error('TRUST_PROXY_HOPS must be an integer between 0 and 5');
const inventoryLowStockThreshold = positiveInt('INVENTORY_LOW_STOCK_THRESHOLD', '10', 1_000_000);
const inventoryAlertCheckIntervalMs = positiveInt('INVENTORY_ALERT_CHECK_INTERVAL_MS', '300000', 86_400_000);
const inventoryAlertEmail = process.env.INVENTORY_ALERT_EMAIL?.trim() || process.env.ADMIN_SEED_EMAIL?.trim().toLowerCase();
if (inventoryAlertEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(inventoryAlertEmail)) throw new Error('INVENTORY_ALERT_EMAIL must be a valid email address');
const mockPaymentsValue = process.env.MOCK_PAYMENTS_ENABLED?.trim().toLowerCase();
if (mockPaymentsValue && !['true', 'false'].includes(mockPaymentsValue)) throw new Error('MOCK_PAYMENTS_ENABLED must be true or false');
const mockPaymentsEnabled = mockPaymentsValue ? mockPaymentsValue === 'true' : nodeEnv !== 'production';
if (nodeEnv === 'production' && mockPaymentsEnabled) throw new Error('Mock payments must not be enabled in production');

export const env = Object.freeze({
  nodeEnv,
  port,
  mongoUri: process.env.MONGODB_URI,
  corsOrigin,
  frontendOrigin,
  resendApiKey: process.env.RESEND_API_KEY,
  emailFrom,
  emailVerificationTtl: emailVerificationTtl.milliseconds,
  emailVerificationTtlLabel: emailVerificationTtl.value,
  emailVerificationResendCooldown: emailVerificationResendCooldown.milliseconds,
  passwordResetTtl: passwordResetTtl.milliseconds,
  passwordResetTtlLabel: passwordResetTtl.value,
  adminSeedEmail: process.env.ADMIN_SEED_EMAIL?.trim().toLowerCase(),
  adminSeedPassword: process.env.ADMIN_SEED_PASSWORD,
  jwtAccessSecret: process.env.JWT_ACCESS_SECRET,
  jwtAccessTtl: accessTtl.value,
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET,
  jwtRefreshTtl: refreshTtl.value,
  tokenHashPepper: process.env.TOKEN_HASH_PEPPER,
  authCookieSameSite: sameSite,
  authRateLimitWindowMs,
  authRateLimits,
  trustProxyHops,
  inventoryLowStockThreshold,
  inventoryAlertEmail,
  inventoryAlertCheckIntervalMs,
  mockPaymentsEnabled,
});
