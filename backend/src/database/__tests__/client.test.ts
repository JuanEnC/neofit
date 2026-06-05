/**
 * Unit tests for the DynamoDB client wrapper.
 *
 * All AWS SDK calls are mocked with jest.mock — no network or
 * real DynamoDB table is required.
 */

import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import {
  GetCommand,
  PutCommand,
  UpdateCommand,
  DeleteCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';

import {
  getItem,
  putItem,
  updateItem,
  deleteItem,
  queryItems,
  buildUpdateExpression,
} from '../client';

// ─── Mock Setup ───────────────────────────────────────────────────────────────

const ddbMock = mockClient(DynamoDBDocumentClient);

beforeEach(() => {
  ddbMock.reset();
});

// ─── getItem ──────────────────────────────────────────────────────────────────

describe('getItem', () => {
  it('returns the item when it exists', async () => {
    const mockUser = { PK: 'USER#abc', SK: 'METADATA', email: 'test@example.com' };
    ddbMock.on(GetCommand).resolves({ Item: mockUser });

    const result = await getItem({
      TableName: 'NeoFit_MasterTable_dev',
      Key: { PK: 'USER#abc', SK: 'METADATA' },
    });

    expect(result).toEqual(mockUser);
  });

  it('returns undefined when the item does not exist', async () => {
    ddbMock.on(GetCommand).resolves({ Item: undefined });

    const result = await getItem({
      TableName: 'NeoFit_MasterTable_dev',
      Key: { PK: 'USER#missing', SK: 'METADATA' },
    });

    expect(result).toBeUndefined();
  });
});

// ─── putItem ──────────────────────────────────────────────────────────────────

describe('putItem', () => {
  it('resolves without throwing on success', async () => {
    ddbMock.on(PutCommand).resolves({});

    await expect(
      putItem({ TableName: 'NeoFit_MasterTable_dev', Item: { PK: 'USER#abc', SK: 'METADATA' } })
    ).resolves.toBeUndefined();
  });
});

// ─── updateItem ───────────────────────────────────────────────────────────────

describe('updateItem', () => {
  it('resolves without throwing on success', async () => {
    ddbMock.on(UpdateCommand).resolves({});

    await expect(
      updateItem({
        TableName: 'NeoFit_MasterTable_dev',
        Key: { PK: 'USER#abc', SK: 'METADATA' },
        UpdateExpression: 'SET #name = :name',
        ExpressionAttributeNames: { '#name': 'firstName' },
        ExpressionAttributeValues: { ':name': 'Juan' },
      })
    ).resolves.toBeUndefined();
  });
});

// ─── deleteItem ───────────────────────────────────────────────────────────────

describe('deleteItem', () => {
  it('resolves without throwing on success', async () => {
    ddbMock.on(DeleteCommand).resolves({});

    await expect(
      deleteItem({ TableName: 'NeoFit_MasterTable_dev', Key: { PK: 'USER#abc', SK: 'METADATA' } })
    ).resolves.toBeUndefined();
  });
});

// ─── queryItems ───────────────────────────────────────────────────────────────

describe('queryItems', () => {
  it('returns all items from a single page', async () => {
    const items = [
      { PK: 'USER#1', SK: 'METADATA' },
      { PK: 'USER#2', SK: 'METADATA' },
    ];
    ddbMock.on(QueryCommand).resolves({ Items: items });

    const result = await queryItems({
      TableName: 'NeoFit_MasterTable_dev',
      KeyConditionExpression: 'PK = :pk',
      ExpressionAttributeValues: { ':pk': 'USER#1' },
    });

    expect(result).toEqual(items);
  });

  it('follows LastEvaluatedKey to fetch subsequent pages', async () => {
    const page1 = [{ PK: 'USER#1', SK: 'METADATA' }];
    const page2 = [{ PK: 'USER#2', SK: 'METADATA' }];

    ddbMock
      .on(QueryCommand)
      .resolvesOnce({ Items: page1, LastEvaluatedKey: { PK: 'USER#1' } })
      .resolvesOnce({ Items: page2, LastEvaluatedKey: undefined });

    const result = await queryItems({
      TableName: 'NeoFit_MasterTable_dev',
      KeyConditionExpression: 'PK = :pk',
      ExpressionAttributeValues: { ':pk': 'USER#1' },
    });

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual(page1[0]);
    expect(result[1]).toEqual(page2[0]);
  });

  it('respects the limit parameter', async () => {
    const items = [{ PK: 'USER#1' }, { PK: 'USER#2' }, { PK: 'USER#3' }];
    ddbMock.on(QueryCommand).resolves({ Items: items });

    const result = await queryItems(
      {
        TableName: 'NeoFit_MasterTable_dev',
        KeyConditionExpression: 'PK = :pk',
        ExpressionAttributeValues: { ':pk': 'USER#1' },
      },
      2
    );

    expect(result).toHaveLength(2);
  });

  it('returns empty array when no items match', async () => {
    ddbMock.on(QueryCommand).resolves({ Items: [] });

    const result = await queryItems({
      TableName: 'NeoFit_MasterTable_dev',
      KeyConditionExpression: 'PK = :pk',
      ExpressionAttributeValues: { ':pk': 'USER#none' },
    });

    expect(result).toEqual([]);
  });
});

// ─── buildUpdateExpression ────────────────────────────────────────────────────

describe('buildUpdateExpression', () => {
  it('builds a valid SET expression from provided fields', () => {
    const result = buildUpdateExpression({ firstName: 'Juan', phone: '+521234567890' });

    expect(result.UpdateExpression).toContain('SET');
    expect(result.UpdateExpression).toContain('#firstName = :firstName');
    expect(result.UpdateExpression).toContain('#phone = :phone');
    expect(result.UpdateExpression).toContain('#updatedAt = :updatedAt');

    expect(result.ExpressionAttributeNames['#firstName']).toBe('firstName');
    expect(result.ExpressionAttributeValues[':firstName']).toBe('Juan');
  });

  it('skips undefined values', () => {
    const result = buildUpdateExpression({ firstName: 'Juan', phone: undefined });

    expect(result.UpdateExpression).not.toContain('#phone');
    expect(result.ExpressionAttributeNames['#phone']).toBeUndefined();
  });

  it('always stamps updatedAt', () => {
    const result = buildUpdateExpression({ firstName: 'Juan' });

    expect(result.ExpressionAttributeNames['#updatedAt']).toBe('updatedAt');
    expect(result.ExpressionAttributeValues[':updatedAt']).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('returns empty SET with only updatedAt when all fields are undefined', () => {
    const result = buildUpdateExpression({ phone: undefined });

    expect(result.UpdateExpression).toBe('SET #updatedAt = :updatedAt');
  });
});
