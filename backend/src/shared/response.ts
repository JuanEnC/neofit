/**
 * HTTP response factories for API Gateway HTTP API (v2).
 *
 * Centralizing response construction keeps status codes and headers
 * consistent across all Lambda handlers.
 */

import type { APIGatewayProxyResultV2 } from 'aws-lambda';
import { isAppError } from './errors';
import { logger } from './logger';

const JSON_HEADERS = {
  'Content-Type': 'application/json',
};

/** Successful response with a data payload */
export function ok<T>(data: T): APIGatewayProxyResultV2 {
  return {
    statusCode: 200,
    headers: JSON_HEADERS,
    body: JSON.stringify({ data }),
  };
}

/** 201 Created — used after inserting a new resource */
export function created<T>(data: T): APIGatewayProxyResultV2 {
  return {
    statusCode: 201,
    headers: JSON_HEADERS,
    body: JSON.stringify({ data }),
  };
}

/** 204 No Content — used for DELETE or status-change operations */
export function noContent(): APIGatewayProxyResultV2 {
  return { statusCode: 204, headers: JSON_HEADERS, body: '' };
}

/** Generic error response */
export function errorResponse(
  statusCode: number,
  code: string,
  message: string,
  details?: unknown
): APIGatewayProxyResultV2 {
  return {
    statusCode,
    headers: JSON_HEADERS,
    body: JSON.stringify({
      error: { code, message, ...(details !== undefined ? { details } : {}) },
    }),
  };
}

/**
 * Convert any caught error into an API Gateway response.
 * AppError subclasses map to their defined status codes;
 * all other errors produce a generic 500.
 */
export function handleError(error: unknown): APIGatewayProxyResultV2 {
  if (isAppError(error)) {
    logger.warn('Request error', {
      code: error.code,
      message: error.message,
      statusCode: error.statusCode,
    });

    return errorResponse(error.statusCode, error.code, error.message);
  }

  // Unexpected error — log full stack for debugging
  logger.error('Unhandled exception', {
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  });

  return errorResponse(500, 'INTERNAL_ERROR', 'An unexpected error occurred');
}
