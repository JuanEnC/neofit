# 🛠️ Local Development Setup

## Prerequisites

- **Node.js:** v18.0.0 or higher
- **pnpm:** v8.0.0 or higher
- **Git:** v2.0 or higher
- **AWS Account:** Free Tier account
- **GitHub Account:** For version control

## Installation Steps

### 1. Clone Repository

```bash
git clone https://github.com/YOUR_USERNAME/neofit.git
cd neofit
```

### 2. Install Dependencies

```bash
# Install pnpm if not already installed
npm install -g pnpm

# Install all dependencies in all workspaces
pnpm install
```

### 3. Create Environment Files

```bash
# Frontend environment
cp frontend/.env.example frontend/.env.local

# Backend environment
cp backend/.env.example backend/.env.local

# Infrastructure environment
cp infrastructure/.env.example infrastructure/.env.local
```

### 4. Configure AWS Credentials

```bash
# Install AWS CLI if needed
# https://aws.amazon.com/cli/

# Configure AWS credentials
aws configure

# You'll be prompted for:
# AWS Access Key ID: [your key]
# AWS Secret Access Key: [your secret]
# Default region: us-east-1
# Default output format: json
```

### 5. Verify Installation

```bash
# Check all tools installed
node --version    # Should be v18+
pnpm --version    # Should be v8+
git --version     # Should be v2+
aws --version     # Should show AWS CLI version

# Test linting
pnpm lint

# Test formatting
pnpm format:check
```

## Monorepo Structure

```
neofit/
├── frontend/          # Next.js + React application
├── backend/           # AWS Lambda functions
├── infrastructure/    # AWS CDK definitions
├── tests/             # Shared test utilities
└── docs/              # Documentation
```

## Common Commands

```bash
# Development
pnpm install           # Install dependencies
pnpm lint             # Run linter across workspaces
pnpm format           # Format code
pnpm test:unit        # Run unit tests
pnpm build            # Build all workspaces

# Frontend only
cd frontend
pnpm dev              # Start dev server (localhost:3000)
pnpm build            # Build for production
pnpm test:unit        # Run frontend tests

# Backend only
cd backend
pnpm dev              # Start local development
pnpm test:unit        # Run backend tests
pnpm lint             # Lint backend code

# Infrastructure
cd infrastructure
pnpm synth            # Synthesize CDK
pnpm deploy           # Deploy to AWS
```

## Troubleshooting

### "command not found: pnpm"

```bash
npm install -g pnpm
```

### "Module not found" errors

```bash
# Delete node_modules and reinstall
rm -rf node_modules
pnpm install
```

### AWS credentials not found

```bash
aws configure
# Follow the prompts to add your credentials
```

### Port 3000 already in use

```bash
# Find and kill process using port 3000
# On macOS/Linux:
lsof -i :3000
kill -9 <PID>

# On Windows:
netstat -ano | findstr :3000
taskkill /PID <PID> /F
```

## IDE Setup

### VS Code (Recommended)

Install extensions:

- ESLint
- Prettier - Code formatter
- Thunder Client (for API testing)
- AWS Toolkit
- TypeScript Vue Plugin

### Configuration

Create `.vscode/settings.json`:

```json
{
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "editor.formatOnSave": true,
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true
  },
  "[typescript]": {
    "editor.defaultFormatter": "esbenp.prettier-vscode"
  }
}
```

## Next Steps

1. Create your first feature branch: `git checkout -b feature/first-feature`
2. Read the [Contributing Guidelines](../CONTRIBUTING.md)
3. Check the [Roadmap](./ROADMAP.md) for task descriptions
4. Start with Phase 1 tasks

Happy coding! 🚀
