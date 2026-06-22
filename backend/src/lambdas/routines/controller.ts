/**
 * Routines Controller
 *
 * Orchestrates validation, authorization, and repository calls.
 * Each method maps to one API endpoint. The handler delegates here
 * after routing; the controller never constructs HTTP responses directly.
 */

import type { APIGatewayProxyEventV2WithJWTAuthorizer } from 'aws-lambda';
import { ZodError } from 'zod';
import { getCallerIdentity, requireAdmin } from '../../shared/auth';
import { ValidationError } from '../../shared/errors';
import { logger } from '../../shared/logger';
import {
  muscleGroupParamSchema,
  routineParamsSchema,
  createRoutineSchema,
  updateRoutineSchema,
} from './schemas';
import * as repo from './repository';
import type { Exercise } from './repository';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseOrThrow<T>(schema: { parse: (v: unknown) => T }, data: unknown): T {
  try {
    return schema.parse(data);
  } catch (error) {
    if (error instanceof ZodError) {
      throw new ValidationError('Invalid request data', error.flatten());
    }
    throw error;
  }
}

function parseBody(event: APIGatewayProxyEventV2WithJWTAuthorizer): unknown {
  if (!event.body) return {};
  try {
    return JSON.parse(event.body);
  } catch {
    throw new ValidationError('Request body must be valid JSON');
  }
}

// ─── Endpoint Controllers ─────────────────────────────────────────────────────

/**
 * GET /routines
 * Lists all exercises across all muscle groups via GSI2.
 * Accessible to all authenticated users.
 */
export async function listRoutines(
  event: APIGatewayProxyEventV2WithJWTAuthorizer
): Promise<{ exercises: Exercise[]; count: number }> {
  const caller = getCallerIdentity(event);

  logger.info('Listing all routines', { requestedBy: caller.sub });

  const exercises = await repo.listAllExercises();
  return { exercises, count: exercises.length };
}

/**
 * GET /routines/group/{muscle}
 * Lists exercises for a specific muscle group using the base table PK.
 * Accessible to all authenticated users.
 */
export async function listRoutinesByGroup(
  event: APIGatewayProxyEventV2WithJWTAuthorizer
): Promise<{ exercises: Exercise[]; count: number; muscleGroup: string }> {
  const caller = getCallerIdentity(event);
  const { muscle } = parseOrThrow(muscleGroupParamSchema, event.pathParameters ?? {});

  logger.info('Listing routines by muscle group', {
    requestedBy: caller.sub,
    muscleGroup: muscle,
  });

  const exercises = await repo.listExercisesByMuscleGroup(muscle);
  return { exercises, count: exercises.length, muscleGroup: muscle };
}

/**
 * POST /routines
 * Creates a new exercise record.
 * Admin only.
 */
export async function createRoutine(
  event: APIGatewayProxyEventV2WithJWTAuthorizer
): Promise<Exercise> {
  const caller = getCallerIdentity(event);
  requireAdmin(caller);

  const input = parseOrThrow(createRoutineSchema, parseBody(event));

  logger.info('Creating routine', {
    requestedBy: caller.sub,
    muscleGroup: input.muscleGroup,
    exerciseName: input.exerciseName,
  });

  return repo.createExercise(input);
}

/**
 * PUT /routines/{muscle}/{id}
 * Updates mutable fields of an existing exercise.
 * Admin only.
 */
export async function updateRoutine(
  event: APIGatewayProxyEventV2WithJWTAuthorizer
): Promise<Exercise> {
  const caller = getCallerIdentity(event);
  requireAdmin(caller);

  const { muscle, id } = parseOrThrow(routineParamsSchema, event.pathParameters ?? {});
  const updates = parseOrThrow(updateRoutineSchema, parseBody(event));

  logger.info('Updating routine', {
    requestedBy: caller.sub,
    muscleGroup: muscle,
    exerciseId: id,
  });

  return repo.updateExercise(muscle, id, updates);
}

/**
 * DELETE /routines/{muscle}/{id}
 * Deletes an exercise record.
 * Admin only.
 */
export async function deleteRoutine(event: APIGatewayProxyEventV2WithJWTAuthorizer): Promise<void> {
  const caller = getCallerIdentity(event);
  requireAdmin(caller);

  const { muscle, id } = parseOrThrow(routineParamsSchema, event.pathParameters ?? {});

  logger.info('Deleting routine', {
    requestedBy: caller.sub,
    muscleGroup: muscle,
    exerciseId: id,
  });

  await repo.deleteExercise(muscle, id);
}
