/**
 * Routines Lambda Handler
 *
 * Entry point for all /routines/* routes.
 *
 * Route mapping:
 *   GET    /routines                  → listRoutines     (JWT required)
 *   GET    /routines/group/{muscle}   → listRoutinesByGroup (JWT required)
 *   POST   /routines                  → createRoutine    (JWT + Admin)
 *   PUT    /routines/{muscle}/{id}    → updateRoutine    (JWT + Admin)
 *   DELETE /routines/{muscle}/{id}    → deleteRoutine    (JWT + Admin)
 */

import type { APIGatewayProxyEventV2WithJWTAuthorizer, APIGatewayProxyResultV2 } from 'aws-lambda';
import { setRequestId, logger } from '../../shared/logger';
import { ok, created, noContent, handleError } from '../../shared/response';
import * as controller from './controller';

export const handler = async (
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
  context: { awsRequestId: string }
): Promise<APIGatewayProxyResultV2> => {
  setRequestId(context.awsRequestId);

  const { routeKey } = event;

  logger.info('Routines request received', {
    routeKey,
    path: event.rawPath,
  });

  try {
    switch (routeKey) {
      case 'GET /routines': {
        const result = await controller.listRoutines(event);
        return ok(result);
      }

      case 'GET /routines/group/{muscle}': {
        const result = await controller.listRoutinesByGroup(event);
        return ok(result);
      }

      case 'POST /routines': {
        const exercise = await controller.createRoutine(event);
        return created(exercise);
      }

      case 'PUT /routines/{muscle}/{id}': {
        const exercise = await controller.updateRoutine(event);
        return ok(exercise);
      }

      case 'DELETE /routines/{muscle}/{id}': {
        await controller.deleteRoutine(event);
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
