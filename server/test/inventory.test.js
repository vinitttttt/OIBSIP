import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import mongoose from 'mongoose';
import { randomUUID } from 'node:crypto';
import app from '../src/app.js';
import { connectDatabase } from '../src/config/database.js';
import { env } from '../src/config/env.js';
import { AlertState } from '../src/models/AlertState.js';
import { InventoryItem } from '../src/models/InventoryItem.js';
import { InventoryMovement } from '../src/models/InventoryMovement.js';
import { User } from '../src/models/User.js';
import { setEmailSenderForTesting } from '../src/services/emailService.js';
import { checkLowStockForItem, setInventoryAlertRecipientForTesting } from '../src/services/inventoryAlertService.js';
import { deductReservedStock, releaseReservations, reserveIngredients } from '../src/services/inventoryService.js';
import { createAccessToken } from '../src/utils/tokens.js';

const suffix = randomUUID().replaceAll('-', '').slice(0, 12);
const sku = (name) => `inventory-test-${name}-${suffix}`;
let admin;
let customer;
let item;
let lowItem;
let emptyItem;
let server;
let baseUrl;
let adminToken;

before(async () => {
  await connectDatabase(env.mongoUri);
  admin = await User.create({ name: 'Inventory Admin', email: `inventory-admin-${suffix}@example.test`, passwordHash: 'test', role: 'admin' });
  customer = await User.create({ name: 'Inventory Customer', email: `inventory-customer-${suffix}@example.test`, passwordHash: 'test' });
  adminToken = createAccessToken(admin);
  item = await InventoryItem.create({ sku: sku('main'), name: 'Main test ingredient', category: 'vegetable', price: 1, isAvailable: true, onHand: 20, reserved: 3, lowStockThreshold: 10 });
  lowItem = await InventoryItem.create({ sku: sku('low'), name: 'Low test ingredient', category: 'sauce', price: 1, isAvailable: true, onHand: 4, reserved: 0, lowStockThreshold: 10 });
  emptyItem = await InventoryItem.create({ sku: sku('empty'), name: 'Empty test ingredient', category: 'cheese', price: 1, isAvailable: true, onHand: 2, reserved: 2, lowStockThreshold: 10 });
  server = app.listen(0);
  baseUrl = `http://127.0.0.1:${server.address().port}/api/v1`;
});

after(async () => {
  await AlertState.deleteMany({ itemId: { $in: [item?._id, lowItem?._id, emptyItem?._id].filter(Boolean) } });
  await InventoryMovement.deleteMany({ itemId: { $in: [item?._id, lowItem?._id, emptyItem?._id].filter(Boolean) } });
  await InventoryItem.deleteMany({ sku: { $in: ['main', 'low', 'empty'].map(sku) } });
  await User.deleteMany({ _id: { $in: [admin?._id, customer?._id].filter(Boolean) } });
  setInventoryAlertRecipientForTesting(undefined);
  setEmailSenderForTesting(undefined);
  if (server) await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  await mongoose.disconnect();
});

test('admin inventory endpoints require admin role and report stock summaries', async () => {
  assert.equal((await fetch(`${baseUrl}/admin/inventory`)).status, 401);
  const customerResponse = await fetch(`${baseUrl}/admin/inventory`, { headers: { Authorization: `Bearer ${createAccessToken(customer)}` } });
  assert.equal(customerResponse.status, 403);
  const response = await fetch(`${baseUrl}/admin/inventory`, { headers: { Authorization: `Bearer ${adminToken}` } });
  assert.equal(response.status, 200);
  const body = await response.json();
  const listed = body.items.find((entry) => entry.id === String(item._id));
  assert.equal(listed.onHand, 20);
  assert.equal(listed.reserved, 3);
  assert.equal(listed.available, 17);
  assert.equal(listed.threshold, 10);
  const summary = await fetch(`${baseUrl}/admin/inventory/summary`, { headers: { Authorization: `Bearer ${adminToken}` } });
  const metrics = await summary.json();
  assert(metrics.totalIngredients >= 3);
  assert(metrics.lowStockCount >= 1);
  assert(metrics.outOfStockCount >= 1);
  assert.equal((await fetch(`${baseUrl}/admin/inventory/summary`, { headers: { Authorization: `Bearer ${createAccessToken(customer)}` } })).status, 403);
});

