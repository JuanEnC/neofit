#!/bin/bash

set -e

ENVIRONMENT=${1:-dev}
REGION=${2:-us-east-1}

echo "Validating NeoFit Infrastructure..."
echo "Environment: $ENVIRONMENT"
echo "Region: $REGION"

# Verify stack exists
echo "Checking if stack exists..."
aws cloudformation describe-stacks \
  --stack-name "NeoFit-Stack-$ENVIRONMENT" \
  --region "$REGION" \
  --query 'Stacks[0].StackStatus' \
  --output text

echo "Infrastructure validation complete!"