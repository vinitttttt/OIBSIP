import mongoose from 'mongoose';

const refreshSessionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  familyId: { type: String, required: true },
  tokenHash: { type: String, required: true, unique: true, select: false },
  expiresAt: { type: Date, required: true },
  revokedAt: { type: Date, default: null },
  replacedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'RefreshSession', default: null },
  reuseDetectedAt: { type: Date, default: null },
}, { timestamps: true });

refreshSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
refreshSessionSchema.index({ userId: 1, familyId: 1 });
refreshSessionSchema.set('toJSON', { transform: (_document, value) => ({
  id: String(value._id), expiresAt: value.expiresAt, revokedAt: value.revokedAt ?? null,
}) });

export const RefreshSession = mongoose.models.RefreshSession ?? mongoose.model('RefreshSession', refreshSessionSchema);
