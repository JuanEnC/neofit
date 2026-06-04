# Architecture — NeoFit

This document describes the system architecture, infrastructure decisions, data model, and service interactions for the NeoFit platform.

---

## Table of Contents

- [Architectural Philosophy](#architectural-philosophy)
- [Infrastructure Overview](#infrastructure-overview)
- [Service Breakdown](#service-breakdown)
- [Data Model (DynamoDB)](#data-model-dynamodb)
- [API Gateway Routes](#api-gateway-routes)
- [Authentication Flow](#authentication-flow)
- [Notification Flow](#notification-flow)
- [Observability](#observability)
- [Security Layers](#security-layers)

---

## Architectural Philosophy

NeoFit is built on three constraints that drive every decision:

1. **Zero persistent servers.** All compute is event-driven Lambda. No EC2, no containers.
2. **Free Tier first.** Every service selection is bounded by AWS Free Tier limits.
3. **Microservice boundaries.** Each domain (users, payments, routines, notifications) is an independent Lambda function connected to a dedicated API Gateway route.

---

## Infrastructure Overview

```
┌──────────────────────────────────────────────────────────────────────┐
│                          INTERNET                                    │
└─────────────────────────┬────────────────────────────────────────────┘
                          │ HTTPS / TLS 1.3
                          ▼
┌──────────────────────────────────────────────────────────────────────┐
│                    Next.js Frontend                                  │
│              Vercel (prod) / localhost:3000 (dev)                    │
│                                                                      │
│  Pages:  Landing · Signup · Login · Dashboard · Admin                │
└─────────────────────────┬────────────────────────────────────────────┘
                          │ HTTPS / Bearer JWT
                          ▼
┌──────────────────────────────────────────────────────────────────────┐
│           Amazon API Gateway — HTTP API (NeoFit-Api-dev)             │
│                                                                      │
│  CORS: restricted to frontend domain                                 │
│  Auth: Lambda Authorizer validates Cognito JWT                       │
│  Rate: 10 RPS per IP (throttling)                                    │
└──────┬──────────┬──────────┬──────────┬──────────────────────────────┘
       │          │          │          │
       ▼          ▼          ▼          ▼
  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌───────────────┐
  │  Users  │ │Payments │ │Routines │ │ Notifications │
  │ Lambda  │ │ Lambda  │ │ Lambda  │ │    Lambda     │
  └────┬────┘ └────┬────┘ └────┬────┘ └───────┬───────┘
       │           │           │               │
       └───────────┴───────────┘               │
                   │                           │
                   ▼                           ▼
  ┌─────────────────────────────┐   ┌───────────────────────┐
  │  DynamoDB NeoFit_MasterTable│   │    Amazon SES         │
  │  Single Table Design        │   │  (transactional email)│
  │  GSI1 · GSI2                │   └───────────────────────┘
  └─────────────────────────────┘
                   ▲
       ┌───────────┘
       │
  ┌────┴────────────────┐     ┌──────────────────────┐
  │   Amazon Cognito    │     │  Amazon EventBridge  │
  │   User Pool         │     │  Daily cron 12:00 UTC│
  │   JWT management    │     │  → SQS → Lambda      │
  └─────────────────────┘     └──────────────────────┘

  ┌─────────────────────────────────────────────────────┐
  │              Supporting Infrastructure              │
  │                                                     │
  │  AWS SSM Parameter Store  — Stripe keys, JWT secret │
  │  Amazon SQS (DLQ)         — Failed notification     │
  │                              retry buffer           │
  │  Amazon S3                — Frontend static assets  │
  │  Amazon CloudWatch        — Structured logs,        │
  │                              metrics dashboard      │
  │  AWS X-Ray                — Distributed tracing     │
  └─────────────────────────────────────────────────────┘
```

---

## Service Breakdown

### Amazon Cognito — Authentication

- Manages user registration, login, and JWT issuance
- Password policy: 8+ chars, uppercase, lowercase, digits required
- Account recovery via email only
- User groups: `Client` and `Admin` (max 3 admin accounts)
- Free tier: 50,000 MAU

### Amazon API Gateway — HTTP API

- HTTP API (v2) — lower latency and cost than REST API
- Routes map to individual Lambda functions per domain
- JWT authorizer validates Cognito tokens on protected routes
- CORS restricted to the frontend domain in production
- Throttling: 10 RPS sustained per IP to protect Free Tier budget

### AWS Lambda — Backend Logic

Four independent functions, each scoped to a single domain:

| Function                | Trigger                      | Responsibility                              |
| ----------------------- | ---------------------------- | ------------------------------------------- |
| `users-handler`         | API Gateway                  | CRUD operations, status changes             |
| `payments-handler`      | API Gateway + Stripe Webhook | Payment Intent creation, webhook processing |
| `routines-handler`      | API Gateway                  | Exercise catalog management                 |
| `notifications-handler` | SQS                          | Send renewal reminder emails via SES        |

All functions share:

- A common execution role (`NeoFit-LambdaRole-dev`)
- Structured JSON logging to CloudWatch
- AWS X-Ray tracing enabled
- Input validation via Zod schemas (Phase 2)

### Amazon DynamoDB — Database

- Single-table design (`NeoFit_MasterTable_dev`)
- Billing mode: PAY_PER_REQUEST (no pre-provisioned capacity)
- Encryption at rest: AWS-managed keys (AES-256)
- Streams enabled for future event-sourcing patterns
- Free tier: 25 GB storage, 25 WCU + 25 RCU

### Amazon SES — Email

- Transactional email for membership renewal reminders
- Sender: `noreply@neofit.local` (sandbox mode during development)
- Invoked by the Notifications Lambda

### Amazon SQS — Message Queue

Two queues:

| Queue                          | Purpose                                    |
| ------------------------------ | ------------------------------------------ |
| `NeoFit-NotificationQueue-dev` | Buffer for notification Lambda invocations |
| `NeoFit-DLQ-dev`               | Captures failed messages for manual retry  |

Dead Letter Queue policy: max 3 receive attempts, 7-day retention.

### Amazon EventBridge — Scheduler

- Daily cron rule: `12:00 UTC` (06:00 AM UTC-6)
- Target: `NeoFit-NotificationQueue-dev`
- Lambda reads from queue, identifies memberships expiring in ≤5 days, sends email via SES

### AWS Systems Manager Parameter Store

All secrets are stored as `SecureString` parameters under `/neofit/*`:

| Parameter                       | Description                   |
| ------------------------------- | ----------------------------- |
| `/neofit/stripe/secret-key`     | Stripe Secret Key             |
| `/neofit/stripe/webhook-secret` | Stripe Webhook Signing Secret |
| `/neofit/jwt/secret`            | Internal JWT signing secret   |

Lambda execution role has `ssm:GetParameter` permission scoped to `/neofit/*` only.

---

## Data Model (DynamoDB)

NeoFit uses a **Single Table Design** to minimize DynamoDB costs and maximize query efficiency.

### Table: `NeoFit_MasterTable_dev`

| Attribute    | Type   | Description                            |
| ------------ | ------ | -------------------------------------- |
| `PK`         | String | Partition key — entity type + ID       |
| `SK`         | String | Sort key — metadata or related entity  |
| `EntityType` | String | Used by GSI2 for chronological queries |
| `Timestamp`  | String | ISO 8601 creation timestamp            |

### Entity Patterns

**User / Client record**

```
PK: USER#<UserId>
SK: METADATA

Attributes:
  email, firstName, lastName, phone
  status:          "Active" | "Inactive" | "Frozen"
  stripeCustomerId: string
  role:            "Client" | "Admin"
  createdAt, updatedAt: ISO 8601
```

**Payment record**

```
PK: USER#<UserId>
SK: PAYMENT#<PaymentId>

Attributes:
  amount:             number (MXN cents)
  currency:           "MXN"
  paymentDate:        ISO 8601
  nextBillingDate:    ISO 8601
  stripePaymentIntentId: string
  status:             "Completed" | "Failed" | "Pending"
```

**Exercise / Routine record**

```
PK: ROUTINE#<MuscleGroup>
SK: EXERCISE#<ExerciseId>

Attributes:
  exerciseName: string
  sets, reps:   number
  difficulty:   "Beginner" | "Intermediate" | "Advanced"
  description:  string
  createdAt:    ISO 8601
```

### Global Secondary Indexes

**GSI1 — Inverted index (polymorphic entity queries)**

```
GSI1_PK: SK
GSI1_SK: PK
Projection: ALL

Use case: List all exercises globally across muscle groups.
  Query: GSI1_PK begins_with "EXERCISE#"
```

**GSI2 — Chronological index (financial reports)**

```
GSI2_PK: EntityType   (e.g. "PAYMENT")
GSI2_SK: Timestamp
Projection: KEYS_ONLY

Use case: Fetch all payments in date range for admin analytics.
  No table scan required — direct chronological query.
```

> [!NOTE]
> Querying routines by muscle group (`PK = ROUTINE#Chest`, `SK begins_with "EXERCISE#"`) does not require a GSI. The primary key structure handles this pattern directly.

---

## API Gateway Routes

Full documentation: [docs/API.md](API.md) (available Phase 2)

**Planned route structure:**

```
POST   /auth/signup
POST   /auth/login

GET    /users/profile
PUT    /users/profile
PATCH  /users/{id}/status       [Admin]

POST   /payments/intent
POST   /payments/webhook        [Stripe signature]
GET    /payments/history
POST   /payments/renewal/{id}   [Admin]

GET    /routines
GET    /routines/group/{muscle}
POST   /routines                [Admin]
PUT    /routines/{id}           [Admin]
DELETE /routines/{id}           [Admin]

POST   /notifications/send      [Admin]
```

---

## Authentication Flow

```
1. User submits email + password
         │
         ▼
2. Frontend calls Cognito
   (aws-amplify: Auth.signIn)
         │
         ▼
3. Cognito returns JWT tokens
   (accessToken, idToken, refreshToken)
         │
         ▼
4. Frontend stores tokens in memory
   (not localStorage — XSS protection)
         │
         ▼
5. Every API request includes:
   Authorization: Bearer <idToken>
         │
         ▼
6. API Gateway Lambda Authorizer
   validates token signature and expiry
         │
         ├─ Valid → pass claims to Lambda
         └─ Invalid → 401 Unauthorized
```

---

## Notification Flow

```
EventBridge cron (daily 06:00 AM UTC-6)
         │
         ▼
SQS: NeoFit-NotificationQueue-dev
         │
         ▼
Notifications Lambda
         │
         ├── Query DynamoDB: memberships expiring in ≤5 days
         │   (GSI2: EntityType = "PAYMENT", Timestamp range)
         │
         ├── For each expiring member → send email via SES
         │
         └── On Lambda failure → message routed to DLQ
                  │
                  └── Manual retry available
                      (7-day retention window)
```

---

## Observability

### CloudWatch Logs

All Lambda functions use structured JSON logging:

```json
{
  "level": "info",
  "message": "Payment intent created",
  "userId": "USER#abc123",
  "paymentIntentId": "pi_xxx",
  "timestamp": "2026-06-03T12:00:00Z"
}
```

Log groups:

- `/aws/lambda/NeoFit-dev` — All function logs
- `/aws/apigateway/NeoFit-dev` — API access logs

Retention: 14 days (dev), 30 days (prod)

### CloudWatch Metrics Dashboard

| Metric                      | Alert Threshold     |
| --------------------------- | ------------------- |
| Lambda Error Rate           | > 5% over 5 minutes |
| API Gateway 5xx             | > 1% over 5 minutes |
| DynamoDB Throttled Requests | > 0 in 5 minutes    |
| Lambda p99 Duration         | > 2000ms            |

### AWS X-Ray

Distributed tracing enabled on:

- API Gateway (all routes)
- All Lambda functions

Provides service maps showing latency across: `Cognito → API Gateway → Lambda → DynamoDB`

---

## Security Layers

| Layer            | Control                                              |
| ---------------- | ---------------------------------------------------- |
| Transport        | HTTPS / TLS 1.3 enforced on all endpoints            |
| Authentication   | Cognito JWT tokens, verified on every request        |
| Authorization    | Lambda Authorizer checks user role claims            |
| Input validation | Zod schemas in Lambda controllers (Phase 2)          |
| Secrets          | AWS SSM Parameter Store, never in source code        |
| CORS             | Restricted to frontend domain only                   |
| Rate limiting    | API Gateway throttling: 10 RPS per IP                |
| Data at rest     | DynamoDB AES-256 encryption (AWS-managed)            |
| Payment data     | Delegated entirely to Stripe — no card data in DB    |
| Passwords        | Delegated entirely to Cognito — no plaintext storage |

> [!CAUTION]
> Never commit AWS credentials, Stripe keys, or JWT secrets to the repository. All sensitive values must go through AWS SSM Parameter Store.

---

## Infrastructure as Code

All resources are defined in:

```
infrastructure/lib/infrastructure-stack.ts
```

Deploy command:

```bash
cd infrastructure
cdk deploy --context environment=dev
```

Environment-specific behavior is controlled via CDK context:

| Context key           | dev            | prod       |
| --------------------- | -------------- | ---------- |
| `removalPolicy`       | DESTROY        | RETAIN     |
| `pointInTimeRecovery` | false          | true       |
| `logRetention`        | 14 days        | 30 days    |
| `corsOrigins`         | localhost:3000 | neofit.com |

---

_Last updated: 2026-06-03_
