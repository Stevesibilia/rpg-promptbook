import type { z } from 'zod';
import { AppError } from './errors.js';

// Parses a request body with a zod schema, answering 400 with the first
// problem when it does not fit.
export function parseBody<T extends z.ZodType>(schema: T, body: unknown): z.output<T> {
  const result = schema.safeParse(body ?? {});
  if (result.success) return result.data;
  const issue = result.error.issues[0];
  const where = issue?.path.length ? `${issue.path.join('.')}: ` : '';
  throw new AppError(400, 'validation_error', `${where}${issue?.message ?? 'invalid request'}`);
}
