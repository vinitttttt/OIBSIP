import { createHmac, randomBytes } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

export function generateOpaqueToken(bytes = 32) {
  return randomBytes(bytes).toString('base64url');
}

export function hashToken(token) {
  return createHmac('sha256', env.tokenHashPepper).update(token).digest('hex');
}

export function createAccessToken(user) {
  const subject = String(user.id ?? user._id);
  if (!/^[a-f\d]{24}$/i.test(subject) || !['customer', 'admin'].includes(user.role)) {
    throw new TypeError('A valid user id and role are required to create an access token.');
  }
  return jwt.sign({ role: user.role }, env.jwtAccessSecret, {
    subject, expiresIn: env.jwtAccessTtl, issuer: 'pizzahop-api', audience: 'pizzahop-client', algorithm: 'HS256',
  });
}

export function verifyAccessToken(token) {
  return jwt.verify(token, env.jwtAccessSecret, { issuer: 'pizzahop-api', audience: 'pizzahop-client', algorithms: ['HS256'] });
}
