/**
 * Payments Lambda Handler
 *
 * Entry point for all /payments/* routes.
 *
 * Route mapping:
 *   POST  /payments/intent            → createIntent  (JWT required)
 *   POST  /payments/webhook           → handleWebhook (Stripe signature — no JWT)
 *   GET   /payments/history/{userId}  → getHistory    (JWT required)
 *   POST  /payments/renewal/{userId}  → registerRenewal (JWT + Admin)
 *
 * The webhook route does not use JWT authorization — Stripe sends
 * unsigned requests from its own servers. Security is provided by the
 * Stripe-Signature header verified via webhook secret in SSM.
 */

import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyEventV2WithJWTAuthorizer,
  APIGatewayProxyResultV2,
} from 'aws-lambda';
import { setRequestId, logger } from '../../shared/logger';
import { ok, created, handleError } from '../../shared/response';
import { ValidationError } from '../../shared/errors';
import * as controller from './controller';

export const handler = async (
  event: APIGatewayProxyEventV2WithJWTAuthorizer | APIGatewayProxyEventV2,
  context: { awsRequestId: string }
): Promise<APIGatewayProxyResultV2> => {
  setRequestId(context.awsRequestId);

  const { routeKey } = event;

  logger.info('Payments request received', {
    routeKey,
    path: event.rawPath,
  });

  try {
    switch (routeKey) {
      case 'POST /payments/intent': {
        const result = await controller.createIntent(
          event as APIGatewayProxyEventV2WithJWTAuthorizer
        );
        return created(result);
      }

      case 'POST /payments/webhook': {
        const rawBody = event.body ?? '';
        const signature = event.headers?.['stripe-signature'] ?? '';

        if (!signature) {
          throw new ValidationError('Missing Stripe-Signature header');
        }

        // Body may be base64-encoded by API Gateway
        const decodedBody = event.isBase64Encoded
          ? Buffer.from(rawBody, 'base64').toString('utf8')
          : rawBody;

        const result = await controller.handleWebhook(decodedBody, signature);
        return ok(result);
      }

      case 'GET /payments/history/{userId}': {
        const result = await controller.getHistory(
          event as APIGatewayProxyEventV2WithJWTAuthorizer
        );
        return ok(result);
      }

      case 'POST /payments/renewal/{userId}': {
        const payment = await controller.registerRenewal(
          event as APIGatewayProxyEventV2WithJWTAuthorizer
        );
        return created(payment);
      }

      default:
        logger.warn('Unmatched route', { routeKey });
        return {
          statusCode: 404,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: { code: 'NOT_FOUND', message: 'Route not found' } }),
        };
    }
  } catch (error) {
    return handleError(error);
  }
};
