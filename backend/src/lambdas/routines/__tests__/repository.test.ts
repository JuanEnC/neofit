/**
 * Unit tests for the Routines Repository.
 *
 * All DynamoDB SDK calls are intercepted with aws-sdk-client-mock
 * so tests run without any network or AWS account dependency.
 */

/// <reference types="jest" />

import { beforeEach } from '@jest/globals';
import {
  DynamoDBDocumentClient,
  PutCommand,
  UpdateCommand,
  DeleteCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';
import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import {
  listAllExercises,
  listExercisesByMuscleGroup,
  createExercise,
  updateExercise,
  deleteExercise,
} from '../repository';
import { ConflictError, NotFoundError } from '../../../shared/errors';

// ─── Mock Setup ───────────────────────────────────────────────────────────────

const ddbMock = mockClient(DynamoDBDocumentClient);

beforeEach(() => {
  ddbMock.reset();
  process.env.TABLE_NAME = 'NeoFit_MasterTable_test';
});

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const EXERCISE_ID = 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a33';

const exerciseRecord = {
  PK: 'ROUTINE#Chest',
  SK: `EXERCISE#${EXERCISE_ID}`,
  EntityType: 'Exercise' as const,
  Timestamp: '2026-01-01T00:00:00.000Z',
  exerciseId: EXERCISE_ID,
  muscleGroup: 'Chest' as const,
  exerciseName: 'Bench Press',
  sets: 4,
  reps: 10,
  description: 'Classic chest compound movement',
  difficulty: 'Intermediate' as const,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

// Domain object — DynamoDB keys stripped
const exerciseDomain = {
  exerciseId: EXERCISE_ID,
  muscleGroup: 'Chest',
  exerciseName: 'Bench Press',
  sets: 4,
  reps: 10,
  description: 'Classic chest compound movement',
  difficulty: 'Intermediate',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

// ─── listAllExercises ─────────────────────────────────────────────────────────

describe('listAllExercises', () => {
  it('queries GSI2 with EntityType = Exercise', async () => {
    ddbMock.on(QueryCommand).resolves({ Items: [exerciseRecord] });

    const result = await listAllExercises();

    const calls = ddbMock.commandCalls(QueryCommand);
    expect(calls).toHaveLength(1);
    expect(calls[0].args[0].input.IndexName).toBe('GSI2');
    expect(calls[0].args[0].input.ExpressionAttributeValues).toMatchObject({
      ':entityType': 'Exercise',
    });
    expect(result).toHaveLength(1);
  });

  it('strips DynamoDB keys from returned items', async () => {
    ddbMock.on(QueryCommand).resolves({ Items: [exerciseRecord] });

    const [exercise] = await listAllExercises();

    expect((exercise as Record<string, unknown>)['PK']).toBeUndefined();
    expect((exercise as Record<string, unknown>)['SK']).toBeUndefined();
    expect((exercise as Record<string, unknown>)['EntityType']).toBeUndefined();
    expect((exercise as Record<string, unknown>)['Timestamp']).toBeUndefined();
    expect(exercise.exerciseId).toBe(EXERCISE_ID);
  });

  it('returns empty array when no exercises exist', async () => {
    ddbMock.on(QueryCommand).resolves({ Items: [] });

    const result = await listAllExercises();

    expect(result).toEqual([]);
  });

  it('handles undefined Items gracefully', async () => {
    ddbMock.on(QueryCommand).resolves({});

    const result = await listAllExercises();

    expect(result).toEqual([]);
  });
});

// ─── listExercisesByMuscleGroup ───────────────────────────────────────────────

describe('listExercisesByMuscleGroup', () => {
  it('queries base table by PK = ROUTINE#Chest without GSI', async () => {
    ddbMock.on(QueryCommand).resolves({ Items: [exerciseRecord] });

    const result = await listExercisesByMuscleGroup('Chest');

    const calls = ddbMock.commandCalls(QueryCommand);
    expect(calls[0].args[0].input.IndexName).toBeUndefined();
    expect(calls[0].args[0].input.ExpressionAttributeValues).toMatchObject({
      ':pk': 'ROUTINE#Chest',
      ':skPrefix': 'EXERCISE#',
    });
    expect(result).toHaveLength(1);
  });

  it('returns empty array when no exercises found for the group', async () => {
    ddbMock.on(QueryCommand).resolves({ Items: [] });

    const result = await listExercisesByMuscleGroup('Core');

    expect(result).toEqual([]);
  });
});

// ─── createExercise ───────────────────────────────────────────────────────────

describe('createExercise', () => {
  const validInput = {
    exerciseName: 'Bench Press',
    muscleGroup: 'Chest' as const,
    sets: 4,
    reps: 10,
    description: 'Classic chest compound movement',
    difficulty: 'Intermediate' as const,
  };

  it('puts an item with the correct PK/SK and returns domain object', async () => {
    ddbMock.on(PutCommand).resolves({});

    const result = await createExercise(validInput);

    const calls = ddbMock.commandCalls(PutCommand);
    expect(calls).toHaveLength(1);
    expect(calls[0].args[0].input.Item).toMatchObject({
      PK: 'ROUTINE#Chest',
      EntityType: 'Exercise',
      exerciseName: 'Bench Press',
      muscleGroup: 'Chest',
    });
    expect(calls[0].args[0].input.ConditionExpression).toBe('attribute_not_exists(PK)');

    // Domain object must not contain DynamoDB keys
    expect((result as Record<string, unknown>)['PK']).toBeUndefined();
    expect(result.exerciseId).toBeDefined();
    expect(result.muscleGroup).toBe('Chest');
  });

  it('throws ConflictError when item already exists', async () => {
    ddbMock
      .on(PutCommand)
      .rejects(new ConditionalCheckFailedException({ message: 'conflict', $metadata: {} }));

    await expect(createExercise(validInput)).rejects.toBeInstanceOf(ConflictError);
  });

  it('re-throws unexpected errors from DynamoDB', async () => {
    ddbMock.on(PutCommand).rejects(new Error('Network error'));

    await expect(createExercise(validInput)).rejects.toThrow('Network error');
  });
});

// ─── updateExercise ───────────────────────────────────────────────────────────

describe('updateExercise', () => {
  it('sends UpdateCommand with correct Key and ConditionExpression', async () => {
    ddbMock.on(UpdateCommand).resolves({});

    await updateExercise('Chest', EXERCISE_ID, { sets: 5 });

    const calls = ddbMock.commandCalls(UpdateCommand);
    expect(calls).toHaveLength(1);
    expect(calls[0].args[0].input.Key).toEqual({
      PK: 'ROUTINE#Chest',
      SK: `EXERCISE#${EXERCISE_ID}`,
    });
    expect(calls[0].args[0].input.ConditionExpression).toBe('attribute_exists(PK)');
  });

  it('returns a domain object with the updated fields', async () => {
    ddbMock.on(UpdateCommand).resolves({});

    const result = await updateExercise('Chest', EXERCISE_ID, { sets: 5, reps: 12 });

    expect(result.sets).toBe(5);
    expect(result.reps).toBe(12);
    expect(result.exerciseId).toBe(EXERCISE_ID);
    expect(result.muscleGroup).toBe('Chest');
  });

  it('throws NotFoundError when exercise does not exist', async () => {
    ddbMock
      .on(UpdateCommand)
      .rejects(new ConditionalCheckFailedException({ message: 'not found', $metadata: {} }));

    await expect(updateExercise('Chest', EXERCISE_ID, { sets: 5 })).rejects.toBeInstanceOf(
      NotFoundError
    );
  });

  it('re-throws unexpected errors from DynamoDB', async () => {
    ddbMock.on(UpdateCommand).rejects(new Error('Throttled'));

    await expect(updateExercise('Chest', EXERCISE_ID, { sets: 5 })).rejects.toThrow('Throttled');
  });
});

// ─── deleteExercise ───────────────────────────────────────────────────────────

describe('deleteExercise', () => {
  it('sends DeleteCommand with correct Key and ConditionExpression', async () => {
    ddbMock.on(DeleteCommand).resolves({});

    await deleteExercise('Chest', EXERCISE_ID);

    const calls = ddbMock.commandCalls(DeleteCommand);
    expect(calls).toHaveLength(1);
    expect(calls[0].args[0].input.Key).toEqual({
      PK: 'ROUTINE#Chest',
      SK: `EXERCISE#${EXERCISE_ID}`,
    });
    expect(calls[0].args[0].input.ConditionExpression).toBe('attribute_exists(PK)');
  });

  it('resolves successfully when exercise exists', async () => {
    ddbMock.on(DeleteCommand).resolves({});

    await expect(deleteExercise('Chest', EXERCISE_ID)).resolves.toBeUndefined();
  });

  it('throws NotFoundError when exercise does not exist', async () => {
    ddbMock
      .on(DeleteCommand)
      .rejects(new ConditionalCheckFailedException({ message: 'not found', $metadata: {} }));

    await expect(deleteExercise('Chest', EXERCISE_ID)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('re-throws unexpected errors from DynamoDB', async () => {
    ddbMock.on(DeleteCommand).rejects(new Error('Service unavailable'));

    await expect(deleteExercise('Chest', EXERCISE_ID)).rejects.toThrow('Service unavailable');
  });
});
