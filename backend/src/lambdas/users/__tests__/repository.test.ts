/**
 * Unit tests for the Users Repository.
 *
 * All DynamoDB SDK calls are intercepted with aws-sdk-client-mock
 * so tests run without any network or AWS account dependency.
 */

/// <reference types="jest" />

import { beforeEach } from '@jest/globals';

import {
  DynamoDBDocumentClient,
  GetCommand,
  UpdateCommand,
  DeleteCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';

import { mockClient } from 'aws-sdk-client-mock';

import {
  getUserById,
  getUserByEmail,
  updateUser,
  updateUserStatus,
  deleteUser,
} from '../repository';
import { NotFoundError } from '../../../shared/errors';
import type { UserRecord } from '../../../database/schema';

// ─── Mock Setup ───────────────────────────────────────────────────────────────

const ddbMock = mockClient(DynamoDBDocumentClient);

beforeEach(() => {
  ddbMock.reset();
});

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const USER_ID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';

const userRecord: UserRecord = {
  PK: `USER#a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11`,
  SK: 'METADATA',
  userId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
  email: 'test@neofit.dev',
  firstName: 'Juan',
  lastName: 'Lopez',
  phone: '+521234567890',
  status: 'Active',
  role: 'Client',
  stripeCustomerId: 'cus_test',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

// ─── getUserById ──────────────────────────────────────────────────────────────

describe('getUserById', () => {
  it('returns a User domain object when record exists', async () => {
    ddbMock.on(GetCommand).resolves({ Item: userRecord });

    const user = await getUserById(USER_ID);

    expect(user.userId).toBe(USER_ID);
    expect(user.email).toBe('test@neofit.dev');
    // Confirm DynamoDB keys are stripped from the returned object
    expect((user as Record<string, unknown>)['PK']).toBeUndefined();
    expect((user as Record<string, unknown>)['SK']).toBeUndefined();
  });

  it('throws NotFoundError when user does not exist', async () => {
    ddbMock.on(GetCommand).resolves({ Item: undefined });

    await expect(getUserById(USER_ID)).rejects.toBeInstanceOf(NotFoundError);
  });
});

// ─── getUserByEmail ───────────────────────────────────────────────────────────

describe('getUserByEmail', () => {
  it('returns the user when a match is found', async () => {
    ddbMock.on(QueryCommand).resolves({ Items: [userRecord] });

    const user = await getUserByEmail('test@neofit.dev');

    expect(user).toBeDefined();
    expect(user?.email).toBe('test@neofit.dev');
  });

  it('returns undefined when no match is found', async () => {
    ddbMock.on(QueryCommand).resolves({ Items: [] });

    const user = await getUserByEmail('nobody@neofit.dev');

    expect(user).toBeUndefined();
  });
});

// ─── updateUser ───────────────────────────────────────────────────────────────

describe('updateUser', () => {
  it('updates the record and returns the refreshed user', async () => {
    const updatedRecord = {
      ...userRecord,
      firstName: 'Carlos',
      updatedAt: '2026-06-01T00:00:00.000Z',
    };

    // First call: verify existence (getUserById inside updateUser)
    ddbMock.on(GetCommand).resolvesOnce({ Item: userRecord });
    ddbMock.on(UpdateCommand).resolves({});
    // Second call: refresh after update
    ddbMock.on(GetCommand).resolves({ Item: updatedRecord });

    const result = await updateUser(USER_ID, { firstName: 'Carlos' });

    expect(result.firstName).toBe('Carlos');
  });

  it('throws NotFoundError when the user does not exist', async () => {
    ddbMock.on(GetCommand).resolves({ Item: undefined });

    await expect(updateUser(USER_ID, { firstName: 'Carlos' })).rejects.toBeInstanceOf(
      NotFoundError
    );
  });
});

// ─── updateUserStatus ─────────────────────────────────────────────────────────

describe('updateUserStatus', () => {
  it('changes status and returns the updated user', async () => {
    const frozenRecord = { ...userRecord, status: 'Frozen' };

    ddbMock.on(GetCommand).resolvesOnce({ Item: userRecord });
    ddbMock.on(UpdateCommand).resolves({});
    ddbMock.on(GetCommand).resolves({ Item: frozenRecord });

    const result = await updateUserStatus(USER_ID, 'Frozen');

    expect(result.status).toBe('Frozen');
  });
});

// ─── deleteUser ───────────────────────────────────────────────────────────────

describe('deleteUser', () => {
  it('resolves successfully when user exists', async () => {
    ddbMock.on(GetCommand).resolves({ Item: userRecord });
    ddbMock.on(DeleteCommand).resolves({});

    await expect(deleteUser(USER_ID)).resolves.toBeUndefined();
  });

  it('throws NotFoundError when user does not exist', async () => {
    ddbMock.on(GetCommand).resolves({ Item: undefined });

    await expect(deleteUser(USER_ID)).rejects.toBeInstanceOf(NotFoundError);
  });
});
