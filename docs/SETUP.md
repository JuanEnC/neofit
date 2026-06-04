# Local Development Setup

This guide walks through setting up NeoFit for local development from scratch. Follow each section in order.

---

## Table of Contents

- [Prerequisites](#prerequisites)
- [Repository Setup](#repository-setup)
- [AWS Configuration](#aws-configuration)
- [Environment Variables](#environment-variables)
- [Running Locally](#running-locally)
- [Common Commands](#common-commands)
- [IDE Configuration](#ide-configuration)
- [Troubleshooting](#troubleshooting)

---

## Prerequisites

Install the following tools before proceeding:

| Tool    | Required Version | Installation                                       |
| ------- | ---------------- | -------------------------------------------------- |
| Node.js | 22.x (LTS)       | [nodejs.org](https://nodejs.org) — use LTS release |
| pnpm    | 11.x             | `npm install -g pnpm`                              |
| Git     | 2.x              | [git-scm.com](https://git-scm.com)                 |
| AWS CLI | 2.x              | [aws.amazon.com/cli](https://aws.amazon.com/cli)   |
| AWS CDK | 2.x              | `npm install -g aws-cdk`                           |

Verify your installation:

```bash
node --version    # v22.x.x
pnpm --version    # 11.x.x
git --version     # git version 2.x.x
aws --version     # aws-cli/2.x.x
cdk --version     # 2.x.x
```

> [!NOTE]
> pnpm v11 requires Node.js v22 or higher. Using an older Node.js version will cause the install to fail.

---

## Repository Setup

```bash
# Clone
git clone https://github.com/JuanEnC/neofit.git
cd neofit

# Install all workspace dependencies (frontend, backend, infrastructure, tests)
pnpm install

# Verify workspace structure
pnpm ls -r --depth=0
```

Expected output from `pnpm ls`:

```
neofit (root)
├── neofit-backend
├── neofit-frontend
├── neofit-infrastructure
└── neofit-tests
```

---

## AWS Configuration

### 1. Create or log in to your AWS account

AWS Free Tier is sufficient for all development work. Register at [aws.amazon.com](https://aws.amazon.com) if you do not have an account.

### 2. Configure AWS CLI credentials

```bash
aws configure
```

Enter when prompted:

```
AWS Access Key ID:     [your access key]
AWS Secret Access Key: [your secret key]
Default region name:   us-east-1
Default output format: json
```

Verify:

```bash
aws sts get-caller-identity
# Expected: JSON with your Account ID, UserId, and ARN
```

### 3. Bootstrap CDK (one-time per account/region)

```bash
cdk bootstrap aws://YOUR_ACCOUNT_ID/us-east-1
# Replace YOUR_ACCOUNT_ID with the 12-digit number from the previous command
```

This creates the `CDKToolkit` CloudFormation stack in your account.

### 4. Deploy infrastructure

```bash
cd infrastructure
pnpm build      # compile TypeScript
pnpm synth      # verify CDK generates valid CloudFormation
cdk deploy --context environment=dev
cd ..
```

Deployment takes 5-10 minutes. At the end, CDK prints the Output values — copy these for the next section.

---

## Environment Variables

### Root — `.env.local`

Create `.env.local` in the project root (this file is gitignored):

```bash
cp .env.example .env.local
```

Fill in the values from your CDK deployment outputs:

```bash
# AWS
AWS_REGION=us-east-1
AWS_ACCOUNT_ID=<your 12-digit account ID>

# Cognito (from CDK outputs)
COGNITO_USER_POOL_ID=us-east-1_<id>
COGNITO_CLIENT_ID=<client id>

# API Gateway (from CDK outputs)
API_GATEWAY_URL=https://<id>.execute-api.us-east-1.amazonaws.com

# DynamoDB (from CDK outputs)
DYNAMODB_TABLE_NAME=NeoFit_MasterTable_dev

# S3 (from CDK outputs)
S3_BUCKET_NAME=neofit-frontend-dev-<account-id>
```

### Frontend — `frontend/.env.local`

```bash
NEXT_PUBLIC_API_BASE_URL=https://<id>.execute-api.us-east-1.amazonaws.com
NEXT_PUBLIC_AWS_REGION=us-east-1
NEXT_PUBLIC_COGNITO_USER_POOL_ID=us-east-1_<id>
NEXT_PUBLIC_COGNITO_CLIENT_ID=<client id>
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_<key>
NEXT_PUBLIC_ENVIRONMENT=development
```

### Backend — `backend/.env.local`

```bash
ENVIRONMENT=development
NODE_ENV=development
AWS_REGION=us-east-1
DYNAMODB_TABLE_NAME=NeoFit_MasterTable_dev
COGNITO_USER_POOL_ID=us-east-1_<id>
```

> [!IMPORTANT]
> Never put AWS Secret Access Keys or Stripe Secret Keys in `.env` files that could be committed. These belong in AWS SSM Parameter Store. See [ARCHITECTURE.md](ARCHITECTURE.md#security-layers).

---

## Retrieve CDK Outputs

If you need to recover your resource IDs after deployment:

```bash
aws cloudformation describe-stacks \
  --stack-name NeoFit-Stack-dev \
  --region us-east-1 \
  --query 'Stacks[0].Outputs[*].[OutputKey,OutputValue]' \
  --output table
```

---

## Running Locally

### Infrastructure (CDK)

```bash
cd infrastructure

pnpm build          # compile TypeScript
pnpm synth          # synthesize CloudFormation template
cdk diff            # preview changes vs. deployed stack
cdk deploy          # deploy changes
```

### Frontend (Phase 3)

```bash
cd frontend
pnpm dev            # start dev server at localhost:3000
```

### Backend Lambda (Phase 2)

```bash
cd backend
pnpm dev            # local Lambda emulation (configured in Phase 2)
```

---

## Common Commands

Run from the **project root**:

```bash
# Code quality
pnpm lint           # ESLint on infrastructure and backend source
pnpm format         # auto-format all files with Prettier
pnpm format:check   # check formatting without modifying files

# Build
pnpm build          # compile infrastructure TypeScript

# Tests (Phase 2+)
pnpm test:unit      # Jest unit tests
```

---

## IDE Configuration

### VS Code (recommended)

Install these extensions:

- **ESLint** (`dbaeumer.vscode-eslint`)
- **Prettier - Code formatter** (`esbenp.prettier-vscode`)
- **AWS Toolkit** (`amazonwebservices.aws-toolkit-vscode`)
- **TypeScript** (built-in)

Add to `.vscode/settings.json`:

```json
{
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "editor.formatOnSave": true,
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true
  },
  "typescript.preferences.importModuleSpecifier": "relative"
}
```

---

## Troubleshooting

### `pnpm install` fails with "This version of pnpm requires at least Node.js v22"

```bash
node --version  # check current version
# Install Node.js 22 from nodejs.org, then retry
```

### `cdk bootstrap` fails with "Access Denied"

```bash
aws sts get-caller-identity
# Verify your credentials are configured and the user has AdministratorAccess
```

### `cdk deploy` fails with "CDKToolkit stack not found"

Run bootstrap first:

```bash
cdk bootstrap aws://YOUR_ACCOUNT_ID/us-east-1
```

### Port 3000 already in use

```bash
# macOS / Linux
lsof -i :3000
kill -9 <PID>

# Windows
netstat -ano | findstr :3000
taskkill /PID <PID> /F
```

### `pnpm build` TypeScript errors in infrastructure

```bash
cd infrastructure
rm -rf dist node_modules/.cache
pnpm install
pnpm build
```

---

_For architecture details, see [ARCHITECTURE.md](ARCHITECTURE.md)._  
_For contribution guidelines, see [../CONTRIBUTING.md](../CONTRIBUTING.md)._
