import { z } from 'zod';

const email = z.preprocess(
  (value) => typeof value === 'string' ? value.trim().toLowerCase() : value,
  z.string().min(3).max(254).email(),
);

const bcryptSafePassword = z.string().min(12).max(128)
  .refine((value) => Buffer.byteLength(value, 'utf8') <= 72, 'Password must be at most 72 UTF-8 bytes.')
  .refine((value) => /[a-z]/.test(value) && /[A-Z]/.test(value) && /\d/.test(value) && /[^A-Za-z0-9]/.test(value),
    'Password must include lowercase, uppercase, numeric and symbol characters.');

const loginPassword = z.string().min(1).max(128)
  .refine((value) => Buffer.byteLength(value, 'utf8') <= 72, 'Password is too long.');

const displayName = z.string().trim().min(1).max(100)
  .refine((value) => !/[\u0000-\u001f\u007f]/.test(value), 'Name contains unsupported control characters.');

const opaqueToken = z.string().min(43).max(128).regex(/^[A-Za-z0-9_-]+$/);

export const registerSchema = z.object({
  name: displayName,
  email,
  password: bcryptSafePassword,
}).strict();

export const loginSchema = z.object({ email, password: loginPassword }).strict();
export const emailSchema = z.object({ email }).strict();
export const tokenSchema = z.object({ token: opaqueToken }).strict();
export const resetPasswordSchema = z.object({ token: opaqueToken, password: bcryptSafePassword }).strict();

export { bcryptSafePassword, loginPassword, opaqueToken };
