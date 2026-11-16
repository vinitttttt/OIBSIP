import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import mongoose from 'mongoose';
import { randomUUID } from 'node:crypto';
import app from '../src/app.js';
import { connectDatabase } from '../src/config/database.js';
import { env } from '../src/config/env.js';
import { Cart } from '../src/models/Cart.js';
import { InventoryItem } from '../src/models/InventoryItem.js';
import { Product } from '../src/models/Product.js';
import { User } from '../src/models/User.js';
import { createAccessToken } from '../src/utils/tokens.js';

const suffix = randomUUID().replaceAll('-', '').slice(0, 12);
const slug = `test-pizza-${suffix}`;
const sku = (name) => `test-${name}-${suffix}`;
const ids = {};
let customer;
let admin;
let server;
let baseUrl;

before(async () => {
  await connectDatabase(env.mongoUri);
  customer = await User.create({ name: 'Catalogue Customer', email: `catalogue-${suffix}@example.test`, passwordHash: 'test-hash', emailVerifiedAt: new Date() });
  admin = await User.create({ name: 'Catalogue Admin', email: `catalogue-admin-${suffix}@example.test`, passwordHash: 'test-hash', role: 'admin', emailVerifiedAt: new Date() });
  const product = await Product.create({ slug, name: 'Test Pizza', description: 'A test pizza for the catalogue.', basePrice: 200, image: '/images/pizza-placeholder.svg' });
  ids.product = String(product._id);
  for (const [category, price] of [['base', 10], ['sauce', 5], ['cheese', 20], ['vegetable', 7]]) {
    const item = await InventoryItem.create({ sku: sku(category), name: `Test ${category}`, category, price, available: true });
    ids[category] = String(item._id);
  }
  server = app.listen(0);
  baseUrl = `http://127.0.0.1:${server.address().port}/api/v1`;
});

after(async () => {
  if (customer) {
    await Cart.deleteMany({ userId: customer._id });
    await User.deleteOne({ _id: customer._id });
  }
  if (admin) await User.deleteOne({ _id: admin._id });
  await Product.deleteOne({ slug });
  await InventoryItem.deleteMany({ sku: { $in: ['base', 'sauce', 'cheese', 'vegetable'].map(sku) } });
  if (server) await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  await mongoose.disconnect();
});

test('catalogue and product detail return available pizzas', async () => {
  const list = await fetch(`${baseUrl}/catalogue`);
  assert.equal(list.status, 200);
  const products = await list.json();
  assert(products.some((product) => product.id === ids.product));
  const detail = await fetch(`${baseUrl}/catalogue/${ids.product}`);
  assert.equal(detail.status, 200);
  assert.equal((await detail.json()).basePrice, 200);
  assert.equal((await fetch(`${baseUrl}/catalogue/not-an-id`)).status, 400);
});

test('customizer options expose categories and backend pricing validates ingredient ids', async () => {
  const optionsResponse = await fetch(`${baseUrl}/customizer/options`);
  assert.equal(optionsResponse.status, 200);
  const options = await optionsResponse.json();
  for (const category of ['base', 'sauce', 'cheese', 'vegetable']) assert(options[category].some((item) => item.id === ids[category]));

  const selection = { productId: ids.product, baseId: ids.base, sauceId: ids.sauce, cheeseId: ids.cheese, vegetableIds: [ids.vegetable] };
  const priceResponse = await fetch(`${baseUrl}/customizer/price`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(selection) });
  assert.equal(priceResponse.status, 200);
  const quote = await priceResponse.json();
  assert.equal(quote.unitPrice, 242);
  assert.equal(quote.currency, 'INR');

  const invalid = await fetch(`${baseUrl}/customizer/price`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...selection, vegetableIds: [new mongoose.Types.ObjectId().toString()] }) });
  assert.equal(invalid.status, 400);
  await InventoryItem.updateOne({ _id: ids.vegetable }, { $set: { available: false } });
  try {
    const unavailable = await fetch(`${baseUrl}/customizer/price`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(selection) });
    assert.equal(unavailable.status, 400);
  } finally { await InventoryItem.updateOne({ _id: ids.vegetable }, { $set: { available: true } }); }
  const frontendPrice = await fetch(`${baseUrl}/customizer/price`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...selection, price: 1 }) });
  assert.equal(frontendPrice.status, 400, 'client-supplied prices are not accepted');
});

test('cart requires a customer access token and persists a server-priced customization', async () => {
  assert.equal((await fetch(`${baseUrl}/cart`)).status, 401);
  assert.equal((await fetch(`${baseUrl}/cart`, { headers: { Authorization: `Bearer ${createAccessToken(admin)}` } })).status, 403);
  const token = createAccessToken(customer);
  const response = await fetch(`${baseUrl}/cart/items`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ productId: ids.product, baseId: ids.base, sauceId: ids.sauce, cheeseId: ids.cheese, vegetableIds: [ids.vegetable], quantity: 2 }),
  });
  assert.equal(response.status, 200);
  const cart = await response.json();
  assert.equal(cart.items.length, 1);
  assert.equal(cart.items[0].unitPrice, 242);
  assert.equal(cart.subtotal, 484);
  const itemId = cart.items[0].id;
  const updated = await fetch(`${baseUrl}/cart/items/${itemId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ quantity: 3 }) });
  assert.equal((await updated.json()).subtotal, 726);
  const removed = await fetch(`${baseUrl}/cart/items/${itemId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
  assert.deepEqual((await removed.json()).items, []);
});