test('admin stock adjustments are validated, atomic with audit movements, and respect reservations', async () => {
  const url = `${baseUrl}/admin/inventory/${item._id}`;
  const patch = (body) => fetch(url, { method: 'PATCH', headers: { Authorization: `Bearer ${adminToken}`, Origin: env.corsOrigin[0], 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  assert.equal((await patch({ delta: 0, reason: 'invalid' })).status, 400);
  assert.equal((await patch({ delta: 1.2, reason: 'invalid' })).status, 400);
  assert.equal((await patch({ delta: -18, reason: 'remove more than unreserved stock' })).status, 409);
  const updated = await patch({ delta: 5, reason: 'New delivery received' });
  assert.equal(updated.status, 200);
  const updatedItem = (await updated.json()).item;
  assert.equal(updatedItem.onHand, 25);
  assert.equal(updatedItem.available, 22);
  assert.equal(await InventoryMovement.countDocuments({ itemId: item._id, kind: 'manual_adjustment', actorId: admin._id }), 1);
  assert.equal((await InventoryMovement.findOne({ itemId: item._id, kind: 'manual_adjustment' })).reason, 'New delivery received');
});

test('low-stock mail is sent once per low-stock period, then sent again after recovery', async () => {
  const sent = [];
  setInventoryAlertRecipientForTesting('inventory-test@example.test');
  setEmailSenderForTesting(async (message) => { sent.push(message); });
  const url = `${baseUrl}/admin/inventory/${item._id}`;
  const adjust = (delta, reason) => fetch(url, { method: 'PATCH', headers: { Authorization: `Bearer ${adminToken}`, Origin: env.corsOrigin[0], 'Content-Type': 'application/json' }, body: JSON.stringify({ delta, reason }) });
  assert.equal((await adjust(-13, 'Stock used for test')).status, 200);
  assert.equal(sent.length, 1);
  assert.match(sent[0].subject, /low stock/i);
  assert.equal((await adjust(-1, 'More stock used')).status, 200);
  assert.equal(sent.length, 1, 'a repeated low-stock check does not send a duplicate');
  assert.equal((await AlertState.findOne({ itemId: item._id })).state, 'low');
  assert.equal((await adjust(5, 'Restock received')).status, 200);
  assert.equal((await AlertState.findOne({ itemId: item._id })).state, 'normal');
  assert.equal((await adjust(-6, 'Stock used again')).status, 200);
  assert.equal(sent.length, 2, 'a new low-stock period sends another email');

  await InventoryItem.updateOne({ _id: item._id }, { $set: { onHand: 12 } });
  await AlertState.updateOne({ itemId: item._id }, { $set: { state: 'normal', claimId: null, claimedAt: null } });
  const beforeRace = sent.length;
  await Promise.all([checkLowStockForItem(item._id), checkLowStockForItem(item._id)]);
  assert.equal(sent.length, beforeRace + 1, 'concurrent alert checks claim the state only once');
});

test('reservation foundation holds, releases, and deducts stock transactionally', async () => {
  await InventoryItem.updateOne({ _id: item._id }, { $set: { onHand: 20, reserved: 3 } });
  await reserveIngredients([{ ingredientId: String(item._id), quantity: 12 }], { referenceId: 'future-order-test' });
  let current = await InventoryItem.findById(item._id);
  assert.equal(current.reserved, 15);
  assert.equal(current.onHand - current.reserved, 5);
  await assert.rejects(reserveIngredients([{ ingredientId: String(item._id), quantity: 7 }]), { code: 'INSUFFICIENT_STOCK' });
  await releaseReservations([{ ingredientId: String(item._id), quantity: 2 }], { referenceId: 'future-order-test' });
  current = await InventoryItem.findById(item._id);
  assert.equal(current.reserved, 13);
  await deductReservedStock([{ ingredientId: String(item._id), quantity: 3 }], { referenceId: 'future-order-test' });
  current = await InventoryItem.findById(item._id);
  assert.equal(current.onHand, 17);
  assert.equal(current.reserved, 10);
  assert.equal(current.onHand - current.reserved, 7);
  assert.equal(await InventoryMovement.countDocuments({ itemId: item._id, kind: { $in: ['reservation', 'reservation_release', 'reserved_deduction'] } }) >= 3, true);
});
