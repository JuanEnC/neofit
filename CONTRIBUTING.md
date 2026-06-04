# Contributing to NeoFit

Thank you for taking the time to contribute. This document covers everything you need to know before opening a pull request.

---

## Table of Contents

- [Development Setup](#development-setup)
- [Branch Conventions](#branch-conventions)
- [Commit Conventions](#commit-conventions)
- [Code Style](#code-style)
- [Pull Request Process](#pull-request-process)
- [Testing Requirements](#testing-requirements)

---

## Development Setup

Follow the instructions in [docs/SETUP.md](docs/SETUP.md) to configure your local environment before making any changes.

---

## Branch Conventions

Branch off `develop` for all new work. Never commit directly to `main`.

| Prefix      | Use case                             | Example                              |
| ----------- | ------------------------------------ | ------------------------------------ |
| `feature/`  | New functionality                    | `feature/cognito-auth-integration`   |
| `bugfix/`   | Non-critical bug fix                 | `bugfix/payment-webhook-parsing`     |
| `hotfix/`   | Critical production fix              | `hotfix/membership-expiry-query`     |
| `refactor/` | Code restructure, no behavior change | `refactor/dynamo-repository-pattern` |
| `docs/`     | Documentation only                   | `docs/architecture-diagram`          |
| `ci/`       | CI/CD pipeline changes               | `ci/add-e2e-workflow`                |

```bash
# Start a new feature
git checkout develop
git pull origin develop
git checkout -b feature/my-feature
```

---

## Commit Conventions

This project follows [Conventional Commits](https://www.conventionalcommits.org). Every commit message must match this format:

```
<type>(<scope>): <short description>

[optional body]

[optional footer: Closes #issue]
```

### Types

| Type       | When to use                              |
| ---------- | ---------------------------------------- |
| `feat`     | Adds a new feature                       |
| `fix`      | Fixes a bug                              |
| `docs`     | Documentation changes only               |
| `style`    | Formatting, whitespace — no logic change |
| `refactor` | Code restructure without behavior change |
| `perf`     | Performance improvements                 |
| `test`     | Adding or modifying tests                |
| `chore`    | Build scripts, dependency updates        |
| `ci`       | CI/CD configuration changes              |

### Scopes

Use the affected workspace or domain:

`auth` · `users` · `payments` · `routines` · `notifications` · `infrastructure` · `frontend` · `ci` · `docs`

### Examples

```
feat(payments): implement Stripe webhook handler

Process payment_intent.succeeded and payment_intent.payment_failed
events. Update DynamoDB membership status on success.

Closes #42
```

```
fix(auth): handle expired Cognito token on silent refresh
```

```
ci: install AWS CDK before CDK synthesis in type-check job
```

```
docs(architecture): add DynamoDB access patterns table
```

---

## Code Style

Formatting and linting are enforced automatically by the CI pipeline. All checks must pass before a PR can be merged.

### Run locally before pushing

```bash
pnpm lint          # must exit with code 0
pnpm format:check  # must exit with code 0
pnpm build         # must compile without errors
```

### Fix formatting

```bash
pnpm format        # auto-format all files
```

### Key rules

- TypeScript strict mode is enabled — no `any` without explicit justification
- Every public function should have a JSDoc comment if its purpose is not immediately obvious from the name
- Comments explain _why_, not _what_ — the code explains what
- No `console.log` in production code — use structured logging via `console.info` / `console.error`

---

## Pull Request Process

1. **Branch** — create from `develop` using the naming conventions above
2. **Implement** — write code following the style guidelines
3. **Test** — ensure all existing tests pass and add tests for new behavior
4. **Format** — run `pnpm format` and `pnpm lint`
5. **Push** — `git push origin feature/your-feature`
6. **Open PR** — target `develop`, not `main`
7. **CI** — all pipeline checks must pass (lint, type-check, build)
8. **Review** — address any review comments
9. **Merge** — squash and merge once approved

### PR description template

```markdown
## What this PR does

Brief description of the change.

## Why

Motivation or context (link to issue if applicable).

## How to test

Steps to verify the behavior manually.

## Checklist

- [ ] Tests added or updated
- [ ] `pnpm lint` passes
- [ ] `pnpm format:check` passes
- [ ] `pnpm build` compiles without errors
```

> [!IMPORTANT]
> PRs that fail the CI pipeline will not be reviewed until the pipeline passes.

---

## Testing Requirements

> [!NOTE]
> Unit and integration tests are introduced in Phase 2. This section will be updated with specific requirements as the test suite is built out.

- Unit test coverage must remain above 80% after any change to business logic
- New Lambda handlers must include unit tests with mocked AWS SDK calls
- Integration tests must cover the full request/response cycle for new routes

Run tests locally:

```bash
pnpm test:unit           # unit tests only
pnpm test:integration    # integration tests (Phase 2+)
```

---

_For architecture and infrastructure details, see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)._
