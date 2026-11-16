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

export function endpointNotImplemented() {
  throw authError(501, 'AUTH_FLOW_NOT_IMPLEMENTED', 'This authentication flow is not available yet.');
}
