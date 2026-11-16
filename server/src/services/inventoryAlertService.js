import { randomUUID } from 'node:crypto';
import { env } from '../config/env.js';
import { AlertState } from '../models/AlertState.js';
import { InventoryItem } from '../models/InventoryItem.js';
import { sendTransactionalEmail } from './emailService.js';
import { inventoryLowStockEmail } from './emailTemplate.js';

const claimLeaseMs = 10 * 60_000;
let scheduler;
let checkRunning = false;
let testRecipient;

export function setInventoryAlertRecipientForTesting(recipient) { testRecipient = recipient; }

export async function checkLowStockForItem(itemId, { deliver = sendTransactionalEmail, now = new Date(), recipient = testRecipient ?? env.inventoryAlertEmail } = {}) {
  const item = await InventoryItem.findById(itemId).lean();
  if (!item) return { status: 'missing' };
  const available = (item.onHand ?? 0) - (item.reserved ?? 0);
  const threshold = item.lowStockThreshold ?? env.inventoryLowStockThreshold;
  if (available >= threshold) {
    await AlertState.updateOne({ itemId: item._id, state: { $ne: 'normal' } }, {
      $set: { state: 'normal', claimId: null, claimedAt: null },
    });
    return { status: 'healthy' };
  }
  if (!recipient) return { status: 'not-configured' };

  try {
    await AlertState.updateOne({ itemId: item._id }, { $setOnInsert: { itemId: item._id, state: 'normal' } }, { upsert: true });
  } catch (error) {
    if (error?.code !== 11000) throw error;
  }
  const claimId = randomUUID();
  const staleBefore = new Date(now.getTime() - claimLeaseMs);
  const claim = await AlertState.findOneAndUpdate({ itemId: item._id, $or: [
    { state: 'normal' }, { state: 'pending', claimedAt: { $lte: staleBefore } },
  ] }, { $set: { state: 'pending', claimId, claimedAt: now } }, { new: true });
  if (!claim) return { status: 'already-alerted' };

  try {
    const dashboardUrl = new URL('/admin/inventory', `${env.frontendOrigin}/`).toString();
    const email = inventoryLowStockEmail({ itemName: item.name, category: item.category, available, threshold, dashboardUrl });
    await deliver({ to: recipient, ...email });
    await AlertState.updateOne({ itemId: item._id, state: 'pending', claimId }, {
      $set: { state: 'low', lastAlertedAt: now }, $unset: { claimId: 1, claimedAt: 1 },
    });
    return { status: 'alerted' };
  } catch (error) {
    await AlertState.updateOne({ itemId: item._id, state: 'pending', claimId }, {
      $set: { state: 'normal' }, $unset: { claimId: 1, claimedAt: 1 },
    });
    throw error;
  }
}

export async function checkAllLowStock() {
  const items = await InventoryItem.find({}).select('_id');
  const outcomes = await Promise.allSettled(items.map((item) => checkLowStockForItem(item._id)));
  const failed = outcomes.filter((outcome) => outcome.status === 'rejected').length;
  if (failed) console.error('Some low-stock checks could not send alerts', { failed });
  return { checked: outcomes.length, failed };
}

export function startInventoryAlertScheduler() {
  if (scheduler) return scheduler;
  const run = async () => {
    if (checkRunning) return;
    checkRunning = true;
    try { await checkAllLowStock(); }
    catch (error) { console.error('Low-stock check failed', { name: error.name ?? 'Error' }); }
    finally { checkRunning = false; }
  };
  scheduler = setInterval(run, env.inventoryAlertCheckIntervalMs);
  scheduler.unref?.();
  void run();
  return scheduler;
}
