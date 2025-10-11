import { z } from 'zod';

export const validatePayload = (schema: z.ZodSchema, data: any) => {
  return schema.parse(data);
};