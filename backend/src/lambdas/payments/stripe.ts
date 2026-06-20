/**
 * Stripe SDK wrapper.
 *
 * Compatibility note: Stripe v16+ changed how the class is exported.
 * We use require() for the runtime value and define minimal local types
 * to avoid version-specific path imports that break across SDK versions.
 */

import { getParameter } from '../../shared/ssm';

const StripeConstructor = require('stripe'); // eslint-disable-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires

// Minimal interface — only the methods this module actually calls
interface StripeClient {
  paymentIntents: {
    create: (params: Record<string, unknown>) => Promise<{
      client_secret: string | null;
      id: string;
    }>;
  };
  customers: {
    list: (params: { email: string; limit: number }) => Promise<{
      data: Array<{ id: string }>;
    }>;
    create: (params: { email: string; name: string }) => Promise<{ id: string }>;
  };
  webhooks: {
    constructEvent: (payload: string, header: string, secret: string) => StripeEvent;
  };
}

// Minimal event shape — the fields consumed by the webhook controller
export interface StripeEvent {
  type: string;
  id: string;
  data: { object: Record<string, unknown> };
}

let stripeClient: StripeClient | undefined;

const SSM_STRIPE_SECRET = '/neofit/stripe/secret-key';
const SSM_STRIPE_WEBHOOK = '/neofit/stripe/webhook-secret';

async function getStripe(): Promise<StripeClient> {
  if (stripeClient) return stripeClient;

  const secretKey = await getParameter(SSM_STRIPE_SECRET);
  const Constructor = StripeConstructor.default ?? StripeConstructor;

  stripeClient = new Constructor(secretKey, {
    apiVersion: '2026-05-27.dahlia',
    maxNetworkRetries: 2,
  }) as StripeClient;

  return stripeClient;
}

export async function createPaymentIntent(
  amount: number,
  currency: string,
  customerId?: string
): Promise<{ clientSecret: string; paymentIntentId: string }> {
  const stripe = await getStripe();

  const intent = await stripe.paymentIntents.create({
    amount,
    currency: currency.toLowerCase(),
    ...(customerId && { customer: customerId }),
    automatic_payment_methods: { enabled: true },
    metadata: { source: 'neofit-backend' },
  });

  if (!intent.client_secret) {
    throw new Error('Stripe did not return a client_secret');
  }

  return { clientSecret: intent.client_secret, paymentIntentId: intent.id };
}

export async function constructWebhookEvent(
  rawBody: string,
  signature: string
): Promise<StripeEvent> {
  const stripe = await getStripe();
  const webhookSecret = await getParameter(SSM_STRIPE_WEBHOOK);

  return stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
}

export async function getOrCreateCustomer(email: string, name: string): Promise<string> {
  const stripe = await getStripe();
  const existing = await stripe.customers.list({ email, limit: 1 });

  if (existing.data.length > 0) return existing.data[0].id;

  const customer = await stripe.customers.create({ email, name });
  return customer.id;
}

export function resetStripeClient(): void {
  stripeClient = undefined;
}
