/**
 * Routines Repository
 *
 * Handles all DynamoDB read/write operations for exercise records.
 * Uses the shared helper functions from database/client — never the
 * raw DocumentClient directly.
 *
 * Access patterns:
 *   listAllExercises        → GSI2 (EntityType HASH + Timestamp RANGE)
 *   listExercisesByMuscle   → Base table PK = ROUTINE#<muscle>
 *   createExercise          → PutItem with ConditionExpression
 *   updateExercise          → UpdateItem with buildUpdateExpression
 *   deleteExercise          → DeleteItem with ConditionExpression
 */

import { randomUUID } from 'crypto';
import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
import {
  queryItems,
  putItem,
  updateItem,
  deleteItem,
  buildUpdateExpression,
} from '../../database/client';
import { ConflictError, NotFoundError } from '../../shared/errors';
import type { MuscleGroup, CreateRoutineInput, UpdateRoutineInput } from './schemas';

const TABLE = process.env.TABLE_NAME!;

// ─── Domain Types ─────────────────────────────────────────────────────────────

export interface Exercise {
  exerciseId: string;
  muscleGroup: MuscleGroup;
  exerciseName: string;
  sets: number;
  reps: number;
  description: string;
  difficulty: 'Beginner' | 'Intermediate' | 'Advanced';
  createdAt: string;
  updatedAt: string;
}

interface ExerciseRecord extends Exercise {
  PK: string;
  SK: string;
  EntityType: 'Exercise';
  Timestamp: string;
}

// Strip DynamoDB keys from a raw record to return a clean domain object
function toExercise({
  PK: _pk,
  SK: _sk,
  EntityType: _et,
  Timestamp: _ts,
  ...exercise
}: ExerciseRecord): Exercise {
  return exercise;
}

// ─── Public Repository Interface ──────────────────────────────────────────────

/**
 * List all exercises across all muscle groups.
 * Uses GSI2 (EntityType HASH + Timestamp RANGE) — avoids a full table Scan.
 */
export async function listAllExercises(): Promise<Exercise[]> {
  const records = await queryItems<ExerciseRecord>({
    TableName: TABLE,
    IndexName: 'GSI2',
    KeyConditionExpression: 'EntityType = :entityType',
    ExpressionAttributeValues: { ':entityType': 'Exercise' },
  });
  return records.map(toExercise);
}

/**
 * List exercises for a specific muscle group.
 * Queries the base table by PK — no GSI required.
 */
export async function listExercisesByMuscleGroup(muscleGroup: MuscleGroup): Promise<Exercise[]> {
  const records = await queryItems<ExerciseRecord>({
    TableName: TABLE,
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
    ExpressionAttributeValues: {
      ':pk': `ROUTINE#${muscleGroup}`,
      ':skPrefix': 'EXERCISE#',
    },
  });
  return records.map(toExercise);
}

/**
 * Insert a new exercise record.
 * Fails with ConflictError if PK+SK already exists (should not happen with UUIDs).
 */
export async function createExercise(input: CreateRoutineInput): Promise<Exercise> {
  const exerciseId = randomUUID();
  const now = new Date().toISOString();

  const record: ExerciseRecord = {
    PK: `ROUTINE#${input.muscleGroup}`,
    SK: `EXERCISE#${exerciseId}`,
    EntityType: 'Exercise',
    Timestamp: now,
    exerciseId,
    muscleGroup: input.muscleGroup,
    exerciseName: input.exerciseName,
    sets: input.sets,
    reps: input.reps,
    description: input.description,
    difficulty: input.difficulty,
    createdAt: now,
    updatedAt: now,
  };

  try {
    await putItem({
      TableName: TABLE,
      ConditionExpression: 'attribute_not_exists(PK)',
      Item: record,
    });
  } catch (err) {
    if (err instanceof ConditionalCheckFailedException) {
      throw new ConflictError('Exercise already exists');
    }
    throw err;
  }

  return toExercise(record);
}

/**
 * Update mutable fields of an existing exercise.
 * buildUpdateExpression automatically stamps updatedAt.
 * Fails with NotFoundError if the item does not exist.
 */
export async function updateExercise(
  muscleGroup: MuscleGroup,
  exerciseId: string,
  updates: UpdateRoutineInput
): Promise<Exercise> {
  const { UpdateExpression, ExpressionAttributeNames, ExpressionAttributeValues } =
    buildUpdateExpression(updates as Record<string, unknown>);

  try {
    await updateItem({
      TableName: TABLE,
      Key: {
        PK: `ROUTINE#${muscleGroup}`,
        SK: `EXERCISE#${exerciseId}`,
      },
      UpdateExpression,
      ExpressionAttributeNames,
      ExpressionAttributeValues,
      ConditionExpression: 'attribute_exists(PK)',
    });
  } catch (err) {
    if (err instanceof ConditionalCheckFailedException) {
      throw new NotFoundError('Exercise not found');
    }
    throw err;
  }

  // updateItem helper returns void — re-fetch would add latency for no benefit,
  // so we reconstruct the updated fields from what we know and return them.
  // The controller only uses this for the 200 response body.
  const now = new Date().toISOString();
  return {
    exerciseId,
    muscleGroup,
    ...updates,
    updatedAt: now,
  } as Exercise;
}

/**
 * Delete an exercise record.
 * Fails with NotFoundError if the item does not exist.
 */
export async function deleteExercise(muscleGroup: MuscleGroup, exerciseId: string): Promise<void> {
  try {
    await deleteItem({
      TableName: TABLE,
      Key: {
        PK: `ROUTINE#${muscleGroup}`,
        SK: `EXERCISE#${exerciseId}`,
      },
      ConditionExpression: 'attribute_exists(PK)',
    });
  } catch (err) {
    if (err instanceof ConditionalCheckFailedException) {
      throw new NotFoundError('Exercise not found');
    }
    throw err;
  }
}
