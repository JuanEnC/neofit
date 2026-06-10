/**
 * Zod validation schemas for the Users Lambda.
 *
 * Every inbound payload is parsed against these schemas before it
 * reaches the controller layer. Invalid input is rejected with 400
 * before touching the database.
 */

import { z } from 'zod';

const PHONE_REGEX = /^\+?[\d\s\-().]{7,20}$/;

// ─── Path Parameters ──────────────────────────────────────────────────────────

export const userIdParamSchema = z.object({
  id: z.string().uuid({ message: 'User ID must be a valid UUID' }),
});

// ─── Query Parameters ─────────────────────────────────────────────────────────

export const listUsersQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  lastKey: z.string().optional(), // Base64-encoded DynamoDB LastEvaluatedKey
  status: z.enum(['Active', 'Inactive', 'Frozen']).optional(),
});

export const searchUsersQuerySchema = z.object({
  q: z.string().min(2, { message: 'Search term must be at least 2 characters' }).max(100),
  limit: z.coerce.number().int().min(1).max(50).optional().default(10),
});

// ─── Request Bodies ───────────────────────────────────────────────────────────

export const updateUserSchema = z
  .object({
    firstName: z.string().min(1).max(100).optional(),
    lastName: z.string().min(1).max(100).optional(),
    phone: z.string().regex(PHONE_REGEX, { message: 'Invalid phone number format' }).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided for update',
  });

export const updateStatusSchema = z.object({
  status: z.enum(['Active', 'Inactive', 'Frozen'], {
    message: 'Status must be Active, Inactive, or Frozen',
  }),
  reason: z.string().max(500).optional(), // Optional audit note
});

// ─── Inferred Types ───────────────────────────────────────────────────────────

export type UserIdParam = z.infer<typeof userIdParamSchema>;
export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;
export type SearchUsersQuery = z.infer<typeof searchUsersQuerySchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type UpdateStatusInput = z.infer<typeof updateStatusSchema>;
