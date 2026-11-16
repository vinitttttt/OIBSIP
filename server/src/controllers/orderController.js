import { createCustomerOrder, getCustomerOrder, listCustomerOrders } from '../services/orderService.js';
import { getCustomerOrderTracking } from '../services/adminOrderService.js';

export async function createOrder(req, res, next) {
  try {
    const order = await createCustomerOrder(req.auth.userId, req.get('Idempotency-Key'));
    res.status(201).json({ order });
  } catch (error) { next(error); }
}

export async function listOrders(req, res, next) {
  try { res.json({ orders: await listCustomerOrders(req.auth.userId) }); } catch (error) { next(error); }
}

export async function getOrder(req, res, next) {
  try { res.json({ order: await getCustomerOrder(req.auth.userId, req.params.id) }); } catch (error) { next(error); }
}

export async function getOrderTracking(req, res, next) {
  try { res.json({ tracking: await getCustomerOrderTracking(req.auth.userId, req.params.id) }); } catch (error) { next(error); }
}
