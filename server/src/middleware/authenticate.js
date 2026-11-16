import { verifyAccessToken } from '../utils/tokens.js';
import { forbiddenError, unauthorizedError } from '../utils/authErrors.js';
import { User } from '../models/User.js';
import mongoose from 'mongoose';

export function authenticate(req, _res, next) {
  const header = req.get('authorization') ?? '';
  const match = /^Bearer\s+(.+)$/i.exec(header);
  if (!match) return next(unauthorizedError());
  let claims;
  try {
    claims = verifyAccessToken(match[1]);
    if (!claims || typeof claims !== 'object' || typeof claims.sub !== 'string' || !mongoose.isValidObjectId(claims.sub) ||
        !Number.isInteger(claims.exp) || claims.exp <= Math.floor(Date.now() / 1000) || !['customer', 'admin'].includes(claims.role)) {
      return next(unauthorizedError());
    }
  } catch {
    return next(unauthorizedError());
  }

  User.findById(claims.sub).select('_id role isActive').lean()
    .then((user) => {
      if (!user || user.isActive !== true || !['customer', 'admin'].includes(user.role)) {
        return next(unauthorizedError());
      }
      req.auth = { userId: String(user._id), role: user.role };
      return next();
    })
    .catch(next);
}

export function authorize(...roles) {
  return (req, _res, next) => {
    if (!req.auth) return next(unauthorizedError());
    if (!roles.includes(req.auth.role)) return next(forbiddenError());
    return next();
  };
}
