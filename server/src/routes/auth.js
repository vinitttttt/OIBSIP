import { Router } from 'express';
import { notImplemented, register, resendVerification, verifyEmail } from '../controllers/authController.js';
import { authenticate, authorize } from '../middleware/authenticate.js';
import { authRateLimiters } from '../middleware/authRateLimit.js';
import { requireTrustedOrigin } from '../middleware/csrfOrigin.js';
import { validateBody } from '../middleware/validateRequest.js';
import { emailSchema, loginSchema, registerSchema, resetPasswordSchema, tokenSchema } from '../validation/authSchemas.js';

const router = Router();
router.post('/auth/register', authRateLimiters.register, validateBody(registerSchema), register);
router.post('/auth/verify-email', authRateLimiters.verification, validateBody(tokenSchema), verifyEmail);
router.post('/auth/resend-verification', authRateLimiters.verification, validateBody(emailSchema), resendVerification);
router.post('/auth/login', authRateLimiters.login, validateBody(loginSchema), notImplemented);
router.post('/auth/refresh', requireTrustedOrigin, notImplemented);
router.post('/auth/logout', requireTrustedOrigin, notImplemented);
router.post('/auth/forgot-password', authRateLimiters.passwordReset, validateBody(emailSchema), notImplemented);
router.post('/auth/reset-password', authRateLimiters.passwordReset, validateBody(resetPasswordSchema), notImplemented);
router.get('/auth/me', authenticate, authorize('customer'), notImplemented);

export default router;
