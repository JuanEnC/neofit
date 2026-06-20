import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',

  globals: {
    'ts-jest': {
      tsconfig: 'tsconfig.test.json',
      isolatedModules: true,
    },
  },

  testMatch: ['**/__tests__/**/*.test.ts', '**/*.test.ts'],

  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },

  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/index.ts',
    '!src/database/seed.ts',
    // Excluded from coverage — tested via integration tests in Phase 2.6
    '!src/lambdas/*/handler.ts',
    '!src/shared/response.ts',
    // Stripe and SSM require live credentials — mocked at call site in controller tests
    '!src/lambdas/payments/stripe.ts',
    '!src/shared/ssm.ts',
  ],

  coverageThreshold: {
    global: {
      lines: 80,
      functions: 75,
      branches: 55, // raised after excluding stripe/ssm
      statements: 80,
    },
  },

  coverageReporters: ['text', 'lcov', 'html'],
  clearMocks: true,
  restoreMocks: true,
};

export default config;
