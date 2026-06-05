#!/bin/bash
# Creates the NeoFit table with GSI1 and GSI2 in a local DynamoDB instance.
# Requires the DynamoDB Local container to be running on port 8000.
# Usage: bash scripts/setup-local-dynamo.sh

set -e

ENDPOINT="http://localhost:8000"
TABLE="NeoFit_MasterTable_dev"
REGION="us-east-1"

echo "Creating table: $TABLE on $ENDPOINT..."

aws dynamodb create-table \
  --endpoint-url "$ENDPOINT" \
  --region "$REGION" \
  --table-name "$TABLE" \
  --attribute-definitions \
    AttributeName=PK,AttributeType=S \
    AttributeName=SK,AttributeType=S \
    AttributeName=EntityType,AttributeType=S \
    AttributeName=Timestamp,AttributeType=S \
  --key-schema \
    AttributeName=PK,KeyType=HASH \
    AttributeName=SK,KeyType=RANGE \
  --billing-mode PAY_PER_REQUEST \
  --global-secondary-indexes \
    "[
      {
        \"IndexName\": \"GSI1\",
        \"KeySchema\": [
          {\"AttributeName\": \"SK\", \"KeyType\": \"HASH\"},
          {\"AttributeName\": \"PK\", \"KeyType\": \"RANGE\"}
        ],
        \"Projection\": {\"ProjectionType\": \"ALL\"}
      },
      {
        \"IndexName\": \"GSI2\",
        \"KeySchema\": [
          {\"AttributeName\": \"EntityType\", \"KeyType\": \"HASH\"},
          {\"AttributeName\": \"Timestamp\", \"KeyType\": \"RANGE\"}
        ],
        \"Projection\": {\"ProjectionType\": \"KEYS_ONLY\"}
      }
    ]" \
  --no-cli-pager

echo "Table created. Seeding sample data..."

DYNAMODB_ENDPOINT="$ENDPOINT" \
DYNAMODB_TABLE_NAME="$TABLE" \
AWS_ACCESS_KEY_ID="local" \
AWS_SECRET_ACCESS_KEY="local" \
AWS_REGION="$REGION" \
  pnpm --filter neofit-backend seed:local

echo "Done. Local DynamoDB is ready."
