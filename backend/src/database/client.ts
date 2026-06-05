/**
 * DynamoDB Client Wrapper
 *
 * Provides a single shared DocumentClient instance across all Lambda
 * handlers. Using the DocumentClient (lib-dynamodb) avoids manual
 * AttributeValue marshaling and produces cleaner, idiomatic TypeScript.
 *
 * Connection reuse: the module-level singleton is reused across warm
 * Lambda invocations, avoiding redundant TCP handshakes.
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  UpdateCommand,
  DeleteCommand,
  QueryCommand,
  type GetCommandInput,
  type PutCommandInput,
  type UpdateCommandInput,
  type DeleteCommandInput,
  type QueryCommandInput,
} from '@aws-sdk/lib-dynamodb';

// ─── Client Configuration ─────────────────────────────────────────────────────

const clientConfig = {
  region: process.env.AWS_REGION ?? 'us-east-1',
  // Override endpoint for local development with dynamodb-local
  ...(process.env.DYNAMODB_ENDPOINT && {
    endpoint: process.env.DYNAMODB_ENDPOINT,
  }),
};

const rawClient = new DynamoDBClient(clientConfig);

/**
 * DocumentClient translates native JavaScript types ↔ DynamoDB AttributeValues.
 * marshallOptions.removeUndefinedValues prevents errors when optional fields
 * are undefined in update/put operations.
 */
export const dynamoDb = DynamoDBDocumentClient.from(rawClient, {
  marshallOptions: {
    removeUndefinedValues: true,
    convertEmptyValues: false,
  },
  unmarshallOptions: {
    wrapNumbers: false,
  },
});

// ─── Generic Helpers ──────────────────────────────────────────────────────────

/**
 * Fetch a single item by its primary key.
 * Returns undefined when the item does not exist.
 */
export async function getItem<T>(params: GetCommandInput): Promise<T | undefined> {
  const { Item } = await dynamoDb.send(new GetCommand(params));
  return Item as T | undefined;
}

/**
 * Write an item. Overwrites an existing item with the same key.
 */
export async function putItem(params: PutCommandInput): Promise<void> {
  await dynamoDb.send(new PutCommand(params));
}

/**
 * Apply a partial update to an existing item.
 * Returns the updated attributes.
 */
export async function updateItem(params: UpdateCommandInput): Promise<void> {
  await dynamoDb.send(new UpdateCommand(params));
}

/**
 * Delete an item by its primary key.
 */
export async function deleteItem(params: DeleteCommandInput): Promise<void> {
  await dynamoDb.send(new DeleteCommand(params));
}

/**
 * Query items using a key condition expression.
 * Automatically follows LastEvaluatedKey for paginated results.
 *
 * @param params  Standard QueryCommand input
 * @param limit   Max items to return across all pages (undefined = all)
 */
export async function queryItems<T>(params: QueryCommandInput, limit?: number): Promise<T[]> {
  const results: T[] = [];
  let lastKey: Record<string, unknown> | undefined;

  do {
    const input: QueryCommandInput = {
      ...params,
      ...(lastKey && { ExclusiveStartKey: lastKey }),
      // Per-request limit: fetch in pages of up to 100 to keep latency low
      ...(limit !== undefined && { Limit: Math.min(limit - results.length, 100) }),
    };

    const { Items = [], LastEvaluatedKey } = await dynamoDb.send(new QueryCommand(input));

    results.push(...(Items as T[]));
    lastKey = LastEvaluatedKey as Record<string, unknown> | undefined;

    if (limit !== undefined && results.length >= limit) break;
  } while (lastKey);

  return results.slice(0, limit);
}

// ─── Update Expression Builder ────────────────────────────────────────────────

/**
 * Builds a DynamoDB UpdateExpression and its supporting maps from a
 * plain object of field → value pairs. Only non-undefined values are included.
 *
 * @example
 *   buildUpdateExpression({ firstName: 'Juan', phone: undefined })
 *   // {
 *   //   UpdateExpression: 'SET #firstName = :firstName, #updatedAt = :updatedAt',
 *   //   ExpressionAttributeNames:  { '#firstName': 'firstName', '#updatedAt': 'updatedAt' },
 *   //   ExpressionAttributeValues: { ':firstName': 'Juan', ':updatedAt': '2026-...' },
 *   // }
 */
export function buildUpdateExpression(fields: Record<string, unknown>): {
  UpdateExpression: string;
  ExpressionAttributeNames: Record<string, string>;
  ExpressionAttributeValues: Record<string, unknown>;
} {
  const names: Record<string, string> = {};
  const values: Record<string, unknown> = {};
  const setParts: string[] = [];

  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) continue;
    names[`#${key}`] = key;
    values[`:${key}`] = value;
    setParts.push(`#${key} = :${key}`);
  }

  // Always stamp updatedAt on every write
  names['#updatedAt'] = 'updatedAt';
  values[':updatedAt'] = new Date().toISOString();
  setParts.push('#updatedAt = :updatedAt');

  return {
    UpdateExpression: `SET ${setParts.join(', ')}`,
    ExpressionAttributeNames: names,
    ExpressionAttributeValues: values,
  };
}
