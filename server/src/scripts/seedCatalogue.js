import { connectDatabase, disconnectDatabase } from '../config/database.js';
import { InventoryItem } from '../models/InventoryItem.js';
import { Product } from '../models/Product.js';
import { env } from '../config/env.js';

const products = [
  { slug: 'garden-hop', name: 'Garden Hop', description: 'A bright, garden fresh favorite with roasted peppers, olives and sweet corn.', basePrice: 279, image: '/images/pizza-placeholder.svg', badge: 'GARDEN FRESH' },
  { slug: 'margherita', name: 'The Margherita', description: 'Tomato, creamy mozzarella and basil on a golden, hand stretched crust.', basePrice: 249, image: '/images/pizza-placeholder.svg', badge: 'THE CLASSIC' },
  { slug: 'smoky-mushroom', name: 'Smoky Mushroom', description: 'Savory mushrooms, red onion and herbs with a rich, smoky finish.', basePrice: 329, image: '/images/pizza-placeholder.svg', badge: 'UMAMI PICK' },
  { slug: 'spicy-paneer', name: 'Spicy Paneer', description: 'Tandoori paneer, peppers and onion with a lively chilli kick.', basePrice: 349, image: '/images/pizza-placeholder.svg', badge: 'A LITTLE HEAT' },
  { slug: 'corn-delight', name: 'Golden Corn Delight', description: 'Sweet corn, black olives and mozzarella for an easy crowd pleaser.', basePrice: 299, image: '/images/pizza-placeholder.svg', badge: 'CROWD FAVORITE' },
];

const ingredients = [
  { sku: 'base-classic', name: 'Classic hand tossed', category: 'base', price: 0, displayOrder: 1 },
  { sku: 'base-whole-wheat', name: 'Whole wheat', category: 'base', price: 25, displayOrder: 2 },
  { sku: 'base-thin-crust', name: 'Thin and crispy', category: 'base', price: 20, displayOrder: 3 },
  { sku: 'base-cheese-burst', name: 'Cheese burst', category: 'base', price: 55, displayOrder: 4 },
  { sku: 'base-gluten-friendly', name: 'Gluten friendly', category: 'base', price: 45, displayOrder: 5 },
  { sku: 'sauce-classic-tomato', name: 'Classic tomato', category: 'sauce', price: 0, displayOrder: 1 },
  { sku: 'sauce-spicy-arrabbiata', name: 'Spicy arrabbiata', category: 'sauce', price: 10, displayOrder: 2 },
  { sku: 'sauce-pesto', name: 'Basil pesto', category: 'sauce', price: 25, displayOrder: 3 },
  { sku: 'sauce-bbq', name: 'Smoky BBQ', category: 'sauce', price: 15, displayOrder: 4 },
  { sku: 'sauce-white', name: 'Creamy white sauce', category: 'sauce', price: 20, displayOrder: 5 },
  { sku: 'cheese-mozzarella', name: 'Mozzarella', category: 'cheese', price: 35, displayOrder: 1 },
  { sku: 'cheese-cheddar', name: 'Cheddar blend', category: 'cheese', price: 40, displayOrder: 2 },
  { sku: 'cheese-vegan', name: 'Plant based cheese', category: 'cheese', price: 55, displayOrder: 3 },
  { sku: 'cheese-extra-mozzarella', name: 'Extra mozzarella', category: 'cheese', price: 65, displayOrder: 4 },
  { sku: 'veg-bell-peppers', name: 'Bell peppers', category: 'vegetable', price: 20, displayOrder: 1 },
  { sku: 'veg-black-olives', name: 'Black olives', category: 'vegetable', price: 20, displayOrder: 2 },
  { sku: 'veg-sweet-corn', name: 'Sweet corn', category: 'vegetable', price: 15, displayOrder: 3 },
  { sku: 'veg-mushrooms', name: 'Mushrooms', category: 'vegetable', price: 25, displayOrder: 4 },
  { sku: 'veg-red-onion', name: 'Red onion', category: 'vegetable', price: 10, displayOrder: 5 },
  { sku: 'veg-jalapeno', name: 'Jalapeños', category: 'vegetable', price: 15, displayOrder: 6 },
];

try {
  await connectDatabase(env.mongoUri);
  for (const product of products) await Product.updateOne({ slug: product.slug }, { $set: product }, { upsert: true, runValidators: true });
  for (const ingredient of ingredients) await InventoryItem.updateOne({ sku: ingredient.sku }, { $set: ingredient }, { upsert: true, runValidators: true });
  console.info(`Catalogue ready: ${products.length} pizzas, ${ingredients.length} ingredients.`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await disconnectDatabase();
}
