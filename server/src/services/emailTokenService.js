import { EmailToken } from '../models/EmailToken.js';
import { authError } from '../utils/authErrors.js';
import { hashToken } from '../utils/tokens.js';

const purposes = new Set(['email_verification', 'password_reset']);

export async function consumeEmailToken({ token, purpose, now = new Date() }) {
  if (!purposes.has(purpose) || typeof token !== 'string' || !/^[A-Za-z0-9_-]{43,128}$/.test(token)) {
    throw authError(400, 'INVALID_OR_EXPIRED_TOKEN', 'This token is invalid or expired.');
  }
  const consumed = await EmailToken.findOneAndUpdate(
    { tokenHash: hashToken(token), purpose, usedAt: null, expiresAt: { $gt: now } },
    { $set: { usedAt: now } },
    { new: true, runValidators: true },
  ).select('_id user purpose expiresAt usedAt');

  if (!consumed) throw authError(400, 'INVALID_OR_EXPIRED_TOKEN', 'This token is invalid or expired.');
  return consumed;
}
