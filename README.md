# 🏋️ NeoFit - Gym Management System

> A modern, scalable SaaS platform for managing gym memberships, routines, and payments built with serverless architecture.

## 🎯 Project Overview

NeoFit is a full-stack web application designed to automate gym operations with:
- **User Management:** Client registration, authentication, and membership tracking
- **Dashboard:** Admin analytics and client management
- **Routines:** Comprehensive exercise catalog organized by muscle groups
- **Payments:** Secure payment processing with Stripe
- **Notifications:** Automated email reminders for membership renewals
- **Serverless Architecture:** Zero-cost infrastructure using AWS Free Tier

## 🚀 Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | Next.js 14, React, TypeScript, Tailwind CSS, Shadcn/UI |
| **Backend** | AWS Lambda, Node.js |
| **Database** | Amazon DynamoDB (Single Table Design) |
| **Authentication** | Amazon Cognito |
| **API** | Amazon API Gateway (HTTP API) |
| **Payments** | Stripe (Test Mode) |
| **Notifications** | AWS SES + SNS |
| **Infrastructure** | AWS CDK, TypeScript |
| **CI/CD** | GitHub Actions |
| **Testing** | Jest, Playwright |

## 📋 Project Structure
```
neofit/
├── frontend/          # Next.js application
│   ├── app/          # Next.js app router
│   ├── components/   # React components
│   ├── lib/          # Utilities and helpers
│   └── public/       # Static assets
├── backend/          # AWS Lambda functions
│   ├── src/
│   │   ├── lambdas/  # Lambda handlers
│   │   ├── database/ # DynamoDB operations
│   │   └── services/ # Business logic
│   └── tests/        # Unit tests
├── infrastructure/   # AWS CDK
│   ├── lib/         # CDK stack definitions
│   └── bin/         # CDK app entry point
├── tests/           # Integration & E2E tests
├── docs/            # Documentation
└── scripts/         # Utility scripts
```

## 🛠️ Quick Start

### Prerequisites
- Node.js v18+
- pnpm v8+
- AWS Account (Free Tier eligible)
- Stripe Account (Test Mode)

### Installation

```bash
# Clone repository
git clone https://github.com/YOUR_USERNAME/neofit.git
cd neofit

# Install dependencies
pnpm install

# Create environment files
cp .env.example .env.local
```

### Development

```bash
# Start frontend
cd frontend
pnpm dev

# In another terminal, start backend (local)
cd backend
pnpm dev
```

## 📚 Documentation

- [Architecture Guide](./docs/ARCHITECTURE.md)
- [Setup Instructions](./docs/SETUP.md)
- [API Documentation](./docs/API.md)
- [Deployment Guide](./docs/DEPLOYMENT.md)
- [Contributing Guidelines](./CONTRIBUTING.md)

## 🎯 Development Roadmap

This project follows a structured 10-week development plan with 7 phases:

1. **Phase 1:** Foundation & Infrastructure Setup
2. **Phase 2:** Backend Core & Data Modeling
3. **Phase 3:** Frontend MVP & Landing Page
4. **Phase 4:** Authentication & Integration
5. **Phase 5:** Advanced Features & Admin Dashboard
6. **Phase 6:** Testing, Documentation & Optimization
7. **Phase 7:** Deployment & Monitoring

[Full Roadmap →](./docs/ROADMAP.md)

## 🔐 Security

- All traffic encrypted with HTTPS/TLS 1.3
- No plaintext passwords stored
- Secrets managed via AWS Systems Manager Parameter Store
- Input validation with Zod schemas
- CORS policies strictly enforced
- Rate limiting enabled on API Gateway

## 📊 Features

- ✅ User registration with payment processing
- ✅ Client dashboard with workout routines
- ✅ Admin dashboard with analytics
- ✅ Real-time membership status tracking
- ✅ Automated email notifications
- ✅ Responsive design (mobile-first)
- ✅ Dark mode with neon accents

## 🤝 Contributing

Contributions are welcome! Please read [CONTRIBUTING.md](./CONTRIBUTING.md) first.

## 📝 License

MIT License - see [LICENSE](./LICENSE) file for details

## 👤 Author

**Your Name**
- GitHub: [@yourUsername](https://github.com/yourUsername)
- LinkedIn: [Your Profile](https://linkedin.com/in/yourprofile)

## 📞 Support

For issues and questions:
- Open an [Issue](https://github.com/YOUR_USERNAME/neofit/issues)
- Check [Discussions](https://github.com/YOUR_USERNAME/neofit/discussions)

---

**Last Updated:** 2026-05-31  
**Status:** 🚀 In Development (Phase 1)