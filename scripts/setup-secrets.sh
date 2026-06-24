#!/bin/bash
# scripts/setup-secrets.sh
#
# Creates all required SSM SecureString parameters for NeoFit.
# Run this once per environment before deploying Lambda functions.
#
# Usage:
#   bash scripts/setup-secrets.sh dev
#   bash scripts/setup-secrets.sh prod
#
# Prerequisites:
#   - AWS CLI configured with credentials that have ssm:PutParameter permission
#   - Stripe account with test/live keys ready
#
# Note: MSYS_NO_PATHCONV=1 is required on Windows (MINGW64/Git Bash) to prevent
# the shell from converting SSM parameter paths (e.g. /neofit/...) into
# Windows filesystem paths before they reach the AWS CLI.

set -euo pipefail

# Disable MINGW64/Git Bash path conversion for AWS CLI calls on Windows
export MSYS_NO_PATHCONV=1

# ── Args ──────────────────────────────────────────────────────────────────────

ENVIRONMENT=${1:-dev}

if [[ "$ENVIRONMENT" != "dev" && "$ENVIRONMENT" != "prod" ]]; then
  echo "Error: environment must be 'dev' or 'prod'" >&2
  exit 1
fi

echo "Setting up SSM parameters for environment: $ENVIRONMENT"
echo ""

# ── Helpers ───────────────────────────────────────────────────────────────────

# put_parameter NAME VALUE
# Creates or overwrites a SecureString parameter.
put_parameter() {
  local name="$1"
  local value="$2"

  MSYS_NO_PATHCONV=1 aws ssm put-parameter \
    --name "$name" \
    --value "$value" \
    --type "SecureString" \
    --overwrite \
    --output text \
    --query "Version" > /dev/null

  echo "  [ok] $name"
}

# ── Read Stripe credentials interactively ─────────────────────────────────────

echo "Enter your Stripe credentials."
echo "For dev: use test mode keys (sk_test_... / whsec_...)"
echo "For prod: use live mode keys (sk_live_... / whsec_...)"
echo ""

read -rsp "Stripe Secret Key: " STRIPE_SECRET_KEY
echo ""

read -rsp "Stripe Webhook Secret: " STRIPE_WEBHOOK_SECRET
echo ""
echo ""

# ── Validate inputs are not empty ─────────────────────────────────────────────

if [[ -z "$STRIPE_SECRET_KEY" ]]; then
  echo "Error: Stripe Secret Key cannot be empty" >&2
  exit 1
fi

if [[ -z "$STRIPE_WEBHOOK_SECRET" ]]; then
  echo "Error: Stripe Webhook Secret cannot be empty" >&2
  exit 1
fi

# Basic format validation
if [[ "$ENVIRONMENT" == "dev" && "$STRIPE_SECRET_KEY" != sk_test_* ]]; then
  echo "Warning: dev environment expected a test key (sk_test_...)"
fi

if [[ "$ENVIRONMENT" == "prod" && "$STRIPE_SECRET_KEY" != sk_live_* ]]; then
  echo "Warning: prod environment expected a live key (sk_live_...)"
fi

# ── Create parameters ─────────────────────────────────────────────────────────

echo "Creating SSM parameters..."
echo ""

put_parameter "/neofit/stripe/secret-key"     "$STRIPE_SECRET_KEY"
put_parameter "/neofit/stripe/webhook-secret" "$STRIPE_WEBHOOK_SECRET"

echo ""
echo "All parameters created successfully."
echo ""

# ── Verify parameters exist ───────────────────────────────────────────────────

echo "Verifying parameters..."
echo ""

MSYS_NO_PATHCONV=1 aws ssm get-parameters \
  --names \
    "/neofit/stripe/secret-key" \
    "/neofit/stripe/webhook-secret" \
  --with-decryption \
  --query "Parameters[*].[Name,Version,LastModifiedDate]" \
  --output table

echo ""
echo "Setup complete. Lambda functions can now read these parameters at runtime."