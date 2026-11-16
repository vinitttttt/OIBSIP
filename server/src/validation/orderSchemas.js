import { z } from 'zod';

const objectId = z.string().regex(/^[a-f\d]{24}$/i);

export const createOrderSchema = z.object({}).strict();
export const initializePaymentSchema = z.object({ orderId: objectId }).strict();
export const confirmMockPaymentSchema = z.object({
  attemptId: objectId,
  confirmationToken: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  outcome: z.enum(['success', 'failure']),
}).strict();

export { objectId };
