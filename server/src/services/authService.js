import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { EmailToken } from '../models/EmailToken.js';
import { User } from '../models/User.js';
import { authError } from '../utils/authErrors.js';
import { hashPassword } from '../utils/passwords.js';
import { generateOpaqueToken, hashToken } from '../utils/tokens.js';
import { sendTransactionalEmail } from './emailService.js';
import { verificationEmail } from './emailTemplate.js';
import { consumeEmailToken } from './emailTokenService.js';
import { comparePassword } from '../utils/passwords.js';
import { createAccessToken } from '../utils/tokens.js';
import { passwordResetEmail } from './emailTemplate.js';
import { randomUUID } from 'node:crypto';
import { RefreshSession } from '../models/RefreshSession.js';
import { bcryptSafePassword } from '../validation/authSchemas.js';

const genericResendMessage = 'If an unverified customer account matches that address, a verification email will arrive shortly.';

async function issueVerificationEmail(user, { now = new Date(), deliver = sendTransactionalEmail } = {}) {
  const rawToken = generateOpaqueToken();
  const expiresAt = new Date(now.getTime() + env.emailVerificationTtl);
  const tokenRecord = await EmailToken.create({
    user: user._id,
    purpose: 'email_verification',
    tokenHash: hashToken(rawToken),
    expiresAt,
  });
  const verificationUrl = new URL('/verify-email', `${env.frontendOrigin}/`);
  verificationUrl.searchParams.set('token', rawToken);
  const content = verificationEmail({ name: user.name, verificationUrl: verificationUrl.toString(), expiryLabel: env.emailVerificationTtlLabel });
  try {
    await deliver({ to: user.email, ...content });
  } catch {
    await EmailToken.deleteOne({ _id: tokenRecord._id });
    return false;
  }
  return true;
}

export async function registerCustomer({ name, email, password }, options) {
  const passwordHash = await hashPassword(password);
  let user;
  try {
    user = await User.create({ name, email, passwordHash, role: 'customer', emailVerifiedAt: null });
  } catch (error) {
    if (error?.code === 11000 && error?.keyPattern?.email) {
      throw authError(409, 'REGISTRATION_UNAVAILABLE', 'An account could not be created with that email address.');
    }
    throw error;
  }
  const emailSent = await issueVerificationEmail(user, options);
  return { user, emailSent };
}

export async function verifyCustomerEmail(token) {
  const session = await mongoose.startSession();
  let verifiedUserId;
  try {
    await session.withTransaction(async () => {
      const consumed = await consumeEmailToken({ token, purpose: 'email_verification', session });
      const result = await User.updateOne(
        { _id: consumed.user, role: 'customer', emailVerifiedAt: null },
        { $set: { emailVerifiedAt: new Date() } },
        { session, runValidators: true },
      );
      if (result.modifiedCount !== 1) throw authError(400, 'INVALID_OR_EXPIRED_TOKEN', 'This token is invalid or expired.');
      verifiedUserId = consumed.user;
    });
  } finally {
    await session.endSession();
  }
  return User.findById(verifiedUserId);
}

export async function resendCustomerVerification(email, { now = new Date(), deliver = sendTransactionalEmail } = {}) {
  const user = await User.findOne({ email, role: 'customer', emailVerifiedAt: null });
  if (!user) return { message: genericResendMessage };

  const recentToken = await EmailToken.findOne({
    user: user._id,
    purpose: 'email_verification',
    usedAt: null,
    expiresAt: { $gt: now },
  }).sort({ createdAt: -1 }).select('createdAt');
  if (recentToken && now.getTime() - recentToken.createdAt.getTime() < env.emailVerificationResendCooldown) {
    return { message: genericResendMessage };
  }

  await EmailToken.updateMany(
    { user: user._id, purpose: 'email_verification', usedAt: null },
    { $set: { usedAt: now } },
  );
  await issueVerificationEmail(user, { now, deliver });
  return { message: genericResendMessage };
}

const loginRejected = () => authError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect.');

function cookieValue(req, name) {
  const raw = req.get('cookie') ?? '';
  for (const item of raw.split(';')) {
    const separator = item.indexOf('=');
    if (separator > 0 && item.slice(0, separator).trim() === name) return decodeURIComponent(item.slice(separator + 1).trim());
  }
  return null;
}

function cookieName(audience) { return audience === 'admin' ? 'pizzahop_admin_refresh' : 'pizzahop_refresh'; }

async function issueSession(user) {
  const token = generateOpaqueToken();
  const expiresAt = new Date(Date.now() + durationMs(env.jwtRefreshTtl));
  await RefreshSession.create({ userId: user._id, familyId: randomUUID(), tokenHash: hashToken(token), expiresAt });
  return { accessToken: createAccessToken(user), refreshToken: token, user };
}

