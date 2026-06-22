/**
 * Zod validation schemas for the Routines Lambda.
 *
 * Note: exerciseId uses a relaxed UUID regex instead of z.string().uuid()
 * because Cognito generates UUID v7 identifiers, which Zod's strict
 * UUID v4 validator rejects. The same regex is applied here for consistency.
 */

import { z } from 'zod';

// Accepts any RFC 4122 UUID format (v1 through v8)
const uuidSchema = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, {
    message: 'Invalid UUID',
  });

export const VALID_MUSCLE_GROUPS = [
  'Chest',
  'Back',
  'Legs',
  'Shoulders',
  'Arms',
  'Core',
  'Full Body',
] as const;

export type MuscleGroup = (typeof VALID_MUSCLE_GROUPS)[number];

// ─── Path Parameters ──────────────────────────────────────────────────────────

export const muscleGroupParamSchema = z.object({
  muscle: z.enum(VALID_MUSCLE_GROUPS, {
    errorMap: () => ({
      message: `muscle must be one of: ${VALID_MUSCLE_GROUPS.join(', ')}`,
    }),
  }),
});

export const routineParamsSchema = z.object({
  muscle: z.enum(VALID_MUSCLE_GROUPS, {
    errorMap: () => ({
      message: `muscle must be one of: ${VALID_MUSCLE_GROUPS.join(', ')}`,
    }),
  }),
  id: uuidSchema,
});

// ─── Request Bodies ───────────────────────────────────────────────────────────

export const createRoutineSchema = z.object({
  exerciseName: z.string().min(1, 'exerciseName is required').max(100),
  muscleGroup: z.enum(VALID_MUSCLE_GROUPS),
  sets: z.number().int().min(1).max(20),
  reps: z.number().int().min(1).max(100),
  description: z.string().min(1, 'description is required').max(500),
  difficulty: z.enum(['Beginner', 'Intermediate', 'Advanced']),
});

export const updateRoutineSchema = createRoutineSchema
  .omit({ muscleGroup: true }) // muscleGroup is immutable — comes from path, not body
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided for update',
  });

// ─── Inferred Types ───────────────────────────────────────────────────────────

export type MuscleGroupParam = z.infer<typeof muscleGroupParamSchema>;
export type RoutineParams = z.infer<typeof routineParamsSchema>;
export type CreateRoutineInput = z.infer<typeof createRoutineSchema>;
export type UpdateRoutineInput = z.infer<typeof updateRoutineSchema>;
