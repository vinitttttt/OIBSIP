import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { InventoryItem } from '../models/InventoryItem.js';
import { InventoryMovement } from '../models/InventoryMovement.js';
import { authError } from '../utils/authErrors.js';
import { checkLowStockForItem } from './inventoryAlertService.js';

const idPattern = /^[a-f\d]{24}$/i;

export function serializeInventoryItem(item) {
  const onHand = item.onHand ?? 0;
  const reserved = item.reserved ?? 0;
  const available = onHand - reserved;
  const threshold = item.lowStockThreshold ?? env.inventoryLowStockThreshold;
  return {
    id: String(item._id), sku: item.sku, name: item.name, category: item.category,
    onHand, reserved, available, threshold,
    isAvailable: item.isAvailable !== false,
    stockStatus: available <= 0 ? 'out' : available < threshold ? 'low' : 'healthy',
  };
}

export async function listInventory() {
  const items = await InventoryItem.find({}).sort({ category: 1, name: 1 });
  return items.map(serializeInventoryItem);
}

export async function getInventorySummary() {
  const items = await InventoryItem.find({}).select('onHand reserved lowStockThreshold').lean();
  let lowStockCount = 0;
  let outOfStockCount = 0;
  for (const item of items) {
    const available = (item.onHand ?? 0) - (item.reserved ?? 0);
    if (available <= 0) outOfStockCount += 1;
    else if (available < (item.lowStockThreshold ?? env.inventoryLowStockThreshold)) lowStockCount += 1;
  }
  return { totalIngredients: items.length, lowStockCount, outOfStockCount };
}

async function runTransaction(session, action) {
  if (session) return action(session);
  const ownedSession = await mongoose.startSession();
  try {
    let result;
    await ownedSession.withTransaction(async () => { result = await action(ownedSession); });
    return result;
  } finally { await ownedSession.endSession(); }
}

export async function adjustOnHand({ itemId, delta, reason, actorId }) {
  if (!idPattern.test(String(itemId))) throw authError(400, 'INVALID_INVENTORY_ID', 'Inventory item id is invalid.');
  if (!Number.isSafeInteger(delta) || delta === 0) throw authError(400, 'INVALID_STOCK_ADJUSTMENT', 'Stock adjustment must be a non-zero whole number.');
  let updated;
  await runTransaction(null, async (session) => {
    updated = await InventoryItem.findOneAndUpdate({
      _id: itemId,
      $expr: { $gte: [
        { $add: [{ $ifNull: ['$onHand', 0] }, delta] },
        { $ifNull: ['$reserved', 0] },
      ] },
    }, { $inc: { onHand: delta } }, { new: true, runValidators: true, session });
    if (!updated) {
      const exists = await InventoryItem.exists({ _id: itemId }).session(session);
      if (!exists) throw authError(404, 'INVENTORY_ITEM_NOT_FOUND', 'Inventory item was not found.');
      throw authError(409, 'STOCK_BELOW_RESERVED', 'On-hand stock cannot be less than reserved stock.');
    }
    const onHandAfter = updated.onHand ?? 0;
    const reservedAfter = updated.reserved ?? 0;
    await InventoryMovement.create([{
      itemId: updated._id, kind: 'manual_adjustment', onHandDelta: delta, reservedDelta: 0,
      onHandBefore: onHandAfter - delta, onHandAfter, reservedBefore: reservedAfter, reservedAfter,
      reason, actorId,
    }], { session });
  });
  try { await checkLowStockForItem(updated._id); } catch (error) { console.error('Low-stock alert check failed', { itemId: String(updated._id), name: error.name ?? 'Error' }); }
  return serializeInventoryItem(updated);
}

export async function checkIngredientAvailability(ingredientId, quantity = 1, { session } = {}) {
  if (!idPattern.test(String(ingredientId)) || !Number.isSafeInteger(quantity) || quantity <= 0) {
    throw authError(400, 'INVALID_STOCK_REQUEST', 'Ingredient id and quantity are invalid.');
  }
  let query = InventoryItem.findById(ingredientId);
  if (session) query = query.session(session);
  const item = await query;
  if (!item) throw authError(404, 'INVENTORY_ITEM_NOT_FOUND', 'Inventory item was not found.');
  const available = (item.onHand ?? 0) - (item.reserved ?? 0);
  if (item.isAvailable === false || available < quantity) throw authError(409, 'INSUFFICIENT_STOCK', 'The requested ingredient quantity is unavailable.');
  return { item, available };
}

