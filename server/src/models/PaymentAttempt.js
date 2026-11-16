import mongoose from 'mongoose';

const paymentAttemptSchema = new mongoose.Schema({
  orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true },
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  provider: { type: String, enum: ['mock'], default: 'mock', required: true },
  attemptNumber: { type: Number, min: 1, required: true },
  providerReference: { type: String, required: true, unique: true },
  confirmationTokenHash: { type: String, required: true, select: false },
  amountPaise: { type: Number, min: 1, required: true },
  currency: { type: String, required: true },
  status: { type: String, enum: ['pending', 'succeeded', 'failed', 'expired'], default: 'pending', required: true },
  outcome: { type: String, enum: ['success', 'failure'], default: null },
  completedAt: { type: Date, default: null },
}, { timestamps: true });

paymentAttemptSchema.index({ orderId: 1, attemptNumber: 1 }, { unique: true });
paymentAttemptSchema.index({ customerId: 1, createdAt: -1 });

export const PaymentAttempt = mongoose.models.PaymentAttempt ?? mongoose.model('PaymentAttempt', paymentAttemptSchema);
