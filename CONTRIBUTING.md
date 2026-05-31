
# Contributing to NeoFit

## Code Standards

### Commit Messages (Conventional Commits)

Follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:
```
<type>(<scope>): <subject>

<body> <footer> 
```

**Types:**

-   `feat:` - Nueva característica
-   `fix:` - Corrección de bug
-   `docs:` - Cambios en documentación
-   `style:` - Cambios de formato (no afectan lógica)
-   `refactor:` - Refactorización de código
-   `perf:` - Mejoras de performance
-   `test:` - Agregar o actualizar tests
-   `chore:` - Cambios en build, dependencies, etc.
-   `ci:` - Cambios en CI/CD

**Ejemplos:**

```
feat(auth): implement cognito login flow

Add support for Amazon Cognito authentication in the frontend.
Implement JWT token management and session persistence.

Closes #123
```

```
fix(api): handle empty response in users endpoint

Parse response correctly when no users are returned.

Fixes #456
```

```
docs: update README with quickstart instructions
```

### Branch Naming

```
feature/description          # Nueva característica
bugfix/description           # Corrección de bug
hotfix/description           # Hotfix urgente
refactor/description         # Refactorización
docs/description             # Cambios en documentación
```

**Ejemplos:**

-   `feature/cognito-integration`
-   `bugfix/payment-processing-error`
-   `docs/api-documentation`

## Pull Request Process

1.  Create feature branch from `develop`
2.  Make changes following code standards
3.  Add/update tests as needed
4.  Ensure all tests pass: `pnpm test:unit`
5.  Format code: `pnpm format`
6.  Create Pull Request with clear description
7.  Wait for review and CI checks to pass
8.  Merge to `develop`
9.  Rebase to `main` when ready for release

## Code Style

### ESLint & Prettier

bash

```bash
# Check code style
pnpm lint

# Format code automatically
pnpm format

# Check formatting without changing files
pnpm format:check
```

### TypeScript

-   Always use TypeScript, avoid `any`
-   Export types properly
-   Use interfaces for object shapes
-   Use enums for constants

### Testing

-   Unit tests required for business logic
-   Aim for 80%+ code coverage
-   Integration tests for API flows
-   E2E tests for critical user journeys

## Development Workflow

bash

```bash
# 1. Start new feature
git checkout develop
git pull origin develop
git checkout -b feature/my-feature

# 2. Make changes
# ... edit files ...

# 3. Test and format
pnpm lint
pnpm format
pnpm test:unit

# 4. Commit
git add .
git commit -m "feat(scope): description"

# 5. Push
git push origin feature/my-feature

# 6. Create Pull Request on GitHub
```

## Questions?

-   Check documentation: `./docs/`
-   Open a discussion: GitHub Discussions
-   Check existing issues: GitHub Issues