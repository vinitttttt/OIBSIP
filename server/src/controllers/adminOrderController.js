import { getAdminOrder, listAdminOrders, updateAdminOrderStatus } from '../services/adminOrderService.js';

export async function adminOrderList(req, res, next) {
  try { res.json(await listAdminOrders(req.query.status)); } catch (error) { next(error); }
}

export async function adminOrderDetail(req, res, next) {
  try { res.json({ order: await getAdminOrder(req.params.id) }); } catch (error) { next(error); }
}

export async function adminOrderStatusUpdate(req, res, next) {
  try { res.json({ order: await updateAdminOrderStatus(req.params.id, req.validatedBody.status, req.auth.userId) }); } catch (error) { next(error); }
}
