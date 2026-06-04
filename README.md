# NeoFit — Gym Management System

[![CI Pipeline](https://github.com/JuanEnC/neofit/actions/workflows/ci.yml/badge.svg)](https://github.com/JuanEnC/neofit/actions/workflows/ci.yml)
[![Deploy to AWS](https://github.com/JuanEnC/neofit/actions/workflows/deploy.yml/badge.svg)](https://github.com/JuanEnC/neofit/actions/workflows/deploy.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-22.x-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![pnpm](https://img.shields.io/badge/pnpm-11.x-F69220?logo=pnpm&logoColor=white)](https://pnpm.io)
[![AWS CDK](https://img.shields.io/badge/AWS_CDK-2.x-FF9900?logo=amazonaws&logoColor=white)](https://aws.amazon.com/cdk)

A cloud-native, serverless SaaS platform for automating gym operations — membership management, payment processing, workout routines, and admin analytics. Built entirely on AWS Free Tier with zero persistent servers.

---

## Table of Contents

- [Overview](#overview)
- [Tech Stack](#tech-stack)
- [Architecture](#architecture)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [Development](#development)
- [CI/CD Pipeline](#cicd-pipeline)
- [Documentation](#documentation)
- [Contributing](#contributing)
- [License](#license)

---

## Overview

NeoFit automates the day-to-day operations of a mid-sized gym through three core modules:

| Module              | Description                                                                 |
| ------------------- | --------------------------------------------------------------------------- |
| Client Portal       | Member registration, authentication, membership status, and workout catalog |
| Admin Dashboard     | Analytics, client management, manual billing, and routine CRUD              |
| Notification Engine | Automated renewal reminders via SES and a Dead Letter Queue for resilience  |

**Key design decisions:**

- No 24/7 servers — all compute runs on AWS Lambda (pay-per-invocation)
- Single-table DynamoDB design to stay within Free Tier limits
- Stripe Test Mode for end-to-end payment flow without real charges
- Infrastructure as Code via AWS CDK v2 (TypeScript)

---

## Tech Stack

| Layer           | Technology                | Rationale                                    |
| --------------- | ------------------------- | -------------------------------------------- |
| Frontend        | Next.js 14 + TypeScript   | App Router, SSR, file-based routing          |
| Styling         | Tailwind CSS + Shadcn/UI  | Utility-first, accessible components         |
| Authentication  | Amazon Cognito            | Managed JWT, up to 50K MAU free              |
| API             | Amazon API Gateway (HTTP) | 1M requests/month free, CORS built-in        |
| Backend         | AWS Lambda (Node.js)      | 1M invocations/month free, no idle cost      |
| Database        | Amazon DynamoDB           | 25 GB free, single-table design              |
| Payments        | Stripe SDK (Test Mode)    | No real charges during development           |
| Notifications   | AWS SES + SNS             | Transactional email and SMS                  |
| Infrastructure  | AWS CDK v2                | IaC in TypeScript, same language as app      |
| CI/CD           | GitHub Actions            | Automated lint, type-check, build, deploy    |
| Package Manager | pnpm v11                  | Workspaces, faster installs, disk efficiency |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        CLIENT                               │
│              Next.js (Vercel / AWS Amplify)                 │
└───────────────────────────┬─────────────────────────────────┘
                            │ HTTPS / TLS 1.3
                            ▼
┌─────────────────────────────────────────────────────────────┐
│               Amazon API Gateway (HTTP API)                 │
│          CORS restricted to frontend domain only            │
│          Rate limiting: 10 RPS per IP                       │
└────┬──────────┬──────────┬──────────┬───────────────────────┘
     │          │          │          │
     ▼          ▼          ▼          ▼
┌────────┐ ┌────────┐ ┌────────┐ ┌────────────┐
│  User  │ │Payment │ │Routine │ │Notification│   AWS Lambda
│Service │ │Service │ │Service │ │  Service   │   (Node.js)
└───┬────┘ └───┬────┘ └───┬────┘ └─────┬──────┘
    │          │          │             │
    └──────────┴──────────┴─────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│           Amazon DynamoDB (Single Table Design)             │
│           NeoFit_MasterTable_dev / prod                     │
│           GSI1 (entity queries) · GSI2 (chronological)      │
└─────────────────────────────────────────────────────────────┘

Supporting Services:
  Amazon Cognito     — JWT authentication, user pool management
  Amazon SES         — Transactional email (renewal reminders)
  Amazon SQS         — Notification queue + Dead Letter Queue
  Amazon EventBridge — Daily cron trigger at 06:00 AM UTC-6
  AWS Systems Manager — Secure storage of Stripe keys and secrets
  Amazon CloudWatch  — Structured logs, metrics, X-Ray tracing
```

Full diagram: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)

---

## Project Structure

```
neofit/
├── .github/
│   └── workflows/
│       ├── ci.yml          # Lint, type-check, build on every push/PR
│       └── deploy.yml      # CDK deploy on merge to main
├── backend/
│   └── src/                # AWS Lambda handlers (Phase 2+)
├── docs/
│   ├── ARCHITECTURE.md     # Detailed architecture and data model
│   ├── SETUP.md            # Local development setup guide
│   ├── API.md              # API endpoint reference (Phase 2+)
│   └── DEPLOYMENT.md       # Production deployment guide (Phase 7)
├── frontend/               # Next.js application (Phase 3+)
├── infrastructure/
│   ├── bin/
│   │   └── infrastructure.ts   # CDK app entry point
│   └── lib/
│       └── infrastructure-stack.ts  # All AWS resources
├── scripts/
│   ├── deploy-infrastructure.sh
│   └── validate-infrastructure.sh
├── tests/                  # Integration and E2E tests (Phase 6+)
├── .env.example            # Environment variable reference
├── .eslintrc.json
├── .prettierrc.json
├── CONTRIBUTING.md
├── LICENSE
├── package.json            # Monorepo root
└── pnpm-workspace.yaml
```

---

## Getting Started

### Prerequisites

| Tool    | Version | Install                                          |
| ------- | ------- | ------------------------------------------------ |
| Node.js | 22.x    | [nodejs.org](https://nodejs.org)                 |
| pnpm    | 11.x    | `npm install -g pnpm`                            |
| AWS CLI | 2.x     | [aws.amazon.com/cli](https://aws.amazon.com/cli) |
| AWS CDK | 2.x     | `npm install -g aws-cdk`                         |
| Git     | 2.x     | [git-scm.com](https://git-scm.com)               |

### Installation

```bash
# Clone the repository
git clone https://github.com/JuanEnC/neofit.git
cd neofit

# Install all workspace dependencies
pnpm install

# Copy environment variable template
cp .env.example .env.local
```

Configure `.env.local` with your AWS credentials and resource IDs. See [docs/SETUP.md](docs/SETUP.md) for detailed instructions.

### Bootstrap AWS CDK (first time only)

```bash
# Replace with your AWS account ID and region
cdk bootstrap aws://YOUR_ACCOUNT_ID/us-east-1
```

### Deploy Infrastructure

```bash
# Preview changes before deploying
pnpm --filter neofit-infrastructure diff

# Deploy to AWS
pnpm --filter neofit-infrastructure deploy
```

---

## Development

### Available Scripts

| Command             | Description                                     |
| ------------------- | ----------------------------------------------- |
| `pnpm install`      | Install all dependencies across workspaces      |
| `pnpm lint`         | Run ESLint on infrastructure and backend source |
| `pnpm format`       | Auto-format all files with Prettier             |
| `pnpm format:check` | Verify formatting without modifying files       |
| `pnpm build`        | Compile the infrastructure TypeScript           |
| `pnpm test:unit`    | Run unit tests (available from Phase 2)         |
| `pnpm deploy:infra` | Deploy CDK stack to AWS dev environment         |

### Branch Conventions

```
main            production-ready code, protected
develop         integration branch for features

feature/<name>  new functionality
bugfix/<name>   non-critical bug fixes
hotfix/<name>   critical production fixes
docs/<name>     documentation-only changes
refactor/<name> code restructuring without behavior change
```

### Commit Convention

This project follows [Conventional Commits](https://www.conventionalcommits.org):

```
feat(scope):     new feature
fix(scope):      bug fix
docs(scope):     documentation change
style(scope):    formatting, no logic change
refactor(scope): code restructure, no behavior change
perf(scope):     performance improvement
test(scope):     add or update tests
chore(scope):    build process, dependencies
ci(scope):       CI/CD pipeline changes
```

---

## CI/CD Pipeline

Every push or pull request to `main` / `develop` triggers the CI pipeline:

```
Push / PR
    │
    ├── Lint and Format Check   (ESLint + Prettier)
    ├── TypeScript Type Check   (tsc + CDK synth)
    ├── Unit Tests              (Jest, 80%+ coverage required)
    └── Build Infrastructure   (CDK compile)
              │
              ▼ (on merge to main only)
         Deploy to AWS
              │
              ├── CDK diff validation
              ├── CDK deploy
              └── CloudFormation stack verification
```

Workflow files: [.github/workflows/](.github/workflows/)

---

## Documentation

| Document                                     | Description                                    |
| -------------------------------------------- | ---------------------------------------------- |
| [docs/SETUP.md](docs/SETUP.md)               | Local development environment setup            |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | System architecture and data model             |
| [CONTRIBUTING.md](CONTRIBUTING.md)           | Contribution guidelines and branch conventions |

---

## Deployed Resources

> [!NOTE]
> The following resources are provisioned in AWS under the Free Tier. Resource IDs are environment-specific.

| Service            | Resource                     | Environment |
| ------------------ | ---------------------------- | ----------- |
| Amazon Cognito     | NeoFit-UserPool-dev          | dev         |
| Amazon DynamoDB    | NeoFit_MasterTable_dev       | dev         |
| Amazon API Gateway | NeoFit-Api-dev               | dev         |
| Amazon S3          | neofit-frontend-dev-\*       | dev         |
| Amazon SQS         | NeoFit-NotificationQueue-dev | dev         |
| Amazon SQS         | NeoFit-DLQ-dev               | dev         |

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full contribution guide, including:

- Local setup instructions
- Branch and commit naming conventions
- Pull request process
- Code style requirements

> [!IMPORTANT]
> All pull requests must pass the CI pipeline before merging. The pipeline enforces linting, formatting, TypeScript compilation, and CDK synthesis.

---

## License

Distributed under the MIT License. See [LICENSE](LICENSE) for full text.

---

**Author:** Juan C. Lopez · [GitHub](https://github.com/JuanEnC)
