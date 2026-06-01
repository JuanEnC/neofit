#!/bin/bash

set -e

ENVIRONMENT=${1:-dev}
REGION=${2:-us-east-1}

echo "Deploying NeoFit Infrastructure..."
echo "Environment: $ENVIRONMENT"
echo "Region: $REGION"

# Navigate to infrastructure directory
cd infrastructure

# Verify AWS credentials
echo "Verifying AWS credentials..."
aws sts get-caller-identity

# Build TypeScript
echo "Building TypeScript..."
pnpm build

# Synthesize CloudFormation
echo "Synthesizing CDK stack..."
pnpm synth --context environment=$ENVIRONMENT

# Deploy
echo "Deploying to AWS..."
if [ "$ENVIRONMENT" = "prod" ]; then
  pnpm deploy:prod
else
  pnpm deploy
fi

# Output CloudFormation outputs
echo "Stack outputs:"
aws cloudformation describe-stacks \
  --stack-name "NeoFit-Stack-$ENVIRONMENT" \
  --region "$REGION" \
  --query 'Stacks[0].Outputs[*].[OutputKey,OutputValue]' \
  --output table

echo "Deployment complete!"