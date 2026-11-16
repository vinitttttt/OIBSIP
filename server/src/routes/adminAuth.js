import { Router } from 'express';
import { currentUser, loginAdmin, logoutAdmin, refreshAdmin } from '../controllers/authController.js';
import { authenticate, authorize } from '../middleware/authenticate.js';
import { authRateLimiters } from '../middleware/authRateLimit.js';
import { validateBody } from '../middleware/validateRequest.js';
import { requireTrustedOrigin } from '../middleware/csrfOrigin.js';
import { loginSchema } from '../validation/authSchemas.js';

const router = Router();
router.post('/admin/auth/login', authRateLimiters.login, validateBody(loginSchema), loginAdmin);
router.post('/admin/auth/refresh', requireTrustedOrigin, refreshAdmin);
router.post('/admin/auth/logout', requireTrustedOrigin, logoutAdmin);
router.get('/admin/auth/me', authenticate, authorize('admin'), currentUser);

export default router;
