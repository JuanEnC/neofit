/**
 * AWS Systems Manager Parameter Store helper.
 *
 * Caches values at the module level so repeated calls within the same
 * warm Lambda invocation do not incur an additional network round-trip.
 * The cache is intentionally per-process and not TTL-based — Lambda
 * instances are short-lived and the values are deployment-stable secrets.
 */

import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';

const client = new SSMClient({ region: process.env.AWS_REGION ?? 'us-east-1' });

const cache = new Map<string, string>();

/**
 * Fetch a SecureString parameter from SSM.
 * Returns the cached value if already resolved in this Lambda instance.
 *
 * @throws Error if the parameter does not exist or SSM is unreachable.
 */
export async function getParameter(name: string): Promise<string> {
  const cached = cache.get(name);
  if (cached) return cached;

  const { Parameter } = await client.send(
    new GetParameterCommand({ Name: name, WithDecryption: true })
  );

  if (!Parameter?.Value) {
    throw new Error(`SSM parameter '${name}' is missing or empty`);
  }

  cache.set(name, Parameter.Value);
  return Parameter.Value;
}

/** Clear the cache — intended for use in tests only. */
export function clearCache(): void {
  cache.clear();
}
