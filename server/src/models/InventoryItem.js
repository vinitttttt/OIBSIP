import mongoose from 'mongoose';
import { env } from '../config/env.js';

const inventoryItemSchema = new mongoose.Schema({
  sku: { type: String, required: true, unique: true, trim: true, lowercase: true },
  name: { type: String, required: true, trim: true, maxlength: 80 },
  category: { type: String, enum: ['base', 'sauce', 'cheese', 'vegetable'], required: true },
  price: { type: Number, required: true, min: 0 },
  isAvailable: { type: Boolean, default: true, required: true },
  onHand: { type: Number, min: 0, default: 0, required: true },
  reserved: { type: Number, min: 0, default: 0, required: true },
  lowStockThreshold: { type: Number, min: 0, default: env.inventoryLowStockThreshold, required: true },
  displayOrder: { type: Number, default: 0 },
}, { timestamps: true });

inventoryItemSchema.index({ category: 1, isAvailable: 1, displayOrder: 1 });

export const InventoryItem = mongoose.models.InventoryItem ?? mongoose.model('InventoryItem', inventoryItemSchema);
