import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import mongoose from 'mongoose';
import { randomUUID } from 'node:crypto';
import app from '../src/app.js';
import { connectDatabase } from '../src/config/database.js';
import { env } from '../src/config/env.js';
import { Cart } from '../src/models/Cart.js';
import { InventoryItem } from '../src/models/InventoryItem.js';
import { InventoryMovement } from '../src/models/InventoryMovement.js';
import { Order } from '../src/models/Order.js';
import { PaymentAttempt } from '../src/models/PaymentAttempt.js';
import { Product } from '../src/models/Product.js';
import { User } from '../src/models/User.js';
import { setEmailSenderForTesting } from '../src/services/emailService.js';
import { expirePendingOrders } from '../src/services/orderService.js';
import { createPaymentProvider } from '../src/services/paymentProviders/paymentProvider.js';
import { createAccessToken } from '../src/utils/tokens.js';

const suffix = randomUUID().replaceAll('-', '').slice(0, 12);
const sku = (name) => `order-test-${name}-${suffix}`;
let customer;
let otherCustomer;
let admin;
let product;
let base;
let sauce;
let cheese;
let vegetable;
let scarceBase;
let server;
let baseUrl;

async function putItemInCart(userId, selectedBase = base, quantity = 2) {
  const cart = await Cart.findOneAndUpdate({ userId }, { $setOnInsert: { userId, items: [] } }, { upsert: true, new: true });
  cart.items = [{ productId: product._id, baseId: selectedBase._id, sauceId: sauce._id, cheeseId: cheese._id, vegetableIds: [vegetable._id], quantity }];
  await cart.save();
  return cart;
}

