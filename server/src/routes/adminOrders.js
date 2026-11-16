import { Router } from 'express';
import { adminOrderDetail, adminOrderList, adminOrderStatusUpdate } from '../controllers/adminOrderController.js';
import { authenticate, authorize } from '../middleware/authenticate.js';
import { requireTrustedOrigin } from '../middleware/csrfOrigin.js';
import { validateBody } from '../middleware/validateRequest.js';
import { updateOrderStatusSchema } from '../validation/adminOrderSchemas.js';

const router = Router();
router.use('/admin/orders', authenticate, authorize('admin'));
router.get('/admin/orders', adminOrderList);
router.get('/admin/orders/:id', adminOrderDetail);
router.patch('/admin/orders/:id/status', requireTrustedOrigin, validateBody(updateOrderStatusSchema), adminOrderStatusUpdate);

export default router;
