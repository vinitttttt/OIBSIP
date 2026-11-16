import { Router } from 'express';
import {
  cartAddItem, cartGet, cartRemoveItem, cartUpdateItem, catalogueDetail, catalogueList,
  customizerOptions, customizerPrice,
} from '../controllers/catalogueController.js';
import { authenticate, authorize } from '../middleware/authenticate.js';
import { validateBody } from '../middleware/validateRequest.js';
import { addCartItemSchema, cartQuantitySchema, customizationSchema } from '../validation/catalogueSchemas.js';

const router = Router();
router.get('/catalogue', catalogueList);
router.get('/catalogue/:id', catalogueDetail);
router.get('/customizer/options', customizerOptions);
router.post('/customizer/price', validateBody(customizationSchema), customizerPrice);
router.get('/cart', authenticate, authorize('customer'), cartGet);
router.post('/cart/items', authenticate, authorize('customer'), validateBody(addCartItemSchema), cartAddItem);
router.patch('/cart/items/:itemId', authenticate, authorize('customer'), validateBody(cartQuantitySchema), cartUpdateItem);
router.delete('/cart/items/:itemId', authenticate, authorize('customer'), cartRemoveItem);

export default router;
