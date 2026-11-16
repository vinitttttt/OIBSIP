import mongoose from 'mongoose';
import { Cart } from '../models/Cart.js';
import { Order } from '../models/Order.js';
import { PaymentAttempt } from '../models/PaymentAttempt.js';
import { authError } from '../utils/authErrors.js';
import { priceCustomizationForOrder } from './catalogueService.js';
import { releaseReservations, reserveIngredients } from './inventoryService.js';

const orderPaymentWindowMs = 15 * 60_000;

function paise(amount) { return Math.round(amount * 100); }

export function serializeOrder(order) {
  const statusHistory = (order.statusHistory ?? []).map((entry) => ({
    status: entry.status,
    changedAt: entry.changedAt,
    actorId: entry.actorId == null ? null : String(entry.actorId),
    actorRole: entry.actorRole,
  }));
  if (!statusHistory.length) statusHistory.push({ status: 'PLACED', changedAt: order.createdAt, actorId: null, actorRole: 'system' });
  return {
    id: String(order._id), createdAt: order.createdAt, expiresAt: order.expiresAt,
    items: order.items.map((line) => ({
      id: String(line._id),
      product: { id: String(line.productId), name: line.productName, slug: line.productSlug, image: line.image },
      basePricePaise: line.basePricePaise,
      ingredients: line.ingredients.map((ingredient) => ({ id: String(ingredient.ingredientId), name: ingredient.name, category: ingredient.category, pricePaise: ingredient.pricePaise })),
      quantity: line.quantity, unitPricePaise: line.unitPricePaise, lineTotalPaise: line.lineTotalPaise,
    })),
    subtotalPaise: order.subtotalPaise, deliveryPaise: order.deliveryPaise, totalPaise: order.totalPaise, currency: order.currency,
    orderStatus: order.orderStatus, fulfillmentStatus: order.fulfillmentStatus ?? 'PLACED', statusHistory,
    paymentStatus: order.paymentStatus, reservationStatus: order.reservationStatus,
  };
}

export async function createCustomerOrder(customerId, idempotencyKey, { now = new Date() } = {}) {
  if (!/^[a-f\d-]{36}$/i.test(idempotencyKey ?? '')) throw authError(400, 'IDEMPOTENCY_KEY_REQUIRED', 'A valid Idempotency-Key header is required.');
  const session = await mongoose.startSession();
  let output;
  try {
    await session.withTransaction(async () => {
      const existing = await Order.findOne({ customerId, idempotencyKey }).session(session);
      if (existing) { output = existing; return; }

      const cart = await Cart.findOne({ userId: customerId }).session(session);
      if (!cart?.items.length) throw authError(400, 'CART_EMPTY', 'Add a pizza to your cart before checkout.');
      const snapshots = [];
      const requirements = new Map();
      let subtotalPaise = 0;
      for (const line of cart.items) {
        const selection = {
          productId: String(line.productId), baseId: String(line.baseId), sauceId: String(line.sauceId),
          cheeseId: String(line.cheeseId), vegetableIds: line.vegetableIds.map(String),
        };
        const quote = await priceCustomizationForOrder(selection, { session, requiredQuantity: line.quantity });
        const basePricePaise = paise(quote.product.basePrice);
        const unitPricePaise = paise(quote.unitPrice);
        const lineTotalPaise = unitPricePaise * line.quantity;
        subtotalPaise += lineTotalPaise;
        const ingredientSnapshots = quote.ingredients.map((ingredient) => {
          requirements.set(ingredient.id, (requirements.get(ingredient.id) ?? 0) + line.quantity);
          return { ingredientId: ingredient.id, name: ingredient.name, category: ingredient.category, pricePaise: paise(ingredient.price) };
        });
        snapshots.push({
          productId: quote.product.id, productName: quote.product.name, productSlug: quote.product.slug, image: quote.product.image,
          basePricePaise, ingredients: ingredientSnapshots, quantity: line.quantity, unitPricePaise, lineTotalPaise,
        });
      }
      const inventoryRequirements = [...requirements].map(([ingredientId, quantity]) => ({ ingredientId, quantity }));
      const order = new Order({
        customerId, idempotencyKey, items: snapshots, inventoryRequirements, subtotalPaise,
        deliveryPaise: 0, totalPaise: subtotalPaise, currency: 'INR', expiresAt: new Date(now.getTime() + orderPaymentWindowMs),
        fulfillmentStatus: 'PLACED', statusHistory: [{ status: 'PLACED', changedAt: now, actorId: customerId, actorRole: 'customer' }],
      });
      await reserveIngredients(inventoryRequirements, { session, referenceId: String(order._id) });
      await order.save({ session });
      const clearResult = await Cart.updateOne({ _id: cart._id, userId: customerId, __v: cart.__v }, { $set: { items: [] }, $inc: { __v: 1 } }, { session });
      if (clearResult.modifiedCount !== 1) throw authError(409, 'CART_CHANGED', 'Your cart changed during checkout. Please retry.');
      output = order;
    });
  } catch (error) {
    if (error?.code === 11000) {
      output = await Order.findOne({ customerId, idempotencyKey });
      if (output) return serializeOrder(output);
    }
    throw error;
  } finally { await session.endSession(); }
  return serializeOrder(output);
}

export async function listCustomerOrders(customerId) {
  const orders = await Order.find({ customerId }).sort({ createdAt: -1 }).limit(50).lean();
  return orders.map(serializeOrder);
}

export async function getCustomerOrder(customerId, orderId) {
  if (!mongoose.isValidObjectId(orderId)) throw authError(400, 'INVALID_ORDER_ID', 'Order id is invalid.');
  const order = await Order.findOne({ _id: orderId, customerId });
  if (!order) throw authError(404, 'ORDER_NOT_FOUND', 'Order was not found.');
  return serializeOrder(order);
}

export async function expirePendingOrders({ now = new Date() } = {}) {
  const candidates = await Order.find({ orderStatus: 'awaiting_payment', paymentStatus: 'pending', reservationStatus: 'reserved', expiresAt: { $lte: now } }).select('_id');
  let expired = 0;
  for (const candidate of candidates) {
    const session = await mongoose.startSession();
    try {
      let didExpire = false;
      await session.withTransaction(async () => {
        const order = await Order.findOne({ _id: candidate._id, orderStatus: 'awaiting_payment', paymentStatus: 'pending', reservationStatus: 'reserved', expiresAt: { $lte: now } }).session(session);
        if (!order) return;
        await releaseReservations(order.inventoryRequirements, { session, referenceId: String(order._id) });
        order.orderStatus = 'expired'; order.paymentStatus = 'expired'; order.reservationStatus = 'released';
        await order.save({ session });
        await PaymentAttempt.updateMany({ orderId: order._id, status: 'pending' }, { $set: { status: 'expired', outcome: 'failure', completedAt: now } }, { session });
        didExpire = true;
      });
      if (didExpire) expired += 1;
    } finally { await session.endSession(); }
  }
  return { checked: candidates.length, expired };
}
