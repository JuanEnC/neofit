/**
 * Authentication / authorization helpers for Lambda handlers.
 *
 * API Gateway HTTP API (v2) with a JWT authorizer populates
 * `event.requestContext.authorizer.jwt.claims` with the decoded
 * token payload from Amazon Cognito.
 */

import type { APIGatewayProxyEventV2WithJWTAuthorizer } from 'aws-lambda';
import { ForbiddenError, UnauthorizedError } from './errors';

export interface CallerIdentity {
  sub: string; // Cognito user ID (UUID)
  email: string;
  role: 'Client' | 'Admin';
}

/**
 * Extract the caller's identity from JWT claims injected by API Gateway.
 * Throws UnauthorizedError if claims are absent or malformed.
 */
export function getCallerIdentity(event: APIGatewayProxyEventV2WithJWTAuthorizer): CallerIdentity {
  const claims = event.requestContext.authorizer?.jwt?.claims;

  if (!claims || !claims['sub']) {
    throw new UnauthorizedError();
  }

  // Cognito groups are stored as a comma-separated string in custom claims
  const groups: string = (claims['cognito:groups'] as string) ?? '';
  const role = groups.includes('Admin') ? 'Admin' : 'Client';

  return {
    sub: claims['sub'] as string,
    email: (claims['email'] as string) ?? '',
    role,
  };
}

/**
 * Assert that the caller has the Admin role.
 * Throws ForbiddenError otherwise.
 */
export function requireAdmin(caller: CallerIdentity): void {
  if (caller.role !== 'Admin') {
    throw new ForbiddenError();
  }
}

/**
 * Assert that the caller is either an Admin or the resource owner.
 * Throws ForbiddenError otherwise.
 */
export function requireSelfOrAdmin(caller: CallerIdentity, resourceUserId: string): void {
  if (caller.role !== 'Admin' && caller.sub !== resourceUserId) {
    throw new ForbiddenError();
  }
}
