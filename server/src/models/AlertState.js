import mongoose from 'mongoose';

const alertStateSchema = new mongoose.Schema({
  itemId: { type: mongoose.Schema.Types.ObjectId, ref: 'InventoryItem', required: true, unique: true },
  state: { type: String, enum: ['normal', 'pending', 'low'], default: 'normal', required: true },
  claimId: { type: String, default: null },
  claimedAt: { type: Date, default: null },
  lastAlertedAt: { type: Date, default: null },
}, { timestamps: true });

export const AlertState = mongoose.models.AlertState ?? mongoose.model('AlertState', alertStateSchema);
