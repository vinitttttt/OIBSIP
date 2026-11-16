import mongoose from 'mongoose';

const cartLineSchema = new mongoose.Schema({
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  baseId: { type: mongoose.Schema.Types.ObjectId, ref: 'InventoryItem', required: true },
  sauceId: { type: mongoose.Schema.Types.ObjectId, ref: 'InventoryItem', required: true },
  cheeseId: { type: mongoose.Schema.Types.ObjectId, ref: 'InventoryItem', required: true },
  vegetableIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'InventoryItem' }],
  quantity: { type: Number, min: 1, max: 20, default: 1, required: true },
}, { timestamps: true });

const cartSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  items: { type: [cartLineSchema], default: [] },
}, { timestamps: true });

export const Cart = mongoose.models.Cart ?? mongoose.model('Cart', cartSchema);
