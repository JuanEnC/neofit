/**
 * Zod validation schemas for the Payments Lambda.
 *
 * Amount is always stored and transmitted in the smallest currency unit
 * (MXN cents). $699.00 MXN = 69900 cents.
 *
 * Note: userId uses a relaxed UUID regex instead of z.string().uuid()
 * because Cognito generates UUID v7 identifiers, which Zod's strict
 * UUID v4 validator rejects.
 */

import { z } from 'zod';

// Accepts any RFC 4122 UUID format (v1 through v8, including Cognito v7)
const uuidSchema = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, {
    message: 'Invalid UUID',
  });

// ─── Path Parameters ──────────────────────────────────────────────────────────

export const userIdParamSchema = z.object({
  userId: uuidSchema,
});

// ─── Request Bodies ───────────────────────────────────────────────────────────

export const createPaymentIntentSchema = z.object({
  userId: uuidSchema,
  amount: z.number().int().min(100, { message: 'Minimum amount is 100 cents (MXN $1.00)' }),
  currency: z.enum(['MXN'], { errorMap: () => ({ message: 'Only MXN currency is supported' }) }),
});

export const manualRenewalSchema = z.object({
  amount: z.number().int().min(69900).default(69900),
  note: z.string().max(500).optional(),
});

// ─── Inferred Types ───────────────────────────────────────────────────────────

export type UserIdParam = z.infer<typeof userIdParamSchema>;
export type CreatePaymentIntentInput = z.infer<typeof createPaymentIntentSchema>;
export type ManualRenewalInput = z.infer<typeof manualRenewalSchema>;
