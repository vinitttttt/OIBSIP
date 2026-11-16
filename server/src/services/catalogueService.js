import mongoose from 'mongoose';
import { Cart } from '../models/Cart.js';
import { InventoryItem } from '../models/InventoryItem.js';
import { Product } from '../models/Product.js';
import { authError } from '../utils/authErrors.js';

const categories = ['base', 'sauce', 'cheese', 'vegetable'];

export function serializeProduct(product) {
  return {
    id: String(product._id), slug: product.slug, name: product.name, description: product.description,
    basePrice: product.basePrice, currency: 'INR', image: product.image, badge: product.badge,
  };
}

export async function listCatalogue() {
  const products = await Product.find({ available: true }).sort({ name: 1 }).lean();
  return products.map(serializeProduct);
}

export async function getCatalogueProduct(id) {
  if (!mongoose.isValidObjectId(id)) throw authError(400, 'INVALID_PRODUCT_ID', 'Product id is invalid.');
  const product = await Product.findOne({ _id: id, available: true }).lean();
  if (!product) throw authError(404, 'PRODUCT_NOT_FOUND', 'That pizza is not available.');
  return serializeProduct(product);
}

export async function getCustomizerOptions() {
  const items = await InventoryItem.find({ isAvailable: true }).sort({ category: 1, displayOrder: 1, name: 1 }).lean();
  return Object.fromEntries(categories.map((category) => [category, items.filter((item) => item.category === category && item.onHand - item.reserved > 0).map((item) => ({
    id: String(item._id), name: item.name, price: item.price, currency: 'INR',
  }))]));
}

async function resolveCustomization(selection, requiredQuantity = 1, session) {
  if (!mongoose.isValidObjectId(selection.productId)) throw authError(400, 'INVALID_PRODUCT_ID', 'Product id is invalid.');
  let productQuery = Product.findOne({ _id: selection.productId, available: true });
  if (session) productQuery = productQuery.session(session);
  const product = await productQuery.lean();
  if (!product) throw authError(400, 'UNAVAILABLE_SELECTION', 'That pizza is unavailable.');

  const ids = [selection.baseId, selection.sauceId, selection.cheeseId, ...selection.vegetableIds];
  if (new Set(ids).size !== ids.length) throw authError(400, 'INVALID_INGREDIENTS', 'Ingredient selections must be unique.');
  let itemsQuery = InventoryItem.find({ _id: { $in: ids }, isAvailable: true });
  if (session) itemsQuery = itemsQuery.session(session);
  const items = await itemsQuery.lean();
  const byId = new Map(items.map((item) => [String(item._id), item]));
  const picked = [
    [selection.baseId, 'base'], [selection.sauceId, 'sauce'], [selection.cheeseId, 'cheese'],
    ...selection.vegetableIds.map((id) => [id, 'vegetable']),
  ].map(([id, category]) => {
    const item = byId.get(String(id));
    if (!item || item.category !== category || item.isAvailable === false) throw authError(400, 'INVALID_INGREDIENTS', 'One or more ingredient selections are invalid or unavailable.');
    if ((item.onHand ?? 0) - (item.reserved ?? 0) < requiredQuantity) throw authError(409, 'INSUFFICIENT_STOCK', 'An ingredient does not have enough available stock for this cart quantity.');
    return item;
  });
  const total = Number((product.basePrice + picked.reduce((sum, item) => sum + item.price, 0)).toFixed(2));
  return { product, ingredients: picked, total };
}

export async function priceCustomization(selection, { session, requiredQuantity = 1 } = {}) {
  const resolved = await resolveCustomization(selection, requiredQuantity, session);
  return {
    product: serializeProduct(resolved.product),
    ingredients: resolved.ingredients.map((item) => ({ id: String(item._id), name: item.name, category: item.category, price: item.price })),
    unitPrice: resolved.total,
    currency: 'INR',
  };
}

export const priceCustomizationForOrder = priceCustomization;

function sameSelection(line, selection) {
  const same = (left, right) => String(left) === String(right);
  return same(line.productId, selection.productId) && same(line.baseId, selection.baseId) && same(line.sauceId, selection.sauceId) &&
    same(line.cheeseId, selection.cheeseId) && line.vegetableIds.length === selection.vegetableIds.length &&
    line.vegetableIds.every((id) => selection.vegetableIds.some((candidate) => same(id, candidate)));
}

async function serializeCart(cart) {
  const lines = await Promise.all(cart.items.map(async (line) => {
    const selection = {
      productId: String(line.productId), baseId: String(line.baseId), sauceId: String(line.sauceId),
      cheeseId: String(line.cheeseId), vegetableIds: line.vegetableIds.map(String),
    };
    const priced = await resolveCustomization(selection);
    return {
      id: String(line._id), product: serializeProduct(priced.product),
      ingredients: priced.ingredients.map((item) => ({ id: String(item._id), name: item.name, category: item.category })),
      quantity: line.quantity, unitPrice: priced.total, subtotal: Number((priced.total * line.quantity).toFixed(2)),
    };
  }));
  return { items: lines, subtotal: Number(lines.reduce((sum, line) => sum + line.subtotal, 0).toFixed(2)), currency: 'INR' };
}

async function getOrCreateCart(userId) {
  return Cart.findOneAndUpdate({ userId }, { $setOnInsert: { userId, items: [] } }, { new: true, upsert: true });
}

export async function getCustomerCart(userId) {
  return serializeCart(await getOrCreateCart(userId));
}

export async function addCustomerCartItem(userId, selection) {
  const cart = await getOrCreateCart(userId);
  const existing = cart.items.find((line) => sameSelection(line, selection));
  const nextQuantity = Math.min(20, (existing?.quantity ?? 0) + selection.quantity);
  await resolveCustomization(selection, nextQuantity);
  if (existing) existing.quantity = nextQuantity;
  else cart.items.push({ ...selection, quantity: nextQuantity });
  await cart.save();
  return serializeCart(cart);
}

export async function updateCustomerCartQuantity(userId, itemId, quantity) {
  const cart = await Cart.findOne({ userId });
  const line = cart?.items.id(itemId);
  if (!line) throw authError(404, 'CART_ITEM_NOT_FOUND', 'That cart item was not found.');
  line.quantity = quantity;
  await cart.save();
  return serializeCart(cart);
}

export async function removeCustomerCartItem(userId, itemId) {
  const cart = await Cart.findOne({ userId });
  if (!cart?.items.id(itemId)) throw authError(404, 'CART_ITEM_NOT_FOUND', 'That cart item was not found.');
  cart.items.pull({ _id: itemId });
  await cart.save();
  return serializeCart(cart);
}