function normalizeRequirements(requirements) {
  if (!Array.isArray(requirements) || requirements.length === 0) throw authError(400, 'INVALID_STOCK_REQUEST', 'At least one ingredient quantity is required.');
  const grouped = new Map();
  for (const requirement of requirements) {
    const ingredientId = String(requirement?.ingredientId ?? '');
    const quantity = requirement?.quantity;
    if (!idPattern.test(ingredientId) || !Number.isSafeInteger(quantity) || quantity <= 0) throw authError(400, 'INVALID_STOCK_REQUEST', 'Ingredient ids and quantities are invalid.');
    grouped.set(ingredientId, (grouped.get(ingredientId) ?? 0) + quantity);
  }
  return [...grouped].map(([ingredientId, quantity]) => ({ ingredientId, quantity }));
}

async function mutateRequirements(requirements, { session, referenceId, operation }) {
  const grouped = normalizeRequirements(requirements);
  return runTransaction(session, async (transaction) => {
    const results = [];
    for (const { ingredientId, quantity } of grouped) {
      const item = await operation({ ingredientId, quantity, session: transaction });
      results.push(serializeInventoryItem(item));
    }
    return results;
  });
}

export async function reserveIngredients(requirements, { session, referenceId = null } = {}) {
  const result = await mutateRequirements(requirements, { session, referenceId, operation: async ({ ingredientId, quantity, session: transaction }) => {
    const item = await InventoryItem.findOneAndUpdate({
      _id: ingredientId, isAvailable: true,
      $expr: { $gte: [
        { $subtract: [{ $ifNull: ['$onHand', 0] }, { $ifNull: ['$reserved', 0] }] }, quantity,
      ] },
    }, { $inc: { reserved: quantity } }, { new: true, runValidators: true, session: transaction });
    if (!item) throw authError(409, 'INSUFFICIENT_STOCK', 'An ingredient does not have enough available stock to reserve.');
    const reservedAfter = item.reserved ?? 0;
    const onHand = item.onHand ?? 0;
    await InventoryMovement.create([{
      itemId: item._id, kind: 'reservation', onHandDelta: 0, reservedDelta: quantity,
      onHandBefore: onHand, onHandAfter: onHand, reservedBefore: reservedAfter - quantity, reservedAfter,
      reason: 'Order reservation', referenceId,
    }], { session: transaction });
    return item;
  } });
  if (!session) await runAlerts(result);
  return result;
}

export async function releaseReservations(requirements, { session, referenceId = null } = {}) {
  const result = await mutateRequirements(requirements, { session, referenceId, operation: async ({ ingredientId, quantity, session: transaction }) => {
    const item = await InventoryItem.findOneAndUpdate({ _id: ingredientId, reserved: { $gte: quantity } },
      { $inc: { reserved: -quantity } }, { new: true, runValidators: true, session: transaction });
    if (!item) throw authError(409, 'RESERVATION_NOT_FOUND', 'The reservation cannot be released.');
    const reservedAfter = item.reserved ?? 0;
    const onHand = item.onHand ?? 0;
    await InventoryMovement.create([{
      itemId: item._id, kind: 'reservation_release', onHandDelta: 0, reservedDelta: -quantity,
      onHandBefore: onHand, onHandAfter: onHand, reservedBefore: reservedAfter + quantity, reservedAfter,
      reason: 'Order reservation released', referenceId,
    }], { session: transaction });
    return item;
  } });
  if (!session) await runAlerts(result);
  return result;
}

export async function deductReservedStock(requirements, { session, referenceId = null } = {}) {
  const result = await mutateRequirements(requirements, { session, referenceId, operation: async ({ ingredientId, quantity, session: transaction }) => {
    const item = await InventoryItem.findOneAndUpdate({ _id: ingredientId, onHand: { $gte: quantity }, reserved: { $gte: quantity } },
      { $inc: { onHand: -quantity, reserved: -quantity } }, { new: true, runValidators: true, session: transaction });
    if (!item) throw authError(409, 'RESERVATION_NOT_FOUND', 'Reserved stock is unavailable for deduction.');
    const onHandAfter = item.onHand ?? 0;
    const reservedAfter = item.reserved ?? 0;
    await InventoryMovement.create([{
      itemId: item._id, kind: 'reserved_deduction', onHandDelta: -quantity, reservedDelta: -quantity,
      onHandBefore: onHandAfter + quantity, onHandAfter, reservedBefore: reservedAfter + quantity, reservedAfter,
      reason: 'Reserved stock deducted after payment', referenceId,
    }], { session: transaction });
    return item;
  } });
  if (!session) await runAlerts(result);
  return result;
}

async function runAlerts(items) {
  await Promise.all(items.map(async (item) => {
    try { await checkLowStockForItem(item.id); }
    catch (error) { console.error('Low-stock alert check failed', { itemId: item.id, name: error.name ?? 'Error' }); }
  }));
}
