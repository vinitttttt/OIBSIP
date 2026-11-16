import mongoose from 'mongoose';
import { EmailToken } from '../models/EmailToken.js';
import { RefreshSession } from '../models/RefreshSession.js';
import { User } from '../models/User.js';
import { Product } from '../models/Product.js';
import { InventoryItem } from '../models/InventoryItem.js';
import { Cart } from '../models/Cart.js';
import { InventoryMovement } from '../models/InventoryMovement.js';
import { AlertState } from '../models/AlertState.js';
import { Order } from '../models/Order.js';
import { PaymentAttempt } from '../models/PaymentAttempt.js';

export async function connectDatabase(uri) {
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
  await Promise.all([User.init(), EmailToken.init(), RefreshSession.init(), Product.init(), InventoryItem.init(), Cart.init(), InventoryMovement.init(), AlertState.init(), Order.init(), PaymentAttempt.init()]);
  return mongoose.connection;
}

export function getDatabaseStatus() {
  const states = ['disconnected', 'connected', 'connecting', 'disconnecting'];
  const readyState = mongoose.connection.readyState;
  return { status: readyState === 1 ? 'connected' : 'disconnected', state: states[readyState] ?? 'unknown' };
}

export async function disconnectDatabase() {
  await mongoose.disconnect();
}
