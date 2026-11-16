import { z } from 'zod';

const objectId = z.string().regex(/^[a-f\d]{24}$/i);
const customizationShape = {
  productId: objectId,
  baseId: objectId,
  sauceId: objectId,
  cheeseId: objectId,
  vegetableIds: z.array(objectId).max(6),
};

function rejectDuplicateVegetables(value, context) {
  if (new Set(value.vegetableIds).size !== value.vegetableIds.length) {
    context.addIssue({ code: 'custom', path: ['vegetableIds'], message: 'Choose each vegetable once.' });
  }
}

export const customizationSchema = z.object(customizationShape).strict().superRefine(rejectDuplicateVegetables);
export const addCartItemSchema = z.object({ ...customizationShape, quantity: z.number().int().min(1).max(20).default(1) }).strict().superRefine(rejectDuplicateVegetables);
export const cartQuantitySchema = z.object({ quantity: z.number().int().min(1).max(20) }).strict();
