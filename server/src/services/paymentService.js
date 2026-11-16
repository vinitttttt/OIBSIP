import { timingSafeEqual } from 'node:crypto';
import mongoose from 'mongoose';
import { Order } from '../models/Order.js';
import { PaymentAttempt } from '../models/PaymentAttempt.js';
import { authError } from '../utils/authErrors.js';
import { hashToken } from '../utils/tokens.js';
import { deductReservedStock, releaseReservations } from './inventoryService.js';
import { createPaymentProvider } from './paymentProviders/paymentProvider.js';
import { serializeOrder } from './orderService.js';

function safeHashEqual(storedHash, rawToken) {
  const actual = Buffer.from(hashToken(rawToken), 'hex');
  const expected = Buffer.from(storedHash ?? '', 'hex');
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export async function initializeMockPayment(customerId, orderId) {
  const provider = createPaymentProvider();
  if (!mongoose.isValidObjectId(orderId)) throw authError(400, 'INVALID_ORDER_ID', 'Order id is invalid.');
  const order = await Order.findOne({ _id: orderId, customerId });
  if (!order) throw authError(404, 'ORDER_NOT_FOUND', 'Order was not found.');
  if (order.expiresAt <= new Date()) throw authError(409, 'ORDER_EXPIRED', 'This order has expired.');
  if (order.orderStatus !== 'awaiting_payment' || order.reservationStatus !== 'reserved' || order.paymentStatus !== 'pending') {
    throw authError(409, 'ORDER_NOT_PAYABLE', 'This order is not awaiting payment.');
  }

  const session = await mongoose.startSession();
  const issued = provider.initialize();
  let attempt;
  try {
    await session.withTransaction(async () => {
      const currentOrder = await Order.findOne({ _id: order._id, customerId, orderStatus: 'awaiting_payment', reservationStatus: 'reserved', paymentStatus: 'pending', expiresAt: { $gt: new Date() } }).session(session);
      if (!currentOrder) throw authError(409, 'ORDER_NOT_PAYABLE', 'This order is not awaiting payment.');
      attempt = await PaymentAttempt.findOneAndUpdate({ orderId: currentOrder._id, customerId, status: 'pending' }, {
        $set: { confirmationTokenHash: hashToken(issued.confirmationToken), providerReference: issued.providerReference },
      }, { new: true, session });
      if (!attempt) {
        const latest = await PaymentAttempt.findOne({ orderId: currentOrder._id }).sort({ attemptNumber: -1 }).session(session);
        if (latest && latest.status !== 'expired') throw authError(409, 'PAYMENT_ATTEMPT_CLOSED', 'This order already has a completed payment attempt.');
        const attemptNumber = (latest?.attemptNumber ?? 0) + 1;
        [attempt] = await PaymentAttempt.create([{
          orderId: currentOrder._id, customerId, provider: provider.name, attemptNumber,
          providerReference: issued.providerReference, confirmationTokenHash: hashToken(issued.confirmationToken),
          amountPaise: currentOrder.totalPaise, currency: currentOrder.currency, status: 'pending',
        }], { session });
      }
    });
  } catch (error) {
    if (error?.code === 11000) throw authError(409, 'PAYMENT_INITIALIZATION_RETRY', 'Payment initialization is already in progress. Please retry.');
    throw error;
  } finally { await session.endSession(); }
  return {
    provider: 'mock', simulated: true,
    attempt: { id: String(attempt._id), providerReference: attempt.providerReference, status: attempt.status },
    order: { id: String(order._id), amountPaise: order.totalPaise, currency: order.currency },
    confirmationToken: issued.confirmationToken,
  };
}

export async function confirmMockPayment(customerId, { attemptId, confirmationToken, outcome }, { now = new Date() } = {}) {
  const provider = createPaymentProvider();
  if (!mongoose.isValidObjectId(attemptId)) throw authError(400, 'INVALID_PAYMENT_ATTEMPT', 'Payment attempt id is invalid.');
  const session = await mongoose.startSession();
  let result;
  try {
    await session.withTransaction(async () => {
      const attempt = await PaymentAttempt.findOne({ _id: attemptId, customerId }).select('+confirmationTokenHash').session(session);
      if (!attempt || !safeHashEqual(attempt.confirmationTokenHash, confirmationToken)) {
        throw authError(404, 'PAYMENT_ATTEMPT_NOT_FOUND', 'Payment attempt was not found.');
      }
      const order = await Order.findOne({ _id: attempt.orderId, customerId }).session(session);
      if (!order) throw authError(404, 'ORDER_NOT_FOUND', 'Order was not found.');
      if (attempt.status !== 'pending') {
        if (attempt.outcome !== outcome) throw authError(409, 'PAYMENT_ATTEMPT_CLOSED', 'This payment attempt already has a different result.');
        result = { attempt: { id: String(attempt._id), status: attempt.status }, order: serializeOrder(order), duplicate: true };
        return;
      }

      const expired = order.expiresAt <= now || order.orderStatus !== 'awaiting_payment' || order.reservationStatus !== 'reserved';
      if (expired) {
        if (order.reservationStatus === 'reserved') {
          await releaseReservations(order.inventoryRequirements, { session, referenceId: String(order._id) });
          order.reservationStatus = 'released';
        }
        order.paymentStatus = 'expired'; order.orderStatus = 'expired';
        attempt.status = 'expired'; attempt.outcome = 'failure'; attempt.completedAt = now;
      } else {
        const simulated = provider.simulateOutcome(outcome);
        if (simulated.status === 'succeeded') {
          await deductReservedStock(order.inventoryRequirements, { session, referenceId: String(order._id) });
          order.paymentStatus = 'succeeded'; order.orderStatus = 'confirmed'; order.reservationStatus = 'deducted'; order.paidAt = now;
        } else {
          await releaseReservations(order.inventoryRequirements, { session, referenceId: String(order._id) });
          order.paymentStatus = 'failed'; order.orderStatus = 'payment_failed'; order.reservationStatus = 'released';
        }
        attempt.status = simulated.status; attempt.outcome = simulated.outcome; attempt.completedAt = simulated.completedAt;
      }
      await order.save({ session });
      await attempt.save({ session });
      result = { attempt: { id: String(attempt._id), status: attempt.status }, order: serializeOrder(order), duplicate: false };
    });
  } finally { await session.endSession(); }
  return result;
}
