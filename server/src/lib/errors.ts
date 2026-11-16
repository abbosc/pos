import { z } from 'zod';

/** An error whose message is safe to show to the user (in Uzbek). */
export class AppError extends Error {
  constructor(
    public status: 400 | 401 | 404 | 409 | 413 | 429,
    message: string,
  ) {
    super(message);
  }
}

export const notFound = (what = 'Maʼlumot') => new AppError(404, `${what} topilmadi`);

export function parse<T extends z.ZodType>(schema: T, data: unknown): z.infer<T> {
  const r = schema.safeParse(data);
  if (!r.success) {
    const issue = r.error.issues[0];
    const where = issue?.path.length ? `${issue.path.join('.')}: ` : '';
    throw new AppError(400, `Notoʻgʻri maʼlumot — ${where}${issue?.message ?? ''}`);
  }
  return r.data;
}
