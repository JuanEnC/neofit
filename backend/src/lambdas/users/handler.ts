/**
 * Users Lambda Handler
 *
 * Entry point for all /users/* routes. Routes each request to the
 * appropriate controller method based on routeKey, then serializes
 * the result into an API Gateway HTTP response.
 *
 * Route mapping:
 *   GET    /users              → listUsers
 *   GET    /users/search       → searchUsers
 *   GET    /users/{id}         → getUser
 *   PUT    /users/{id}         → updateUser
 *   PATCH  /users/{id}/status  → updateUserStatus
 *   DELETE /users/{id}         → deleteUser
 */

import type { APIGatewayProxyEventV2WithJWTAuthorizer, APIGatewayProxyResultV2 } from 'aws-lambda';
import { setRequestId, logger } from '../../shared/logger';
import { ok, noContent, handleError } from '../../shared/response';
import * as controller from './controller';

export const handler = async (
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
  context: { awsRequestId: string }
): Promise<APIGatewayProxyResultV2> => {
  // Stamp every log line in this invocation with the Lambda request ID
  setRequestId(context.awsRequestId);

  const { routeKey } = event;

  logger.info('Users request received', {
    routeKey,
    path: event.rawPath,
    method: event.requestContext.http.method,
  });

  try {
    switch (routeKey) {
      case 'GET /users': {
        const result = await controller.listUsers(event);
        return ok(result);
      }

      case 'GET /users/search': {
        const users = await controller.searchUsers(event);
        return ok(users);
      }

      case 'GET /users/{id}': {
        const user = await controller.getUser(event);
        return ok(user);
      }

      case 'PUT /users/{id}': {
        const user = await controller.updateUser(event);
        return ok(user);
      }

      case 'PATCH /users/{id}/status': {
        const user = await controller.updateUserStatus(event);
        return ok(user);
      }

      case 'DELETE /users/{id}': {
        await controller.deleteUser(event);
        return noContent();
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
