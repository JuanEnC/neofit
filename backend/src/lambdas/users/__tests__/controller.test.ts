/**
 * Unit tests for the Users Controller.
 *
 * The controller is tested in isolation — repository functions are
 * mocked so tests run without network or AWS dependencies.
 */

import type { APIGatewayProxyEventV2WithJWTAuthorizer } from 'aws-lambda';
import {
  listUsers,
  searchUsers,
  getUser,
  updateUser,
  updateUserStatus,
  deleteUser,
} from '../controller';
import * as repo from '../repository';
import { ForbiddenError, ValidationError } from '../../../shared/errors';
import type { User } from '../../../database/schema';

// ─── Mock Repository ──────────────────────────────────────────────────────────

jest.mock('../repository');
const mockRepo = repo as jest.Mocked<typeof repo>;

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const ADMIN_USER_ID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
const CLIENT_USER_ID = 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22';

function makeEvent(
  overrides: Partial<APIGatewayProxyEventV2WithJWTAuthorizer> = {}
): APIGatewayProxyEventV2WithJWTAuthorizer {
  return {
    version: '2.0',
    routeKey: 'GET /users',
    rawPath: '/users',
    rawQueryString: '',
    headers: {},
    requestContext: {
      accountId: '123456789012',
      apiId: 'test-api',
      domainName: 'example.execute-api.us-east-1.amazonaws.com',
      domainPrefix: 'example',
      http: {
        method: 'GET',
        path: '/users',
        protocol: 'HTTP/1.1',
        sourceIp: '1.2.3.4',
        userAgent: 'jest',
      },
      requestId: 'test-request-id',
      routeKey: 'GET /users',
      stage: '$default',
      time: '2026-01-01T00:00:00Z',
      timeEpoch: 0,
      authorizer: {
        jwt: {
          claims: {
            sub: ADMIN_USER_ID,
            email: 'admin@neofit.dev',
            'cognito:groups': 'Admin',
          },
          scopes: [],
        },
        principalId: ADMIN_USER_ID,
        integrationLatency: 0,
      },
    },
    isBase64Encoded: false,
    body: undefined,
    pathParameters: undefined,
    queryStringParameters: undefined,
    stageVariables: undefined,
    ...overrides,
  } as unknown as APIGatewayProxyEventV2WithJWTAuthorizer;
}

