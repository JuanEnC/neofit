import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',

  // Use the test-specific tsconfig that includes @types/jest
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

  collectCoverageFrom: ['src/**/*.ts', '!src/**/*.d.ts', '!src/index.ts', '!src/database/seed.ts'],
  coverageThreshold: {
    global: {
      lines: 80,
      functions: 80,
      branches: 75,
      statements: 80,
    },
  },
  coverageReporters: ['text', 'lcov', 'html'],

  clearMocks: true,
  restoreMocks: true,
};

export default config;
