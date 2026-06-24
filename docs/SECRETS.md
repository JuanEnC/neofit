# Secrets Management

NeoFit stores all sensitive credentials in AWS Systems Manager Parameter Store
as `SecureString` parameters. Lambda functions fetch them at cold-start and cache
the values in memory for the lifetime of the container.

No secrets are stored in environment variables, source code, or CDK context.

---

## Parameters

| Parameter name                  | Type         | Used by         | Description                                                              |
| ------------------------------- | ------------ | --------------- | ------------------------------------------------------------------------ |
| `/neofit/stripe/secret-key`     | SecureString | Payments Lambda | Stripe API key for creating PaymentIntents and managing customers        |
| `/neofit/stripe/webhook-secret` | SecureString | Payments Lambda | Stripe webhook signing secret for verifying `/payments/webhook` requests |

---

## Setup

Run the setup script once per environment before the first deploy:

```bash
# Development (uses Stripe test keys)
bash scripts/setup-secrets.sh dev

# Production (uses Stripe live keys)
bash scripts/setup-secrets.sh prod
```

The script prompts for each value interactively so credentials are never stored
in shell history or CI logs.

---

## Rotating a secret

```bash
# Re-run the script — it uses --overwrite so it updates in place
bash scripts/setup-secrets.sh dev
```

After rotating the Stripe secret key, all warm Lambda containers still hold the
old cached value. Force a fresh read by deploying a no-op change or by
incrementing a dummy environment variable in the CDK stack:

```bash
cd infrastructure && cdk deploy --context environment=dev --require-approval never
```

---

## IAM permissions

The shared Lambda execution role (`NeoFit-LambdaRole-dev`) already has the
following policy attached via CDK:

```json
{
  "Effect": "Allow",
  "Action": ["ssm:GetParameter", "ssm:GetParameters"],
  "Resource": "arn:aws:ssm:<region>:<account>:parameter/neofit/*"
}
```

No additional IAM changes are required.

---

## Local development

For local runs, mock the SSM calls by setting environment variables directly
(never commit these values):

```bash
# .env.local — gitignored
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

The `shared/ssm.ts` helper reads from SSM only. For local development the
payments controller tests mock `getParameter` via `jest.mock('../../shared/ssm')`.

---

## Adding a new secret

1. Choose a name under `/neofit/<service>/<key>` (e.g. `/neofit/ses/smtp-password`)
2. Add it to `scripts/setup-secrets.sh`
3. Add a row to the Parameters table above
4. Import `getParameter` from `../../shared/ssm` in the module that needs it
5. Verify the Lambda role policy covers the new path (current wildcard `neofit/*` already does)
