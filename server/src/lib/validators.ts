import { z } from 'zod';

export const money = z.number().int().min(0).max(1_000_000_000);
export const positiveMoney = z.number().int().min(1).max(1_000_000_000);
export const qty = z.number().int().min(0).max(1_000_000);
export const positiveQty = z.number().int().min(1).max(1_000_000);
export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'sana YYYY-MM-DD formatida boʻlishi kerak');
export const id = z.number().int().positive();
export const note = z
  .string()
  .trim()
  .max(500)
  .optional()
  .nullable()
  .transform((v) => (v ? v : null));
export const name = z.string().trim().min(1, 'nom kiritilmagan').max(100);

/**
 * Like schema.partial(), but fields that are not sent stay undefined instead of being filled with
 * their defaults — so a PATCH only changes what it sends.
 */
export function patchOf<T extends z.ZodRawShape>(schema: z.ZodObject<T>) {
  const shape: Record<string, z.ZodType> = {};
  for (const [key, field] of Object.entries(schema.shape)) {
    let f = field as z.ZodType;
    while (f instanceof z.ZodDefault) f = f.unwrap() as z.ZodType;
    shape[key] = f.optional();
  }
  return z.object(shape) as unknown as z.ZodObject<{ [K in keyof T]: z.ZodOptional<T[K]> }>;
}
