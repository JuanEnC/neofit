#!/bin/bash
set -e

ENDPOINT="http://localhost:8000"
TABLE="NeoFit_MasterTable_dev"
REGION="us-east-1"

# Check if table already exists to avoid ResourceInUseException
if aws dynamodb describe-table \
  --endpoint-url "$ENDPOINT" \
  --region "$REGION" \
  --table-name "$TABLE" \
  --no-cli-pager 2>/dev/null; then
  echo "Table $TABLE already exists, skipping creation."
else
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
fi

echo "Seeding sample data..."
cd backend
pnpm seed:local
echo "Done. Local DynamoDB is ready."