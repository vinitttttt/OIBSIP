import mongoose from 'mongoose';

const orderIngredientSchema = new mongoose.Schema({
  ingredientId: { type: mongoose.Schema.Types.ObjectId, ref: 'InventoryItem', required: true },
  name: { type: String, required: true },
  category: { type: String, enum: ['base', 'sauce', 'cheese', 'vegetable'], required: true },
  pricePaise: { type: Number, min: 0, required: true },
}, { _id: false });

const orderLineSchema = new mongoose.Schema({
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  productName: { type: String, required: true },
  productSlug: { type: String, required: true },
  image: { type: String, required: true },
  basePricePaise: { type: Number, min: 0, required: true },
  ingredients: { type: [orderIngredientSchema], required: true },
  quantity: { type: Number, min: 1, max: 20, required: true },
  unitPricePaise: { type: Number, min: 0, required: true },
  lineTotalPaise: { type: Number, min: 0, required: true },
}, { _id: true });

const inventoryRequirementSchema = new mongoose.Schema({
  ingredientId: { type: mongoose.Schema.Types.ObjectId, ref: 'InventoryItem', required: true },
  quantity: { type: Number, min: 1, required: true },
}, { _id: false });

const orderStatusHistorySchema = new mongoose.Schema({
  status: { type: String, enum: ['PLACED', 'CONFIRMED', 'PREPARING', 'OUT_FOR_DELIVERY', 'DELIVERED'], required: true },
  changedAt: { type: Date, required: true, default: Date.now },
  actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  actorRole: { type: String, enum: ['customer', 'admin', 'system'], required: true },
}, { _id: false });

const orderSchema = new mongoose.Schema({
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  idempotencyKey: { type: String, required: true, trim: true, maxlength: 80 },
  items: { type: [orderLineSchema], required: true, validate: (value) => value.length > 0 },
  inventoryRequirements: { type: [inventoryRequirementSchema], required: true },
  subtotalPaise: { type: Number, min: 0, required: true },
  deliveryPaise: { type: Number, min: 0, default: 0, required: true },
  totalPaise: { type: Number, min: 0, required: true },
  currency: { type: String, required: true, uppercase: true, minlength: 3, maxlength: 3 },
  orderStatus: { type: String, enum: ['awaiting_payment', 'confirmed', 'payment_failed', 'expired'], default: 'awaiting_payment', required: true },
  fulfillmentStatus: { type: String, enum: ['PLACED', 'CONFIRMED', 'PREPARING', 'OUT_FOR_DELIVERY', 'DELIVERED'], default: 'PLACED', required: true },
  statusHistory: { type: [orderStatusHistorySchema], default: [] },
  paymentStatus: { type: String, enum: ['pending', 'succeeded', 'failed', 'expired'], default: 'pending', required: true },
  reservationStatus: { type: String, enum: ['reserved', 'released', 'deducted'], default: 'reserved', required: true },
  expiresAt: { type: Date, required: true },
  paidAt: { type: Date, default: null },
}, { timestamps: true });

orderSchema.index({ customerId: 1, createdAt: -1 });
orderSchema.index({ customerId: 1, idempotencyKey: 1 }, { unique: true });
orderSchema.index({ orderStatus: 1, reservationStatus: 1, expiresAt: 1 });

export const Order = mongoose.models.Order ?? mongoose.model('Order', orderSchema);
