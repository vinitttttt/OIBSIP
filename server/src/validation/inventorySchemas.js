import { z } from 'zod';

export const stockAdjustmentSchema = z.object({
  delta: z.number().int().min(-1_000_000).max(1_000_000).refine((value) => value !== 0),
  reason: z.string().trim().min(3).max(240).refine((value) => !/[\u0000-\u001f\u007f]/.test(value)),
}).strict();
