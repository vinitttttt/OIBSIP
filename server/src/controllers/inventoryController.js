import { adjustOnHand, getInventorySummary, listInventory } from '../services/inventoryService.js';

export async function inventoryList(_req, res, next) {
  try { res.json({ items: await listInventory() }); } catch (error) { next(error); }
}

export async function inventorySummary(_req, res, next) {
  try { res.json(await getInventorySummary()); } catch (error) { next(error); }
}

export async function inventoryAdjust(req, res, next) {
  try {
    const item = await adjustOnHand({ itemId: req.params.id, ...req.validatedBody, actorId: req.auth.userId });
    res.json({ item });
  } catch (error) { next(error); }
}