const sampleUser: User = {
  userId: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22',
  email: 'client@neofit.dev',
  firstName: 'Juan',
  lastName: 'Lopez',
  phone: '+521234567890',
  status: 'Active',
  role: 'Client',
  stripeCustomerId: 'cus_test',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

// ─── listUsers ────────────────────────────────────────────────────────────────

describe('listUsers', () => {
  it('returns paginated users for an Admin caller', async () => {
    mockRepo.listUsers.mockResolvedValue({ users: [sampleUser], nextKey: undefined });

    const result = await listUsers(makeEvent({ routeKey: 'GET /users' }));

    expect(mockRepo.listUsers).toHaveBeenCalledWith({
      limit: 20,
      lastKey: undefined,
      status: undefined,
    });
    expect(result).toEqual({ users: [sampleUser], nextKey: undefined });
  });

  it('throws ForbiddenError when caller is a Client', async () => {
    const event = makeEvent({
      requestContext: {
        ...makeEvent().requestContext,
        authorizer: {
          jwt: {
            claims: { sub: CLIENT_USER_ID, email: 'c@test.com', 'cognito:groups': '' },
            scopes: [],
          },
          principalId: CLIENT_USER_ID,
          integrationLatency: 0,
        },
      } as unknown as APIGatewayProxyEventV2WithJWTAuthorizer['requestContext'],
    });

    await expect(listUsers(event)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('accepts optional status filter from query params', async () => {
    mockRepo.listUsers.mockResolvedValue({ users: [], nextKey: undefined });

    await listUsers(makeEvent({ queryStringParameters: { status: 'Frozen' } }));

    expect(mockRepo.listUsers).toHaveBeenCalledWith(expect.objectContaining({ status: 'Frozen' }));
  });
});

// ─── searchUsers ──────────────────────────────────────────────────────────────

describe('searchUsers', () => {
  it('returns matching users for an Admin caller', async () => {
    mockRepo.searchUsers.mockResolvedValue([sampleUser]);

    const result = await searchUsers(makeEvent({ queryStringParameters: { q: 'juan' } }));

    expect(result).toHaveLength(1);
    expect(mockRepo.searchUsers).toHaveBeenCalledWith('juan', 10);
  });

  it('throws ValidationError when search term is too short', async () => {
    await expect(
      searchUsers(makeEvent({ queryStringParameters: { q: 'a' } }))
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('throws ForbiddenError for non-admin callers', async () => {
    const event = makeEvent({
      queryStringParameters: { q: 'juan' },
      requestContext: {
        ...makeEvent().requestContext,
        authorizer: {
          jwt: { claims: { sub: CLIENT_USER_ID, 'cognito:groups': '' }, scopes: [] },
          principalId: CLIENT_USER_ID,
          integrationLatency: 0,
        },
      } as unknown as APIGatewayProxyEventV2WithJWTAuthorizer['requestContext'],
    });

    await expect(searchUsers(event)).rejects.toBeInstanceOf(ForbiddenError);
  });
});

// ─── getUser ──────────────────────────────────────────────────────────────────

describe('getUser', () => {
  it('returns user when Admin requests any profile', async () => {
    mockRepo.getUserById.mockResolvedValue(sampleUser);

    const result = await getUser(makeEvent({ pathParameters: { id: CLIENT_USER_ID } }));

    expect(result).toEqual(sampleUser);
  });

  it('returns user when Client requests own profile', async () => {
    mockRepo.getUserById.mockResolvedValue(sampleUser);

    const event = makeEvent({
      pathParameters: { id: CLIENT_USER_ID },
      requestContext: {
        ...makeEvent().requestContext,
        authorizer: {
          jwt: { claims: { sub: CLIENT_USER_ID, 'cognito:groups': '' }, scopes: [] },
          principalId: CLIENT_USER_ID,
          integrationLatency: 0,
        },
      } as unknown as APIGatewayProxyEventV2WithJWTAuthorizer['requestContext'],
    });

    const result = await getUser(event);
    expect(result).toEqual(sampleUser);
  });

  it('throws ForbiddenError when Client requests another profile', async () => {
    const event = makeEvent({
      pathParameters: { id: ADMIN_USER_ID },
      requestContext: {
        ...makeEvent().requestContext,
        authorizer: {
          jwt: { claims: { sub: CLIENT_USER_ID, 'cognito:groups': '' }, scopes: [] },
          principalId: CLIENT_USER_ID,
          integrationLatency: 0,
        },
      } as unknown as APIGatewayProxyEventV2WithJWTAuthorizer['requestContext'],
    });

    await expect(getUser(event)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('throws ValidationError when ID is not a UUID', async () => {
    await expect(
      getUser(makeEvent({ pathParameters: { id: 'not-a-uuid' } }))
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

// ─── updateUser ───────────────────────────────────────────────────────────────

describe('updateUser', () => {
  it('updates user when Admin provides valid payload', async () => {
    const updated = { ...sampleUser, firstName: 'Carlos' };
    mockRepo.updateUser.mockResolvedValue(updated);

    const result = await updateUser(
      makeEvent({
        pathParameters: { id: CLIENT_USER_ID },
        body: JSON.stringify({ firstName: 'Carlos' }),
      })
    );

    expect(result.firstName).toBe('Carlos');
    expect(mockRepo.updateUser).toHaveBeenCalledWith(CLIENT_USER_ID, { firstName: 'Carlos' });
  });

  it('throws ValidationError when body is empty object', async () => {
    await expect(
      updateUser(makeEvent({ pathParameters: { id: CLIENT_USER_ID }, body: '{}' }))
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

// ─── updateUserStatus ─────────────────────────────────────────────────────────

describe('updateUserStatus', () => {
  it('changes user status when Admin provides valid status', async () => {
    const frozen = { ...sampleUser, status: 'Frozen' as const };
    mockRepo.updateUserStatus.mockResolvedValue(frozen);

    const result = await updateUserStatus(
      makeEvent({
        pathParameters: { id: CLIENT_USER_ID },
        body: JSON.stringify({ status: 'Frozen' }),
      })
    );

    expect(result.status).toBe('Frozen');
  });

  it('throws ValidationError when status value is invalid', async () => {
    await expect(
      updateUserStatus(
        makeEvent({
          pathParameters: { id: CLIENT_USER_ID },
          body: JSON.stringify({ status: 'Suspended' }),
        })
      )
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

// ─── deleteUser ───────────────────────────────────────────────────────────────

describe('deleteUser', () => {
  it('calls repository delete when Admin deletes a user', async () => {
    mockRepo.deleteUser.mockResolvedValue(undefined);

    await deleteUser(makeEvent({ pathParameters: { id: CLIENT_USER_ID } }));

    expect(mockRepo.deleteUser).toHaveBeenCalledWith(CLIENT_USER_ID);
  });

  it('throws ForbiddenError when Client attempts deletion', async () => {
    const event = makeEvent({
      pathParameters: { id: CLIENT_USER_ID },
      requestContext: {
        ...makeEvent().requestContext,
        authorizer: {
          jwt: { claims: { sub: CLIENT_USER_ID, 'cognito:groups': '' }, scopes: [] },
          principalId: CLIENT_USER_ID,
          integrationLatency: 0,
        },
      } as unknown as APIGatewayProxyEventV2WithJWTAuthorizer['requestContext'],
    });

    await expect(deleteUser(event)).rejects.toBeInstanceOf(ForbiddenError);
  });
});
