/**
 * Users Controller
 *
 * Orchestrates validation, authorization, and repository calls.
 * Each method maps to one API endpoint. The handler delegates here
 * after routing; the controller never constructs HTTP responses directly.
 */

import type { APIGatewayProxyEventV2WithJWTAuthorizer } from 'aws-lambda';
import { ZodError } from 'zod';
import { getCallerIdentity, requireAdmin, requireSelfOrAdmin } from '../../shared/auth';
import { ValidationError } from '../../shared/errors';
import { logger } from '../../shared/logger';
import {
  listUsersQuerySchema,
  searchUsersQuerySchema,
  updateUserSchema,
  updateStatusSchema,
  userIdParamSchema,
} from './schemas';
import * as repo from './repository';
import type { User } from '../../database/schema';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Wrap Zod parse errors so the handler catches them as ValidationError
 * and returns 400, not a generic 500.
 */
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

// ─── Endpoint Controllers ─────────────────────────────────────────────────────

/**
 * GET /users
 * Lists all users with optional status filter and cursor-based pagination.
 * Admin only.
 */
export async function listUsers(
  event: APIGatewayProxyEventV2WithJWTAuthorizer
): Promise<{ users: User[]; nextKey?: string }> {
  const caller = getCallerIdentity(event);
  requireAdmin(caller);

  const query = parseOrThrow(listUsersQuerySchema, event.queryStringParameters ?? {});

  logger.info('Listing users', { requestedBy: caller.sub, query });

  return repo.listUsers({
    limit: query.limit,
    lastKey: query.lastKey,
    status: query.status,
  });
}

/**
 * GET /users/search?q=term
 * Full-text search on email, firstName, lastName.
 * Admin only.
 */
export async function searchUsers(event: APIGatewayProxyEventV2WithJWTAuthorizer): Promise<User[]> {
  const caller = getCallerIdentity(event);
  requireAdmin(caller);

  const query = parseOrThrow(searchUsersQuerySchema, event.queryStringParameters ?? {});

  logger.info('Searching users', { requestedBy: caller.sub, term: query.q });

  return repo.searchUsers(query.q, query.limit);
}

/**
 * GET /users/{id}
 * Returns a single user profile.
 * Clients may only read their own profile; Admins may read any.
 */
export async function getUser(event: APIGatewayProxyEventV2WithJWTAuthorizer): Promise<User> {
  const caller = getCallerIdentity(event);
  const { id } = parseOrThrow(userIdParamSchema, event.pathParameters ?? {});

  requireSelfOrAdmin(caller, id);

  logger.info('Getting user', { requestedBy: caller.sub, userId: id });

  return repo.getUserById(id);
}

/**
 * PUT /users/{id}
 * Updates firstName, lastName, and/or phone.
 * Clients may only update their own profile; Admins may update any.
 */
export async function updateUser(event: APIGatewayProxyEventV2WithJWTAuthorizer): Promise<User> {
  const caller = getCallerIdentity(event);
  const { id } = parseOrThrow(userIdParamSchema, event.pathParameters ?? {});

  requireSelfOrAdmin(caller, id);

  const body = parseOrThrow(updateUserSchema, parseBody(event));

  logger.info('Updating user', { requestedBy: caller.sub, userId: id, fields: Object.keys(body) });

  return repo.updateUser(id, body);
}

/**
 * PATCH /users/{id}/status
 * Changes membership status to Active, Inactive, or Frozen.
 * Admin only.
 */
export async function updateUserStatus(
  event: APIGatewayProxyEventV2WithJWTAuthorizer
): Promise<User> {
  const caller = getCallerIdentity(event);
  requireAdmin(caller);

  const { id } = parseOrThrow(userIdParamSchema, event.pathParameters ?? {});
  const body = parseOrThrow(updateStatusSchema, parseBody(event));

  logger.info('Updating user status', {
    requestedBy: caller.sub,
    userId: id,
    newStatus: body.status,
  });

  return repo.updateUserStatus(id, body.status);
}

/**
 * DELETE /users/{id}
 * Hard-deletes the user record.
 * Admin only.
 */
export async function deleteUser(event: APIGatewayProxyEventV2WithJWTAuthorizer): Promise<void> {
  const caller = getCallerIdentity(event);
  requireAdmin(caller);

  const { id } = parseOrThrow(userIdParamSchema, event.pathParameters ?? {});

  logger.info('Deleting user', { requestedBy: caller.sub, userId: id });

  await repo.deleteUser(id);
}