async function postOrder(token, key = randomUUID(), body = {}) {
  return fetch(`${baseUrl}/orders`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Idempotency-Key': key, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
}

before(async () => {
  await connectDatabase(env.mongoUri);
  customer = await User.create({ name: 'Order Customer', email: `order-${suffix}@example.test`, passwordHash: 'test', emailVerifiedAt: new Date() });
  otherCustomer = await User.create({ name: 'Other Customer', email: `other-order-${suffix}@example.test`, passwordHash: 'test', emailVerifiedAt: new Date() });
  admin = await User.create({ name: 'Order Admin', email: `admin-order-${suffix}@example.test`, passwordHash: 'test', role: 'admin', emailVerifiedAt: new Date() });
  product = await Product.create({ slug: `order-pizza-${suffix}`, name: 'Order Test Pizza', description: 'Snapshot test pizza', basePrice: 120, image: '/images/pizza-placeholder.svg' });
  base = await InventoryItem.create({ sku: sku('base'), name: 'Order base', category: 'base', price: 0, isAvailable: true, onHand: 50, reserved: 0, lowStockThreshold: 5 });
  sauce = await InventoryItem.create({ sku: sku('sauce'), name: 'Order sauce', category: 'sauce', price: 10, isAvailable: true, onHand: 50, reserved: 0, lowStockThreshold: 5 });
  cheese = await InventoryItem.create({ sku: sku('cheese'), name: 'Order cheese', category: 'cheese', price: 25, isAvailable: true, onHand: 50, reserved: 0, lowStockThreshold: 5 });
  vegetable = await InventoryItem.create({ sku: sku('vegetable'), name: 'Order vegetable', category: 'vegetable', price: 5, isAvailable: true, onHand: 50, reserved: 0, lowStockThreshold: 5 });
  scarceBase = await InventoryItem.create({ sku: sku('scarce-base'), name: 'Scarce base', category: 'base', price: 0, isAvailable: true, onHand: 1, reserved: 0, lowStockThreshold: 1 });
  server = app.listen(0);
  baseUrl = `http://127.0.0.1:${server.address().port}/api/v1`;
});

after(async () => {
  const orders = await Order.find({ customerId: { $in: [customer?._id, otherCustomer?._id].filter(Boolean) } }).select('_id');
  const orderIds = orders.map((order) => order._id);
  await PaymentAttempt.deleteMany({ orderId: { $in: orderIds } });
  await InventoryMovement.deleteMany({ referenceId: { $in: orderIds.map(String) } });
  await Order.deleteMany({ _id: { $in: orderIds } });
  await Cart.deleteMany({ userId: { $in: [customer?._id, otherCustomer?._id].filter(Boolean) } });
  await Product.deleteOne({ _id: product?._id });
  await InventoryItem.deleteMany({ sku: { $in: ['base', 'sauce', 'cheese', 'vegetable', 'scarce-base'].map(sku) } });
  await User.deleteMany({ _id: { $in: [customer?._id, otherCustomer?._id, admin?._id].filter(Boolean) } });
  if (server) await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  await mongoose.disconnect();
});

test('customer order creation recalculates cart prices, reserves stock, clears cart and is idempotent', async () => {
  const token = createAccessToken(customer);
  await putItemInCart(customer._id, base, 2);
  assert.equal((await fetch(`${baseUrl}/orders`)).status, 401);
  const key = randomUUID();
  assert.equal((await postOrder(token, key, { totalPaise: 1 })).status, 400, 'order prices and extra fields are rejected');
  const response = await postOrder(token, key);
  assert.equal(response.status, 201);
  const { order } = await response.json();
  assert.equal(order.subtotalPaise, 32000);
  assert.equal(order.totalPaise, 32000);
  assert.equal(order.items[0].unitPricePaise, 16000);
  assert.equal(order.items[0].quantity, 2);
  const listing = await fetch(`${baseUrl}/orders`, { headers: { Authorization: `Bearer ${token}` } });
  assert.equal(listing.status, 200);
  assert.equal((await listing.json()).orders.some((entry) => entry.id === order.id), true);
  assert.equal((await Cart.findOne({ userId: customer._id })).items.length, 0);
  assert.equal((await InventoryItem.findById(base._id)).reserved, 2);
  assert.equal((await InventoryItem.findById(sauce._id)).reserved, 2);

  await Product.updateOne({ _id: product._id }, { $set: { basePrice: 999 } });
  const history = await fetch(`${baseUrl}/orders/${order.id}`, { headers: { Authorization: `Bearer ${token}` } });
  const historyBody = await history.json();
  assert.equal(historyBody.order.totalPaise, 32000, 'order prices remain snapshotted');
  assert.equal((await fetch(`${baseUrl}/orders/${order.id}`, { headers: { Authorization: `Bearer ${createAccessToken(otherCustomer)}` } })).status, 404);
  const duplicate = await postOrder(token, key);
  assert.equal((await duplicate.json()).order.id, order.id);
  assert.equal((await InventoryItem.findById(base._id)).reserved, 2, 'idempotent retry does not reserve twice');
  await Product.updateOne({ _id: product._id }, { $set: { basePrice: 120 } });
  await Order.updateOne({ _id: order.id }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
  await expirePendingOrders();
});

test('invalid cart selections and insufficient inventory abort order and retain the cart', async () => {
  const token = createAccessToken(otherCustomer);
  const cart = await putItemInCart(otherCustomer._id, scarceBase, 2);
  const response = await postOrder(token);
  assert.equal(response.status, 409);
  assert.equal((await Cart.findById(cart._id)).items.length, 1);
  assert.equal((await InventoryItem.findById(scarceBase._id)).reserved, 0);

  await Cart.collection.updateOne({ _id: cart._id }, { $set: { 'items.0.baseId': base._id, 'items.0.cheeseId': new mongoose.Types.ObjectId() } });
  const invalid = await postOrder(token);
  assert.equal(invalid.status, 400);
  assert.equal((await InventoryItem.findById(scarceBase._id)).reserved, 0);
});

test('mock success is authenticated and idempotent; mock failure releases reservations', async () => {
  const token = createAccessToken(customer);
  await putItemInCart(customer._id, base, 2);
  const created = await postOrder(token);
  const { order } = await created.json();
  const initialize = () => fetch(`${baseUrl}/payments/mock/initialize`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ orderId: order.id }) });
  assert.equal((await fetch(`${baseUrl}/payments/mock/initialize`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orderId: order.id }) })).status, 401);
  const firstInit = await initialize();
  const firstPayload = await firstInit.json();
  const secondPayload = await (await initialize()).json();
  assert.equal(firstPayload.attempt.id, secondPayload.attempt.id);
  const confirm = (payload, outcome = 'success') => fetch(`${baseUrl}/payments/mock/confirm`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ attemptId: payload.attempt.id, confirmationToken: payload.confirmationToken, outcome }),
  });
  const successful = await confirm(secondPayload);
  assert.equal(successful.status, 200);
  assert.equal((await successful.json()).order.paymentStatus, 'succeeded');
  const duplicated = await confirm(secondPayload);
  assert.equal((await duplicated.json()).duplicate, true);
  const baseAfterSuccess = await InventoryItem.findById(base._id);
  assert.equal(baseAfterSuccess.onHand, 48);
  assert.equal(baseAfterSuccess.reserved, 0);

  await putItemInCart(customer._id, base, 1);
  const failedOrder = (await (await postOrder(token)).json()).order;
  const failedAttempt = await (await fetch(`${baseUrl}/payments/mock/initialize`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ orderId: failedOrder.id }) })).json();
  const failure = await confirm(failedAttempt, 'failure');
  assert.equal(failure.status, 200);
  assert.equal((await failure.json()).order.paymentStatus, 'failed');
  const baseAfterFailure = await InventoryItem.findById(base._id);
  assert.equal(baseAfterFailure.onHand, 48, 'failed payment does not deduct stock');
  assert.equal(baseAfterFailure.reserved, 0, 'failed payment releases reserved stock');
});

