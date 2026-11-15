import { Router } from 'express';
import { notImplemented } from '../controllers/authController.js';
import { authenticate, authorize } from '../middleware/authenticate.js';
import { authRateLimiters } from '../middleware/authRateLimit.js';
import { requireTrustedOrigin } from '../middleware/csrfOrigin.js';
import { validateBody } from '../middleware/validateRequest.js';
import { emailSchema, loginSchema, registerSchema, resetPasswordSchema, tokenSchema } from '../validation/authSchemas.js';

const router = Router();
router.post('/auth/register', authRateLimiters.register, validateBody(registerSchema), notImplemented);
router.post('/auth/verify-email', authRateLimiters.verification, validateBody(tokenSchema), notImplemented);
router.post('/auth/login', authRateLimiters.login, validateBody(loginSchema), notImplemented);
router.post('/auth/refresh', requireTrustedOrigin, notImplemented);
router.post('/auth/logout', requireTrustedOrigin, notImplemented);
router.post('/auth/forgot-password', authRateLimiters.passwordReset, validateBody(emailSchema), notImplemented);
router.post('/auth/reset-password', authRateLimiters.passwordReset, validateBody(resetPasswordSchema), notImplemented);
router.get('/auth/me', authenticate, authorize('customer'), notImplemented);

export default router;
