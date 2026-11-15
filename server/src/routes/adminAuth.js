import { Router } from 'express';
import { notImplemented } from '../controllers/authController.js';
import { authenticate, authorize } from '../middleware/authenticate.js';
import { authRateLimiters } from '../middleware/authRateLimit.js';
import { validateBody } from '../middleware/validateRequest.js';
import { loginSchema } from '../validation/authSchemas.js';

const router = Router();
router.post('/admin/auth/login', authRateLimiters.login, validateBody(loginSchema), notImplemented);
router.post('/admin/auth/logout', authenticate, authorize('admin'), notImplemented);
router.get('/admin/auth/me', authenticate, authorize('admin'), notImplemented);

export default router;
