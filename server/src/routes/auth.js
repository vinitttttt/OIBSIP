import { Router } from 'express';
import { currentUser, forgotPassword, loginCustomer, logoutCustomer, refreshCustomer, register, resendVerification, resetPasswordHandler, verifyEmail } from '../controllers/authController.js';
import { authenticate, authorize } from '../middleware/authenticate.js';
import { authRateLimiters } from '../middleware/authRateLimit.js';
import { requireTrustedOrigin } from '../middleware/csrfOrigin.js';
import { validateBody } from '../middleware/validateRequest.js';
import { emailSchema, loginSchema, registerSchema, resetPasswordSchema, tokenSchema } from '../validation/authSchemas.js';

const router = Router();
router.post('/auth/register', authRateLimiters.register, validateBody(registerSchema), register);
router.post('/auth/verify-email', authRateLimiters.verification, validateBody(tokenSchema), verifyEmail);
router.post('/auth/resend-verification', authRateLimiters.verification, validateBody(emailSchema), resendVerification);
router.post('/auth/login', authRateLimiters.login, validateBody(loginSchema), loginCustomer);
router.post('/auth/refresh', requireTrustedOrigin, refreshCustomer);
router.post('/auth/logout', requireTrustedOrigin, logoutCustomer);
router.post('/auth/forgot-password', authRateLimiters.passwordReset, validateBody(emailSchema), forgotPassword);
router.post('/auth/reset-password', authRateLimiters.passwordReset, validateBody(resetPasswordSchema), resetPasswordHandler);
router.get('/auth/me', authenticate, authorize('customer'), currentUser);

export default router;
