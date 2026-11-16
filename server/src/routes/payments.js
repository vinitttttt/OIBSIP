import { Router } from 'express';
import { confirmMock, initializeMock } from '../controllers/paymentController.js';
import { authenticate, authorize } from '../middleware/authenticate.js';
import { validateBody } from '../middleware/validateRequest.js';
import { confirmMockPaymentSchema, initializePaymentSchema } from '../validation/orderSchemas.js';

const router = Router();
router.use('/payments/mock', authenticate, authorize('customer'));
router.post('/payments/mock/initialize', validateBody(initializePaymentSchema), initializeMock);
router.post('/payments/mock/confirm', validateBody(confirmMockPaymentSchema), confirmMock);

export default router;
