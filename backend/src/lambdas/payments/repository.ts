/**
 * Payments Repository
 *
 * Handles all DynamoDB read/write for payment records.
 * Payment records share the user partition (PK: USER#<userId>)
 * with sort keys PAYMENT#<paymentId>, enabling efficient per-user
 * history queries without a GSI.
 */

import { randomUUID } from 'crypto';
import { putItem, queryItems } from '../../database/client';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { dynamoDb } from '../../database/client';
import { paymentKeys } from '../../database/keys';
import { TABLE_NAME, INDEX_NAMES, type PaymentRecord, type Payment } from '../../database/schema';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toPayment({
  PK: _pk,
  SK: _sk,
  EntityType: _et,
  Timestamp: _ts,
  ...payment
}: PaymentRecord): Payment {
  return payment;
}

// ─── Public Repository Interface ──────────────────────────────────────────────

/**
 * Persist a new completed payment record.
 * Called after Stripe confirms payment_intent.succeeded.
 */
export async function createPayment(input: {
  userId: string;
  amount: number;
  currency: 'MXN';
  stripePaymentIntentId: string;
  nextBillingDate: string;
}): Promise<Payment> {
  const paymentId = randomUUID();
  const now = new Date().toISOString();

  const record: PaymentRecord = {
    PK: paymentKeys.pk(input.userId),
    SK: paymentKeys.sk(paymentId),
    EntityType: 'PAYMENT',
    Timestamp: now, // GSI2 sort key for chronological queries
    paymentId,
    userId: input.userId,
    amount: input.amount,
    currency: input.currency,
    paymentDate: now,
    nextBillingDate: input.nextBillingDate,
    stripePaymentIntentId: input.stripePaymentIntentId,
    status: 'Completed',
  };

  await putItem({ TableName: TABLE_NAME, Item: record });

  return toPayment(record);
}

/**
 * Fetch all payment records for a given user, sorted by date descending.
 * Uses the primary key (PK = USER#<userId>, SK begins_with PAYMENT#).
 */
export async function getPaymentsByUser(
  userId: string,
  limit = 12
): Promise<{ payments: Payment[]; nextKey?: string }> {
  const result = await (dynamoDb as DynamoDBDocumentClient).send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: '#pk = :pk AND begins_with(#sk, :skPrefix)',
      ExpressionAttributeNames: { '#pk': 'PK', '#sk': 'SK' },
      ExpressionAttributeValues: {
        ':pk': paymentKeys.pk(userId),
        ':skPrefix': 'PAYMENT#',
      },
      ScanIndexForward: false, // Descending order — most recent first
      Limit: limit,
    })
  );

  const payments = (result.Items ?? []).map((item) => toPayment(item as PaymentRecord));
  const nextKey = result.LastEvaluatedKey
    ? Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString('base64')
    : undefined;

  return { payments, nextKey };
}

/**
 * Fetch all payments chronologically using GSI2.
 * Used by the admin dashboard to build monthly revenue charts.
 */
export async function getPaymentsChronological(options: {
  fromDate: string;
  toDate: string;
  limit?: number;
}): Promise<Payment[]> {
  const records = await queryItems<PaymentRecord>({
    TableName: TABLE_NAME,
    IndexName: INDEX_NAMES.GSI2,
    KeyConditionExpression: '#entityType = :entityType AND #ts BETWEEN :from AND :to',
    ExpressionAttributeNames: {
      '#entityType': 'EntityType',
      '#ts': 'Timestamp',
    },
    ExpressionAttributeValues: {
      ':entityType': 'PAYMENT',
      ':from': options.fromDate,
      ':to': options.toDate,
    },
  });

  return records.map(toPayment).slice(0, options.limit);
}
