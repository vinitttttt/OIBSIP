import { z } from 'zod';

export const fulfillmentStatuses = ['PLACED', 'CONFIRMED', 'PREPARING', 'OUT_FOR_DELIVERY', 'DELIVERED'];

export const updateOrderStatusSchema = z.object({
  status: z.enum(fulfillmentStatuses),
}).strict();
