/**
 * Unit tests for the Payments Controller.
 *
 * Stripe operations and repository calls are mocked so tests run
 * without network access or a real AWS/Stripe account.
 */

import type { APIGatewayProxyEventV2WithJWTAuthorizer } from 'aws-lambda';
import { createIntent, handleWebhook, getHistory, registerRenewal } from '../controller';
import * as repo from '../repository';
import * as stripeModule from '../stripe';
import { ForbiddenError, ValidationError } from '../../../shared/errors';
import type { Payment } from '../../../database/schema';

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('../repository');
jest.mock('../stripe');

const mockRepo = repo as jest.Mocked<typeof repo>;
const mockStripe = stripeModule as jest.Mocked<typeof stripeModule>;

// ─── Fixtures ─────────────────────────────────────────────────────────────────

// RFC 4122 compliant UUIDs
const ADMIN_ID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
const CLIENT_ID = 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22';

function makeEvent(
  overrides: Partial<APIGatewayProxyEventV2WithJWTAuthorizer> = {},
  role: 'Admin' | 'Client' = 'Admin'
): APIGatewayProxyEventV2WithJWTAuthorizer {
  const sub = role === 'Admin' ? ADMIN_ID : CLIENT_ID;
  return {
    version: '2.0',
    routeKey: 'POST /payments/intent',
    rawPath: '/payments/intent',
    rawQueryString: '',
    headers: {},
    isBase64Encoded: false,
    requestContext: {
      accountId: '123456789012',
      apiId: 'test-api',
      domainName: 'test.execute-api.us-east-1.amazonaws.com',
      domainPrefix: 'test',
      http: {
        method: 'POST',
        path: '/payments/intent',
        protocol: 'HTTP/1.1',
        sourceIp: '1.2.3.4',
        userAgent: 'jest',
      },
      requestId: 'test-id',
      routeKey: 'POST /payments/intent',
      stage: '$default',
      time: '2026-01-01T00:00:00Z',
      timeEpoch: 0,
      authorizer: {
        jwt: {
          claims: {
            sub,
            email: `${role.toLowerCase()}@neofit.dev`,
            'cognito:groups': role,
          },
          scopes: [],
        },
        principalId: sub,
        integrationLatency: 0,
      },
    },
    body: undefined,
    pathParameters: undefined,
    queryStringParameters: undefined,
    stageVariables: undefined,
    ...overrides,
  } as unknown as APIGatewayProxyEventV2WithJWTAuthorizer;
}

const samplePayment: Payment = {
  paymentId: 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a33',
  userId: CLIENT_ID,
  amount: 69900,
  currency: 'MXN',
  paymentDate: '2026-01-01T00:00:00.000Z',
  nextBillingDate: '2026-01-31T00:00:00.000Z',
  stripePaymentIntentId: 'pi_test_123',
  status: 'Completed',
};

// ─── createIntent ─────────────────────────────────────────────────────────────

describe('createIntent', () => {
  it('returns clientSecret and paymentIntentId for valid admin request', async () => {
    mockStripe.createPaymentIntent.mockResolvedValue({
      clientSecret: 'pi_test_secret',
      paymentIntentId: 'pi_test_123',
    });

    const event = makeEvent({
      body: JSON.stringify({ userId: CLIENT_ID, amount: 69900, currency: 'MXN' }),
    });

    const result = await createIntent(event);

    expect(result.clientSecret).toBe('pi_test_secret');
    expect(mockStripe.createPaymentIntent).toHaveBeenCalledWith(69900, 'MXN');
  });

  it('returns clientSecret when client creates intent for themselves', async () => {
    mockStripe.createPaymentIntent.mockResolvedValue({
      clientSecret: 'pi_client_secret',
      paymentIntentId: 'pi_client_123',
    });

    const event = makeEvent(
      { body: JSON.stringify({ userId: CLIENT_ID, amount: 69900, currency: 'MXN' }) },
      'Client'
    );

    const result = await createIntent(event);
    expect(result.clientSecret).toBe('pi_client_secret');
  });

  it('throws ForbiddenError when client creates intent for another user', async () => {
    const event = makeEvent(
      { body: JSON.stringify({ userId: ADMIN_ID, amount: 69900, currency: 'MXN' }) },
      'Client'
    );

    await expect(createIntent(event)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('throws ValidationError when amount is below minimum', async () => {
    const event = makeEvent({
      body: JSON.stringify({ userId: CLIENT_ID, amount: 50, currency: 'MXN' }),
    });

    await expect(createIntent(event)).rejects.toBeInstanceOf(ValidationError);
  });

  it('throws ValidationError for unsupported currency', async () => {
    const event = makeEvent({
      body: JSON.stringify({ userId: CLIENT_ID, amount: 69900, currency: 'USD' }),
    });

    await expect(createIntent(event)).rejects.toBeInstanceOf(ValidationError);
  });

  it('throws ValidationError when body is missing', async () => {
    const event = makeEvent({ body: undefined });
    await expect(createIntent(event)).rejects.toBeInstanceOf(ValidationError);
  });
});

// ─── handleWebhook ────────────────────────────────────────────────────────────

describe('handleWebhook', () => {
  it('creates a payment record on payment_intent.succeeded', async () => {
    mockStripe.constructWebhookEvent.mockResolvedValue({
      type: 'payment_intent.succeeded',
      id: 'evt_test_123',
      data: {
        object: {
          id: 'pi_test_123',
          amount: 69900,
          currency: 'mxn',
          metadata: { userId: CLIENT_ID },
        },
      },
    } as unknown as import('stripe').default.Event);

    mockRepo.createPayment.mockResolvedValue(samplePayment);

    const result = await handleWebhook('raw_body', 'stripe_sig_123');

    expect(result.received).toBe(true);
    expect(mockRepo.createPayment).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: CLIENT_ID,
        amount: 69900,
        currency: 'MXN',
        stripePaymentIntentId: 'pi_test_123',
      })
    );
  });

  it('returns received=true without creating a record for payment_failed', async () => {
    mockStripe.constructWebhookEvent.mockResolvedValue({
      type: 'payment_intent.payment_failed',
      id: 'evt_failed_123',
      data: { object: { id: 'pi_failed_123' } },
    } as unknown as import('stripe').default.Event);

    const result = await handleWebhook('raw_body', 'sig');

    expect(result.received).toBe(true);
    expect(mockRepo.createPayment).not.toHaveBeenCalled();
  });

  it('skips record creation when userId is missing from metadata', async () => {
    mockStripe.constructWebhookEvent.mockResolvedValue({
      type: 'payment_intent.succeeded',
      id: 'evt_no_user',
      data: {
        object: { id: 'pi_no_user', amount: 69900, currency: 'mxn', metadata: {} },
      },
    } as unknown as import('stripe').default.Event);

    const result = await handleWebhook('raw_body', 'sig');

    expect(result.received).toBe(true);
    expect(mockRepo.createPayment).not.toHaveBeenCalled();
  });
});

