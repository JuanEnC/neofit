/**
 * Payments Controller
 *
 * Orchestrates validation, authorization, Stripe operations, and
 * DynamoDB persistence. The handler delegates routing here; this
 * layer never constructs HTTP responses directly.
 */

import type { APIGatewayProxyEventV2WithJWTAuthorizer } from 'aws-lambda';
import { ZodError } from 'zod';
import { getCallerIdentity, requireAdmin, requireSelfOrAdmin } from '../../shared/auth';
import { ValidationError } from '../../shared/errors';
import { logger } from '../../shared/logger';
import { createPaymentIntentSchema, manualRenewalSchema, userIdParamSchema } from './schemas';
import * as repo from './repository';
import * as stripe from './stripe';
import type { Payment } from '../../database/schema';

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

function addDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

// ─── Endpoint Controllers ─────────────────────────────────────────────────────

/**
 * POST /payments/intent
 * Creates a Stripe PaymentIntent and returns clientSecret to the frontend.
 * The client completes the payment using Stripe Elements.
 * Authenticated users only — clients may only create intents for themselves.
 */
export async function createIntent(
  event: APIGatewayProxyEventV2WithJWTAuthorizer
): Promise<{ clientSecret: string; paymentIntentId: string }> {
  const caller = getCallerIdentity(event);
  const body = parseOrThrow(createPaymentIntentSchema, parseBody(event));

  requireSelfOrAdmin(caller, body.userId);

  logger.info('Creating payment intent', {
    requestedBy: caller.sub,
    userId: body.userId,
    amount: body.amount,
  });

  const result = await stripe.createPaymentIntent(body.amount, body.currency);

  return result;
}

/**
 * POST /payments/webhook
 * Handles Stripe webhook events. This route is NOT JWT-protected —
 * it uses Stripe's signature verification instead.
 *
 * Supported events:
 *   payment_intent.succeeded  → create DynamoDB payment record
 *   payment_intent.payment_failed → log and ignore (no record created)
 */
export async function handleWebhook(
  rawBody: string,
  signature: string
): Promise<{ received: boolean }> {
  const event = await stripe.constructWebhookEvent(rawBody, signature);

  logger.info('Stripe webhook received', { type: event.type, id: event.id });

  if (event.type === 'payment_intent.succeeded') {
    const intent = event.data.object as {
      id: string;
      amount: number;
      currency: string;
      metadata?: { userId?: string };
    };

    const userId = intent.metadata?.userId;
    if (!userId) {
      logger.warn('Webhook missing userId in metadata', { intentId: intent.id });
      return { received: true };
    }

    await repo.createPayment({
      userId,
      amount: intent.amount,
      currency: 'MXN',
      stripePaymentIntentId: intent.id,
      nextBillingDate: addDays(30),
    });

    logger.info('Payment record created from webhook', {
      intentId: intent.id,
      userId,
    });
  }

  if (event.type === 'payment_intent.payment_failed') {
    const intent = event.data.object as { id: string };
    logger.warn('Payment failed', { intentId: intent.id });
  }

  return { received: true };
}

/**
 * GET /payments/history/{userId}
 * Returns paginated payment history for a user.
 * Clients may only view their own history; Admins may view any.
 */
export async function getHistory(
  event: APIGatewayProxyEventV2WithJWTAuthorizer
): Promise<{ payments: Payment[]; nextKey?: string }> {
  const caller = getCallerIdentity(event);
  const { userId } = parseOrThrow(userIdParamSchema, event.pathParameters ?? {});

  requireSelfOrAdmin(caller, userId);

  logger.info('Getting payment history', { requestedBy: caller.sub, userId });

  return repo.getPaymentsByUser(userId);
}

/**
 * POST /payments/renewal/{userId}
 * Registers a manual cash/POS payment by an admin operator.
 * Creates a payment record with status Completed and advances nextBillingDate.
 * Admin only.
 */
export async function registerRenewal(
  event: APIGatewayProxyEventV2WithJWTAuthorizer
): Promise<Payment> {
  const caller = getCallerIdentity(event);
  requireAdmin(caller);

  const { userId } = parseOrThrow(userIdParamSchema, event.pathParameters ?? {});
  const body = parseOrThrow(manualRenewalSchema, parseBody(event));

  logger.info('Registering manual renewal', {
    requestedBy: caller.sub,
    userId,
    amount: body.amount,
  });

  const payment = await repo.createPayment({
    userId,
    amount: body.amount,
    currency: 'MXN',
    stripePaymentIntentId: `manual_${Date.now()}`,
    nextBillingDate: addDays(30),
  });

  return payment;
}
