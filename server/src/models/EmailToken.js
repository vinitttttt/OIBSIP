import mongoose from 'mongoose';

const emailTokenSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  purpose: { type: String, enum: ['email_verification', 'password_reset'], required: true },
  tokenHash: { type: String, required: true, unique: true, select: false },
  expiresAt: { type: Date, required: true },
  usedAt: { type: Date, default: null },
}, { timestamps: true });

emailTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
emailTokenSchema.index({ user: 1, purpose: 1, usedAt: 1 });
emailTokenSchema.set('toJSON', { transform: (_document, value) => ({
  id: String(value._id), purpose: value.purpose, expiresAt: value.expiresAt, usedAt: value.usedAt ?? null,
}) });

export const EmailToken = mongoose.models.EmailToken ?? mongoose.model('EmailToken', emailTokenSchema);