function durationMs(value) {
  const [, amount, unit] = /^(\d+)([smhd])$/.exec(value);
  return Number(amount) * { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[unit];
}

export async function login({ email, password }, audience = 'customer') {
  const user = await User.findOne({ email, role: audience }).select('+passwordHash');
  if (!user || user.isActive !== true || !(await comparePassword(password, user.passwordHash))) throw loginRejected();
  if (audience === 'customer' && !user.emailVerifiedAt) throw authError(403, 'EMAIL_NOT_VERIFIED', 'Verify your email before signing in.');
  return issueSession(user);
}

export async function refresh(req, audience = 'customer') {
  const token = cookieValue(req, cookieName(audience));
  if (!token || !/^[A-Za-z0-9_-]{43,128}$/.test(token)) throw authError(401, 'UNAUTHORIZED', 'Authentication is required.');
  const now = new Date();
  const hash = hashToken(token);
  const prior = await RefreshSession.findOne({ tokenHash: hash }).select('+tokenHash');
  if (!prior || prior.expiresAt <= now) throw authError(401, 'UNAUTHORIZED', 'Authentication is required.');
  if (prior.revokedAt) {
    await RefreshSession.updateMany({ userId: prior.userId, familyId: prior.familyId, revokedAt: null }, { $set: { revokedAt: now, reuseDetectedAt: now } });
    throw authError(401, 'UNAUTHORIZED', 'Authentication is required.');
  }

  const session = await mongoose.startSession();
  let successorToken;
  let user;
  let reused = false;
  try {
    await session.withTransaction(async () => {
      const current = await RefreshSession.findOne({ _id: prior._id, tokenHash: hash, revokedAt: null, expiresAt: { $gt: now } }).session(session);
      if (!current) { reused = true; return; }
      user = await User.findOne({ _id: current.userId, role: audience, isActive: true, ...(audience === 'customer' ? { emailVerifiedAt: { $ne: null } } : {}) }).session(session);
      if (!user) throw authError(401, 'UNAUTHORIZED', 'Authentication is required.');
      successorToken = generateOpaqueToken();
      const successor = new RefreshSession({ userId: user._id, familyId: current.familyId, tokenHash: hashToken(successorToken), expiresAt: new Date(now.getTime() + durationMs(env.jwtRefreshTtl)) });
      await successor.save({ session });
      const result = await RefreshSession.updateOne({ _id: current._id, revokedAt: null }, { $set: { revokedAt: now, replacedBy: successor._id } }, { session });
      if (result.modifiedCount !== 1) throw authError(401, 'UNAUTHORIZED', 'Authentication is required.');
    });
  } catch (error) {
    if (error?.code === 11000) reused = true;
    else throw error;
  } finally { await session.endSession(); }
  if (reused) {
    await RefreshSession.updateMany({ userId: prior.userId, familyId: prior.familyId, revokedAt: null }, { $set: { revokedAt: now, reuseDetectedAt: now } });
    throw authError(401, 'UNAUTHORIZED', 'Authentication is required.');
  }
  return { accessToken: createAccessToken(user), refreshToken: successorToken, user };
}

export async function logout(req, audience = 'customer') {
  const token = cookieValue(req, cookieName(audience));
  if (token && /^[A-Za-z0-9_-]{43,128}$/.test(token)) {
    await RefreshSession.updateOne({ tokenHash: hashToken(token), revokedAt: null }, { $set: { revokedAt: new Date() } });
  }
}

export async function requestPasswordReset(email, { now = new Date(), deliver = sendTransactionalEmail } = {}) {
  const generic = { message: 'If an account matches that address, a password reset email will arrive shortly.' };
  const user = await User.findOne({ email, role: 'customer', isActive: true });
  if (!user) return generic;
  const rawToken = generateOpaqueToken();
  const expiresAt = new Date(now.getTime() + env.passwordResetTtl);
  const record = await EmailToken.create({ user: user._id, purpose: 'password_reset', tokenHash: hashToken(rawToken), expiresAt });
  const resetUrl = new URL('/reset-password', `${env.frontendOrigin}/`);
  resetUrl.searchParams.set('token', rawToken);
  try { await deliver({ to: user.email, ...passwordResetEmail({ name: user.name, resetUrl: resetUrl.toString(), expiryLabel: env.passwordResetTtlLabel }) }); }
  catch { await EmailToken.deleteOne({ _id: record._id }); }
  return generic;
}

export async function resetPassword(token, password) {
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const consumed = await consumeEmailToken({ token, purpose: 'password_reset', session });
      const passwordHash = await hashPassword(password);
      const changed = await User.updateOne({ _id: consumed.user, role: 'customer', isActive: true }, { $set: { passwordHash } }, { session });
      if (changed.modifiedCount !== 1) throw authError(400, 'INVALID_OR_EXPIRED_TOKEN', 'This token is invalid or expired.');
      await RefreshSession.updateMany({ userId: consumed.user, revokedAt: null }, { $set: { revokedAt: new Date() } }, { session });
    });
  } finally { await session.endSession(); }
}

export async function seedAdmin() {
  const { adminSeedEmail: email, adminSeedPassword: password } = env;
  if (!email || !password) throw new Error('Set ADMIN_SEED_EMAIL and ADMIN_SEED_PASSWORD to seed the initial admin.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !bcryptSafePassword.safeParse(password).success) throw new Error('Admin seed credentials are invalid or the password does not meet the account password policy.');
  const existing = await User.findOne({ email });
  if (existing) {
    if (existing.role !== 'admin') throw new Error('Admin seed email belongs to a non-admin account.');
    return existing;
  }
  const passwordHash = await hashPassword(password);
  try { return await User.create({ name: 'PizzaHop Admin', email, passwordHash, role: 'admin', emailVerifiedAt: new Date() }); }
  catch (error) {
    if (error?.code === 11000) {
      const raced = await User.findOne({ email });
      if (raced?.role === 'admin') return raced;
    }
    throw error;
  }
}
