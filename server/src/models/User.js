import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, minlength: 1, maxlength: 100 },
  email: { type: String, required: true, trim: true, lowercase: true, maxlength: 254 },
  passwordHash: { type: String, required: true, select: false },
  role: { type: String, enum: ['customer', 'admin'], default: 'customer', required: true },
  emailVerifiedAt: { type: Date, default: null },
  isActive: { type: Boolean, default: true, required: true },
}, { timestamps: true });

userSchema.index({ email: 1 }, { unique: true });
userSchema.set('toJSON', { transform: (document) => serializeSafeUser(document) });

export const User = mongoose.models.User ?? mongoose.model('User', userSchema);

export function serializeSafeUser(user) {
  if (!user) return null;
  const get = (key) => typeof user.get === 'function' ? user.get(key) : user[key];
  const id = get('_id') ?? get('id');
  const emailVerifiedAt = get('emailVerifiedAt');
  return Object.freeze({
    id: id == null ? undefined : String(id),
    name: get('name'),
    email: get('email'),
    role: get('role'),
    emailVerifiedAt: emailVerifiedAt ?? null,
  });
}
