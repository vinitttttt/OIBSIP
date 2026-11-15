import bcrypt from 'bcryptjs';

const COST = 12;

function withinBcryptLimit(password) {
  return typeof password === 'string' && Buffer.byteLength(password, 'utf8') <= 72;
}

export function hashPassword(password) {
  if (!withinBcryptLimit(password)) throw new TypeError('Password must be a string of at most 72 UTF-8 bytes.');
  return bcrypt.hash(password, COST);
}

export function comparePassword(password, passwordHash) {
  if (!withinBcryptLimit(password) || typeof passwordHash !== 'string') return Promise.resolve(false);
  return bcrypt.compare(password, passwordHash);
}