// ─── getHistory ───────────────────────────────────────────────────────────────

describe('getHistory', () => {
  it('returns payment history for the authenticated user', async () => {
    mockRepo.getPaymentsByUser.mockResolvedValue({
      payments: [samplePayment],
      nextKey: undefined,
    });

    const event = makeEvent({ pathParameters: { userId: CLIENT_ID } }, 'Client');

    const result = await getHistory(event);

    expect(result.payments).toHaveLength(1);
    expect(mockRepo.getPaymentsByUser).toHaveBeenCalledWith(CLIENT_ID);
  });

  it('returns payment history for any user when requester is Admin', async () => {
    mockRepo.getPaymentsByUser.mockResolvedValue({ payments: [samplePayment] });

    const event = makeEvent({ pathParameters: { userId: CLIENT_ID } });
    const result = await getHistory(event);

    expect(result.payments).toHaveLength(1);
  });

  it('throws ForbiddenError when client requests another user history', async () => {
    const event = makeEvent({ pathParameters: { userId: ADMIN_ID } }, 'Client');

    await expect(getHistory(event)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('throws ValidationError when userId path param is not a UUID', async () => {
    const event = makeEvent({ pathParameters: { userId: 'not-a-uuid' } }, 'Client');

    await expect(getHistory(event)).rejects.toBeInstanceOf(ValidationError);
  });
});

// ─── registerRenewal ──────────────────────────────────────────────────────────

describe('registerRenewal', () => {
  it('creates a manual payment record when Admin provides valid data', async () => {
    mockRepo.createPayment.mockResolvedValue(samplePayment);

    const event = makeEvent({
      pathParameters: { userId: CLIENT_ID },
      body: JSON.stringify({ amount: 69900, note: 'Cash at front desk' }),
    });

    const result = await registerRenewal(event);

    expect(result.status).toBe('Completed');
    expect(mockRepo.createPayment).toHaveBeenCalledWith(
      expect.objectContaining({ userId: CLIENT_ID, amount: 69900 })
    );
  });

  it('uses default amount of 69900 when amount is not provided', async () => {
    mockRepo.createPayment.mockResolvedValue(samplePayment);

    const event = makeEvent({
      pathParameters: { userId: CLIENT_ID },
      body: JSON.stringify({}),
    });

    await registerRenewal(event);

    expect(mockRepo.createPayment).toHaveBeenCalledWith(expect.objectContaining({ amount: 69900 }));
  });

  it('throws ForbiddenError when Client attempts to register a renewal', async () => {
    const event = makeEvent(
      { pathParameters: { userId: CLIENT_ID }, body: JSON.stringify({}) },
      'Client'
    );

    await expect(registerRenewal(event)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('throws ValidationError when userId is not a valid UUID', async () => {
    const event = makeEvent({
      pathParameters: { userId: 'bad-id' },
      body: JSON.stringify({}),
    });

    await expect(registerRenewal(event)).rejects.toBeInstanceOf(ValidationError);
  });
});
