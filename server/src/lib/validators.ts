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
