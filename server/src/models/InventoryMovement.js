import mongoose from 'mongoose';

const inventoryMovementSchema = new mongoose.Schema({
  itemId: { type: mongoose.Schema.Types.ObjectId, ref: 'InventoryItem', required: true, index: true },
  kind: { type: String, enum: ['manual_adjustment', 'reservation', 'reservation_release', 'reserved_deduction'], required: true },
  onHandDelta: { type: Number, required: true },
  reservedDelta: { type: Number, required: true },
  onHandBefore: { type: Number, required: true },
  onHandAfter: { type: Number, required: true },
  reservedBefore: { type: Number, required: true },
  reservedAfter: { type: Number, required: true },
  reason: { type: String, trim: true, maxlength: 240, default: '' },
  actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  referenceId: { type: String, trim: true, maxlength: 100, default: null },
}, { timestamps: true, versionKey: false });

inventoryMovementSchema.index({ itemId: 1, createdAt: -1 });

export const InventoryMovement = mongoose.models.InventoryMovement ?? mongoose.model('InventoryMovement', inventoryMovementSchema);
