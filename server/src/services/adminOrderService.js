import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { Order } from '../models/Order.js';
import { User } from '../models/User.js';
import { authError } from '../utils/authErrors.js';
import { sendTransactionalEmail } from './emailService.js';
import { serializeOrder } from './orderService.js';

const transitions = Object.freeze({
  PLACED: ['CONFIRMED'],
  CONFIRMED: ['PREPARING'],
  PREPARING: ['OUT_FOR_DELIVERY'],
  OUT_FOR_DELIVERY: ['DELIVERED'],
  DELIVERED: [],
});

function serializeAdminOrder(order) {
  const customer = order.customerId && typeof order.customerId === 'object' && order.customerId.name
    ? { id: String(order.customerId._id), name: order.customerId.name, email: order.customerId.email }
    : { id: String(order.customerId), name: 'Customer', email: '' };
  return { ...serializeOrder(order), customer };
}

function statusHistoryFrom(order) {
  const result = serializeOrder(order);
  return result.statusHistory;
}

function isStatus(value) {
  return ['PLACED', 'CONFIRMED', 'PREPARING', 'OUT_FOR_DELIVERY', 'DELIVERED'].includes(value);
}

export async function listAdminOrders(status) {
  if (status !== undefined && !isStatus(status)) throw authError(400, 'INVALID_ORDER_STATUS', 'Order status filter is invalid.');
  const filter = status === 'PLACED'
    ? { $or: [{ fulfillmentStatus: 'PLACED' }, { fulfillmentStatus: { $exists: false } }] }
    : status ? { fulfillmentStatus: status } : {};
  const [orders, statusCounts] = await Promise.all([
    Order.find(filter).populate('customerId', 'name email').sort({ createdAt: -1 }).limit(100).lean(),
    Order.aggregate([
      { $set: { normalizedStatus: { $ifNull: ['$fulfillmentStatus', 'PLACED'] } } },
      { $group: { _id: '$normalizedStatus', count: { $sum: 1 } } },
    ]),
  ]);
  const summary = Object.fromEntries(['PLACED', 'CONFIRMED', 'PREPARING', 'OUT_FOR_DELIVERY', 'DELIVERED'].map((key) => [key, 0]));
  for (const entry of statusCounts) if (summary[entry._id] !== undefined) summary[entry._id] = entry.count;
  return { orders: orders.map(serializeAdminOrder), summary, limit: 100 };
}

export async function getAdminOrder(orderId) {
  if (!mongoose.isValidObjectId(orderId)) throw authError(400, 'INVALID_ORDER_ID', 'Order id is invalid.');
  const order = await Order.findById(orderId).populate('customerId', 'name email');
  if (!order) throw authError(404, 'ORDER_NOT_FOUND', 'Order was not found.');
  return serializeAdminOrder(order);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

async function notifyCustomer(order, customer, status) {
  if (!env.resendApiKey || !customer?.email) return;
  const name = escapeHtml(customer.name || 'PizzaHop customer');
  const safeStatus = escapeHtml(status.replaceAll('_', ' ').toLowerCase());
  const url = `${env.frontendOrigin}/orders/${order._id}`;
  const safeUrl = escapeHtml(url);
  try {
    await sendTransactionalEmail({
      to: customer.email,
      subject: `PizzaHop order update: ${status.replaceAll('_', ' ')}`,
      text: `Hi ${customer.name || 'there'}, your PizzaHop order status is now ${status.replaceAll('_', ' ')}. Track it at ${url}`,
      html: `<p>Hi ${name},</p><p>Your PizzaHop order status is now <strong>${safeStatus}</strong>.</p><p><a href="${safeUrl}">Track your order</a></p>`,
    });
  } catch (error) {
    console.error('Order status email failed', { orderId: String(order._id), name: error.name ?? 'Error' });
  }
}

export async function updateAdminOrderStatus(orderId, nextStatus, adminId, { now = new Date() } = {}) {
  if (!mongoose.isValidObjectId(orderId)) throw authError(400, 'INVALID_ORDER_ID', 'Order id is invalid.');
  const order = await Order.findById(orderId);
  if (!order) throw authError(404, 'ORDER_NOT_FOUND', 'Order was not found.');
  const currentStatus = order.fulfillmentStatus ?? 'PLACED';
  if (nextStatus === currentStatus) return serializeAdminOrder(await Order.findById(orderId).populate('customerId', 'name email'));
  if (!transitions[currentStatus]?.includes(nextStatus)) throw authError(409, 'INVALID_STATUS_TRANSITION', `Order cannot move from ${currentStatus} to ${nextStatus}.`);
  if (order.paymentStatus !== 'succeeded') throw authError(409, 'PAYMENT_REQUIRED', 'A paid order is required before fulfillment can advance.');

  const oldStatusCondition = currentStatus === 'PLACED'
    ? { $or: [{ fulfillmentStatus: 'PLACED' }, { fulfillmentStatus: { $exists: false } }] }
    : { fulfillmentStatus: currentStatus };
  const updated = await Order.findOneAndUpdate({
    _id: order._id,
    paymentStatus: 'succeeded',
    ...oldStatusCondition,
  }, {
    $set: { fulfillmentStatus: nextStatus },
    $push: { statusHistory: { status: nextStatus, changedAt: now, actorId: adminId, actorRole: 'admin' } },
  }, { new: true, runValidators: true }).populate('customerId', 'name email');
  if (!updated) {
    const latest = await Order.findById(orderId);
    if (!latest) throw authError(404, 'ORDER_NOT_FOUND', 'Order was not found.');
    throw authError(409, 'ORDER_STATUS_CHANGED', 'Order status changed. Refresh the order and try again.');
  }
  await notifyCustomer(updated, updated.customerId, nextStatus);
  return serializeAdminOrder(updated);
}

export async function getCustomerOrderTracking(customerId, orderId) {
  if (!mongoose.isValidObjectId(orderId)) throw authError(400, 'INVALID_ORDER_ID', 'Order id is invalid.');
  const order = await Order.findOne({ _id: orderId, customerId });
  if (!order) throw authError(404, 'ORDER_NOT_FOUND', 'Order was not found.');
  return {
    ...serializeOrder(order),
    statusHistory: statusHistoryFrom(order),
    updatedAt: order.updatedAt,
  };
}
