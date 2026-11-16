import { Router } from 'express';
import { inventoryAdjust, inventoryList, inventorySummary } from '../controllers/inventoryController.js';
import { authenticate, authorize } from '../middleware/authenticate.js';
import { requireTrustedOrigin } from '../middleware/csrfOrigin.js';
import { validateBody } from '../middleware/validateRequest.js';
import { stockAdjustmentSchema } from '../validation/inventorySchemas.js';

const router = Router();
router.use('/admin/inventory', authenticate, authorize('admin'));
router.get('/admin/inventory', inventoryList);
router.get('/admin/inventory/summary', inventorySummary);
router.patch('/admin/inventory/:id', requireTrustedOrigin, validateBody(stockAdjustmentSchema), inventoryAdjust);

export default router;
