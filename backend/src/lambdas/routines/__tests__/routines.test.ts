/**
 * Unit tests for the Routines Controller and Repository.
 *
 * Controller tests: repository calls are mocked with jest.mock so tests
 * run without any AWS dependency.
 *
 * Repository tests: DynamoDB SDK calls are intercepted with aws-sdk-client-mock.
 */

import type { APIGatewayProxyEventV2WithJWTAuthorizer } from 'aws-lambda';
import {
  listRoutines,
  listRoutinesByGroup,
  createRoutine,
  updateRoutine,
  deleteRoutine,
} from '../controller';
import * as repo from '../repository';
import { ForbiddenError, ValidationError } from '../../../shared/errors';
import type { Exercise } from '../repository';

// ─── Controller Mocks ─────────────────────────────────────────────────────────

jest.mock('../repository');

const mockRepo = repo as jest.Mocked<typeof repo>;

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const ADMIN_ID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
const CLIENT_ID = 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22';
const EXERCISE_ID = 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a33';

const sampleExercise: Exercise = {
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

function makeEvent(
  overrides: Partial<APIGatewayProxyEventV2WithJWTAuthorizer> = {},
  role: 'Admin' | 'Client' = 'Admin'
): APIGatewayProxyEventV2WithJWTAuthorizer {
  const sub = role === 'Admin' ? ADMIN_ID : CLIENT_ID;
  return {
    version: '2.0',
    routeKey: 'GET /routines',
    rawPath: '/routines',
    rawQueryString: '',
    headers: {},
    isBase64Encoded: false,
    requestContext: {
      accountId: '123456789012',
      apiId: 'test-api',
      domainName: 'test.execute-api.us-east-1.amazonaws.com',
      domainPrefix: 'test',
      http: {
        method: 'GET',
        path: '/routines',
        protocol: 'HTTP/1.1',
        sourceIp: '1.2.3.4',
        userAgent: 'jest',
      },
      requestId: 'test-request-id',
      routeKey: 'GET /routines',
      stage: '$default',
      time: '2026-01-01T00:00:00Z',
      timeEpoch: 0,
      authorizer: {
        jwt: {
          claims: {
            sub,
            email: `${role.toLowerCase()}@neofit.dev`,
            'cognito:groups': role,
          },
          scopes: [],
        },
        principalId: sub,
        integrationLatency: 0,
      },
    },
    body: undefined,
    pathParameters: undefined,
    queryStringParameters: undefined,
    stageVariables: undefined,
    ...overrides,
  } as unknown as APIGatewayProxyEventV2WithJWTAuthorizer;
}

// ─── listRoutines ─────────────────────────────────────────────────────────────

describe('listRoutines', () => {
  it('returns all exercises for an authenticated user', async () => {
    mockRepo.listAllExercises.mockResolvedValue([sampleExercise]);

    const result = await listRoutines(makeEvent({}, 'Client'));

    expect(result.exercises).toHaveLength(1);
    expect(result.count).toBe(1);
    expect(mockRepo.listAllExercises).toHaveBeenCalled();
  });

  it('returns empty list when no exercises exist', async () => {
    mockRepo.listAllExercises.mockResolvedValue([]);

    const result = await listRoutines(makeEvent({}, 'Client'));

    expect(result.exercises).toHaveLength(0);
    expect(result.count).toBe(0);
  });

  it('also works for Admin users', async () => {
    mockRepo.listAllExercises.mockResolvedValue([sampleExercise]);

    const result = await listRoutines(makeEvent());

    expect(result.exercises).toHaveLength(1);
  });
});

// ─── listRoutinesByGroup ──────────────────────────────────────────────────────

describe('listRoutinesByGroup', () => {
  it('returns exercises for a valid muscle group', async () => {
    mockRepo.listExercisesByMuscleGroup.mockResolvedValue([sampleExercise]);

    const event = makeEvent({ pathParameters: { muscle: 'Chest' } }, 'Client');
    const result = await listRoutinesByGroup(event);

    expect(result.exercises).toHaveLength(1);
    expect(result.muscleGroup).toBe('Chest');
    expect(mockRepo.listExercisesByMuscleGroup).toHaveBeenCalledWith('Chest');
  });

  it('returns empty list when no exercises found for the group', async () => {
    mockRepo.listExercisesByMuscleGroup.mockResolvedValue([]);

    const event = makeEvent({ pathParameters: { muscle: 'Core' } }, 'Client');
    const result = await listRoutinesByGroup(event);

    expect(result.count).toBe(0);
    expect(result.muscleGroup).toBe('Core');
  });

  it('throws ValidationError for an invalid muscle group', async () => {
    const event = makeEvent({ pathParameters: { muscle: 'Glutes' } }, 'Client');

    await expect(listRoutinesByGroup(event)).rejects.toBeInstanceOf(ValidationError);
  });

  it('throws ValidationError when muscle param is missing', async () => {
    const event = makeEvent({ pathParameters: {} }, 'Client');

    await expect(listRoutinesByGroup(event)).rejects.toBeInstanceOf(ValidationError);
  });
});

// ─── createRoutine ────────────────────────────────────────────────────────────

describe('createRoutine', () => {
  const validBody = JSON.stringify({
    exerciseName: 'Bench Press',
    muscleGroup: 'Chest',
    sets: 4,
    reps: 10,
    description: 'Classic chest compound movement',
    difficulty: 'Intermediate',
  });

  it('creates an exercise when Admin provides valid data', async () => {
    mockRepo.createExercise.mockResolvedValue(sampleExercise);

    const event = makeEvent({ body: validBody });
    const result = await createRoutine(event);

    expect(result.exerciseId).toBe(EXERCISE_ID);
    expect(mockRepo.createExercise).toHaveBeenCalledWith(
      expect.objectContaining({ muscleGroup: 'Chest', exerciseName: 'Bench Press' })
    );
  });

  it('throws ForbiddenError when a Client tries to create a routine', async () => {
    const event = makeEvent({ body: validBody }, 'Client');

    await expect(createRoutine(event)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('throws ValidationError for an invalid muscleGroup', async () => {
    const event = makeEvent({
      body: JSON.stringify({ ...JSON.parse(validBody), muscleGroup: 'Glutes' }),
    });

    await expect(createRoutine(event)).rejects.toBeInstanceOf(ValidationError);
  });

  it('throws ValidationError for an invalid difficulty', async () => {
    const event = makeEvent({
      body: JSON.stringify({ ...JSON.parse(validBody), difficulty: 'Expert' }),
    });

    await expect(createRoutine(event)).rejects.toBeInstanceOf(ValidationError);
  });

  it('throws ValidationError when body is empty', async () => {
    const event = makeEvent({ body: '{}' });

    await expect(createRoutine(event)).rejects.toBeInstanceOf(ValidationError);
  });

  it('throws ValidationError when body is not valid JSON', async () => {
    const event = makeEvent({ body: 'not-json' });

    await expect(createRoutine(event)).rejects.toBeInstanceOf(ValidationError);
  });
});

// ─── updateRoutine ────────────────────────────────────────────────────────────

describe('updateRoutine', () => {
  it('updates an exercise when Admin provides valid data', async () => {
    mockRepo.updateExercise.mockResolvedValue({ ...sampleExercise, sets: 5 });

    const event = makeEvent({
      pathParameters: { muscle: 'Chest', id: EXERCISE_ID },
      body: JSON.stringify({ sets: 5 }),
    });
    const result = await updateRoutine(event);

    expect(result.sets).toBe(5);
    expect(mockRepo.updateExercise).toHaveBeenCalledWith(
      'Chest',
      EXERCISE_ID,
      expect.objectContaining({ sets: 5 })
    );
  });

  it('throws ForbiddenError when a Client tries to update a routine', async () => {
    const event = makeEvent(
      {
        pathParameters: { muscle: 'Chest', id: EXERCISE_ID },
        body: JSON.stringify({ sets: 5 }),
      },
      'Client'
    );

    await expect(updateRoutine(event)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('throws ValidationError for an invalid muscle group in path', async () => {
    const event = makeEvent({
      pathParameters: { muscle: 'Glutes', id: EXERCISE_ID },
      body: JSON.stringify({ sets: 5 }),
    });

    await expect(updateRoutine(event)).rejects.toBeInstanceOf(ValidationError);
  });

  it('throws ValidationError for an invalid UUID in path', async () => {
    const event = makeEvent({
      pathParameters: { muscle: 'Chest', id: 'not-a-uuid' },
      body: JSON.stringify({ sets: 5 }),
    });

    await expect(updateRoutine(event)).rejects.toBeInstanceOf(ValidationError);
  });

  it('throws ValidationError when body is empty object', async () => {
    const event = makeEvent({
      pathParameters: { muscle: 'Chest', id: EXERCISE_ID },
      body: '{}',
    });

    await expect(updateRoutine(event)).rejects.toBeInstanceOf(ValidationError);
  });
});

// ─── deleteRoutine ────────────────────────────────────────────────────────────

describe('deleteRoutine', () => {
  it('deletes an exercise when Admin provides valid params', async () => {
    mockRepo.deleteExercise.mockResolvedValue(undefined);

    const event = makeEvent({
      pathParameters: { muscle: 'Chest', id: EXERCISE_ID },
    });
    await deleteRoutine(event);

    expect(mockRepo.deleteExercise).toHaveBeenCalledWith('Chest', EXERCISE_ID);
  });

  it('throws ForbiddenError when a Client tries to delete a routine', async () => {
    const event = makeEvent({ pathParameters: { muscle: 'Chest', id: EXERCISE_ID } }, 'Client');

    await expect(deleteRoutine(event)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('throws ValidationError for an invalid muscle group in path', async () => {
    const event = makeEvent({
      pathParameters: { muscle: 'Biceps', id: EXERCISE_ID },
    });

    await expect(deleteRoutine(event)).rejects.toBeInstanceOf(ValidationError);
  });

  it('throws ValidationError for an invalid UUID in path', async () => {
    const event = makeEvent({
      pathParameters: { muscle: 'Chest', id: 'bad-id' },
    });

    await expect(deleteRoutine(event)).rejects.toBeInstanceOf(ValidationError);
  });
});
