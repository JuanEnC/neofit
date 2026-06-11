/**
 * Users Repository
 *
 * Handles all DynamoDB read/write operations for user records.
 * Controllers never interact with DynamoDB directly — they always
 * go through this layer, keeping persistence details isolated.
 */

import { randomUUID } from 'crypto';
import {
  getItem,
  putItem,
  updateItem,
  deleteItem,
  queryItems,
  buildUpdateExpression,
} from '../../database/client';
import { userKeys } from '../../database/keys';
import {
  TABLE_NAME,
  INDEX_NAMES,
  type UserRecord,
  type User,
  type CreateUserInput,
  type MemberStatus,
} from '../../database/schema';
import { NotFoundError } from '../../shared/errors';
import type { UpdateUserInput as UpdateUserBody } from './schemas';

// ─── Query Helpers ────────────────────────────────────────────────────────────

/**
 * Strip DynamoDB keys from a UserRecord to return a clean domain object.
 */
function toUser({ PK: _pk, SK: _sk, EntityType: _et, Timestamp: _ts, ...user }: UserRecord): User {
  return user;
}

// ─── Public Repository Interface ──────────────────────────────────────────────

/**
 * Create a new user record.
 * Throws ConflictError if a user with the same email already exists.
 */
export async function createUser(input: CreateUserInput): Promise<User> {
  const userId = randomUUID();
  const now = new Date().toISOString();

  const record: UserRecord = {
    PK: userKeys.pk(userId),
    SK: 'METADATA',
    userId,
    email: input.email.toLowerCase().trim(),
    firstName: input.firstName,
    lastName: input.lastName,
    phone: input.phone,
    status: 'Active',
    role: input.role ?? 'Client',
    stripeCustomerId: input.stripeCustomerId ?? '',
    createdAt: now,
    updatedAt: now,
  };

  await putItem({
    TableName: TABLE_NAME,
    Item: record,
    // Prevent overwriting an existing user with the same PK
    ConditionExpression: 'attribute_not_exists(PK)',
  });

  return toUser(record);
}

/**
 * Retrieve a single user by their UUID.
 * Throws NotFoundError if the user does not exist.
 */
export async function getUserById(userId: string): Promise<User> {
  const record = await getItem<UserRecord>({
    TableName: TABLE_NAME,
    Key: userKeys.primary(userId),
  });

  if (!record) {
    throw new NotFoundError('User', userId);
  }

  return toUser(record);
}

/**
 * Retrieve a user by email using GSI1 (inverted index on SK).
 * Returns undefined if no matching user is found.
 */
export async function getUserByEmail(email: string): Promise<User | undefined> {
  // GSI1: PK = 'METADATA', filter by email attribute
  const records = await queryItems<UserRecord>({
    TableName: TABLE_NAME,
    IndexName: INDEX_NAMES.GSI1,
    KeyConditionExpression: '#sk = :sk',
    FilterExpression: '#email = :email',
    ExpressionAttributeNames: {
      '#sk': 'SK',
      '#email': 'email',
    },
    ExpressionAttributeValues: {
      ':sk': 'METADATA',
      ':email': email.toLowerCase().trim(),
    },
    Limit: 1,
  });

  return records[0] ? toUser(records[0]) : undefined;
}

/**
 * List all users with optional filtering and pagination.
 */
export async function listUsers(options: {
  limit?: number;
  lastKey?: string;
  status?: MemberStatus;
}): Promise<{ users: User[]; nextKey?: string }> {
  const { limit = 20, lastKey, status } = options;

  // Parse the cursor back from Base64
  const exclusiveStartKey = lastKey
    ? JSON.parse(Buffer.from(lastKey, 'base64').toString('utf8'))
    : undefined;

  const params = {
    TableName: TABLE_NAME,
    IndexName: INDEX_NAMES.GSI1,
    KeyConditionExpression: '#sk = :sk',
    ExpressionAttributeNames: { '#sk': 'SK' } as Record<string, string>,
    ExpressionAttributeValues: { ':sk': 'METADATA' } as Record<string, unknown>,
    Limit: limit,
    ...(exclusiveStartKey && { ExclusiveStartKey: exclusiveStartKey }),
  };

  // Optional status filter
  if (status) {
    params.KeyConditionExpression += ' AND #status = :status';
    params.ExpressionAttributeNames['#status'] = 'status';
    params.ExpressionAttributeValues[':status'] = status;
  }

  // Use raw DocumentClient for pagination cursor access
  const { QueryCommand } = await import('@aws-sdk/lib-dynamodb');
  const { dynamoDb } = await import('../../database/client.js');

  const result = await dynamoDb.send(new QueryCommand(params));

  const users = (result.Items ?? []).map((item) => toUser(item as UserRecord));
  const nextKey = result.LastEvaluatedKey
    ? Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString('base64')
    : undefined;

  return { users, nextKey };
}

/**
 * Search users by partial email or name match.
 * Uses a FilterExpression scan on the GSI1 METADATA partition.
 */
export async function searchUsers(query: string, limit = 10): Promise<User[]> {
  const term = query.toLowerCase().trim();

  const records = await queryItems<UserRecord>({
    TableName: TABLE_NAME,
    IndexName: INDEX_NAMES.GSI1,
    KeyConditionExpression: '#sk = :sk',
    FilterExpression: 'contains(#email, :q) OR contains(#firstName, :q) OR contains(#lastName, :q)',
    ExpressionAttributeNames: {
      '#sk': 'SK',
      '#email': 'email',
      '#firstName': 'firstName',
      '#lastName': 'lastName',
    },
    ExpressionAttributeValues: {
      ':sk': 'METADATA',
      ':q': term,
    },
    Limit: limit * 5, // Fetch extra to account for filter reducing result set
  });

  return records.slice(0, limit).map(toUser);
}

/**
 * Apply a partial update to an existing user.
 * Throws NotFoundError if the user does not exist.
 */
export async function updateUser(userId: string, input: UpdateUserBody): Promise<User> {
  // Verify the user exists before attempting update
  await getUserById(userId);

  const expression = buildUpdateExpression(input);

  await updateItem({
    TableName: TABLE_NAME,
    Key: userKeys.primary(userId),
    ...expression,
    ConditionExpression: 'attribute_exists(PK)',
  });

  return getUserById(userId);
}

/**
 * Change the membership status of a user.
 * Throws NotFoundError if the user does not exist.
 */
export async function updateUserStatus(userId: string, status: MemberStatus): Promise<User> {
  await getUserById(userId);

  const expression = buildUpdateExpression({ status });

  await updateItem({
    TableName: TABLE_NAME,
    Key: userKeys.primary(userId),
    ...expression,
    ConditionExpression: 'attribute_exists(PK)',
  });

  return getUserById(userId);
}

/**
 * Delete a user and all their associated payment records.
 * Throws NotFoundError if the user does not exist.
 */
export async function deleteUser(userId: string): Promise<void> {
  await getUserById(userId);

  await deleteItem({
    TableName: TABLE_NAME,
    Key: userKeys.primary(userId),
  });
}
