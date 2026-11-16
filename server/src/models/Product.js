import mongoose from 'mongoose';

const productSchema = new mongoose.Schema({
  slug: { type: String, required: true, unique: true, trim: true, lowercase: true },
  name: { type: String, required: true, trim: true, maxlength: 100 },
  description: { type: String, required: true, trim: true, maxlength: 500 },
  basePrice: { type: Number, required: true, min: 0 },
  image: { type: String, required: true },
  badge: { type: String, default: 'HOUSE FAVORITE' },
  available: { type: Boolean, default: true, required: true },
}, { timestamps: true });

productSchema.index({ available: 1, slug: 1 });

export const Product = mongoose.models.Product ?? mongoose.model('Product', productSchema);