test('expired orders release stock and mock provider refuses production mode', async () => {
  const token = createAccessToken(customer);
  await putItemInCart(customer._id, base, 1);
  const order = (await (await postOrder(token)).json()).order;
  const attempt = await (await fetch(`${baseUrl}/payments/mock/initialize`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ orderId: order.id }) })).json();
  await Order.updateOne({ _id: order.id }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
  const expired = await expirePendingOrders();
  assert(expired.expired >= 1);
  assert.equal((await Order.findById(order.id)).reservationStatus, 'released');
  assert.equal((await PaymentAttempt.findById(attempt.attempt.id)).status, 'expired');
  assert.equal((await InventoryItem.findById(base._id)).reserved, 0);
  assert.throws(() => createPaymentProvider({ nodeEnv: 'production', enabled: true }), { code: 'PAYMENTS_UNAVAILABLE' });
});

test('admin order APIs enforce roles, tracking ownership, paid transitions and status history', async () => {
  const createFixture = async (idempotencyKey, paymentStatus) => Order.create({
    customerId: customer._id,
    idempotencyKey,
    items: [{ productId: product._id, productName: product.name, productSlug: product.slug, image: product.image, basePricePaise: 12000, ingredients: [], quantity: 1, unitPricePaise: 12000, lineTotalPaise: 12000 }],
    inventoryRequirements: [], subtotalPaise: 12000, deliveryPaise: 0, totalPaise: 12000, currency: 'INR',
    orderStatus: paymentStatus === 'succeeded' ? 'confirmed' : 'awaiting_payment',
    paymentStatus, reservationStatus: paymentStatus === 'succeeded' ? 'deducted' : 'reserved',
    expiresAt: new Date(Date.now() + 60_000), fulfillmentStatus: 'PLACED',
    statusHistory: [{ status: 'PLACED', changedAt: new Date(), actorId: customer._id, actorRole: 'customer' }],
  });
  const paidOrder = await createFixture(randomUUID(), 'succeeded');
  const unpaidOrder = await createFixture(randomUUID(), 'pending');
  const adminToken = createAccessToken(admin);
  const customerToken = createAccessToken(customer);
  const otherToken = createAccessToken(otherCustomer);
  const origin = env.corsOrigin[0];

  assert.equal((await fetch(`${baseUrl}/admin/orders`)).status, 401);
  assert.equal((await fetch(`${baseUrl}/admin/orders`, { headers: { Authorization: `Bearer ${customerToken}` } })).status, 403);
  const list = await fetch(`${baseUrl}/admin/orders?status=PLACED`, { headers: { Authorization: `Bearer ${adminToken}` } });
  assert.equal(list.status, 200);
  const listBody = await list.json();
  assert(listBody.orders.some((order) => order.id === String(paidOrder._id)));
  assert.equal(listBody.orders.find((order) => order.id === String(paidOrder._id)).customer.email, customer.email);
  assert(listBody.summary.PLACED >= 2);
  assert.equal((await fetch(`${baseUrl}/admin/orders?status=unknown`, { headers: { Authorization: `Bearer ${adminToken}` } })).status, 400);
  assert.equal((await fetch(`${baseUrl}/admin/orders/${paidOrder.id}`, { headers: { Authorization: `Bearer ${adminToken}` } })).status, 200);

  const trackingResponse = await fetch(`${baseUrl}/orders/${paidOrder.id}/tracking`, { headers: { Authorization: `Bearer ${customerToken}` } });
  assert.equal(trackingResponse.status, 200);
  assert.equal((await trackingResponse.json()).tracking.fulfillmentStatus, 'PLACED');
  assert.equal((await fetch(`${baseUrl}/orders/${paidOrder.id}/tracking`, { headers: { Authorization: `Bearer ${otherToken}` } })).status, 404);
  assert.equal((await fetch(`${baseUrl}/orders/${paidOrder.id}/tracking`)).status, 401);

  const mockEmails = [];
  setEmailSenderForTesting(async (email) => { mockEmails.push(email); });
  const inventoryBeforeFulfillment = await InventoryItem.findById(base._id).select('onHand reserved').lean();
  const patchStatus = (orderId, status, token = adminToken) => fetch(`${baseUrl}/admin/orders/${orderId}/status`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, Origin: origin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  });
  try {
    assert.equal((await patchStatus(paidOrder.id, 'CONFIRMED', customerToken)).status, 403);
    const confirmed = await patchStatus(paidOrder.id, 'CONFIRMED');
    assert.equal(confirmed.status, 200);
    const confirmedOrder = (await confirmed.json()).order;
    assert.equal(confirmedOrder.statusHistory.length, 2);
    assert.equal(confirmedOrder.statusHistory[1].actorId, String(admin._id));
    assert.equal(confirmedOrder.statusHistory[1].actorRole, 'admin');
    assert.equal((await patchStatus(paidOrder.id, 'CONFIRMED')).status, 200);
    assert.equal(mockEmails.length, env.resendApiKey ? 1 : 0, 'unchanged status does not send another notification');
    assert.equal((await patchStatus(paidOrder.id, 'DELIVERED')).status, 409);
    assert.equal((await patchStatus(unpaidOrder.id, 'DELIVERED')).status, 409);
    assert.equal((await Order.findById(unpaidOrder.id)).fulfillmentStatus, 'PLACED');

    for (const status of ['PREPARING', 'OUT_FOR_DELIVERY', 'DELIVERED']) assert.equal((await patchStatus(paidOrder.id, status)).status, 200);
    const deliveredTracking = await (await fetch(`${baseUrl}/orders/${paidOrder.id}/tracking`, { headers: { Authorization: `Bearer ${customerToken}` } })).json();
    assert.equal(deliveredTracking.tracking.fulfillmentStatus, 'DELIVERED');
    assert.equal(deliveredTracking.tracking.statusHistory.length, 5);
    assert.equal(mockEmails.length, env.resendApiKey ? 4 : 0);
    const inventoryAfterFulfillment = await InventoryItem.findById(base._id).select('onHand reserved').lean();
    assert.deepEqual(inventoryAfterFulfillment, inventoryBeforeFulfillment, 'fulfillment status updates do not alter inventory');
  } finally {
    setEmailSenderForTesting(null);
  }
});
