import { Router } from 'express';
import { createOrder, getOrder, getOrderTracking, listOrders } from '../controllers/orderController.js';
import { authenticate, authorize } from '../middleware/authenticate.js';
import { validateBody } from '../middleware/validateRequest.js';
import { createOrderSchema } from '../validation/orderSchemas.js';

const router = Router();
router.use('/orders', authenticate, authorize('customer'));
router.post('/orders', validateBody(createOrderSchema), createOrder);
router.get('/orders', listOrders);
router.get('/orders/:id/tracking', getOrderTracking);
router.get('/orders/:id', getOrder);

export default router;
