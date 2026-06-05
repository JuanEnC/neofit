/**
 * Unit tests for DynamoDB schema types and key helpers.
 * These tests verify key construction, parsing, and type guards
 * without touching AWS — no mocks required.
 */

import {
  userKeys,
  paymentKeys,
  routineKeys,
  parseId,
  parsePrefix,
  isUserKey,
  isPaymentKey,
  isRoutineKey,
} from '../keys';

import { KEY_PREFIXES, SORT_KEYS, TABLE_NAME } from '../schema';

// ─── Key Helpers ──────────────────────────────────────────────────────────────

describe('userKeys', () => {
  const userId = 'abc-123';

  it('builds the correct partition key', () => {
    expect(userKeys.pk(userId)).toBe(`USER#${userId}`);
  });

  it('uses METADATA as the sort key', () => {
    expect(userKeys.sk()).toBe(SORT_KEYS.METADATA);
  });

  it('primary() returns both keys as an object', () => {
    expect(userKeys.primary(userId)).toEqual({
      PK: `USER#${userId}`,
      SK: 'METADATA',
    });
  });
});

describe('paymentKeys', () => {
  const userId = 'user-456';
  const paymentId = 'pay-789';

  it('builds partition key from userId', () => {
    expect(paymentKeys.pk(userId)).toBe(`USER#${userId}`);
  });

  it('builds sort key from paymentId', () => {
    expect(paymentKeys.sk(paymentId)).toBe(`PAYMENT#${paymentId}`);
  });

  it('primary() returns both keys', () => {
    expect(paymentKeys.primary(userId, paymentId)).toEqual({
      PK: `USER#${userId}`,
      SK: `PAYMENT#${paymentId}`,
    });
  });
});

describe('routineKeys', () => {
  const muscleGroup = 'Chest' as const;
  const exerciseId = 'ex-321';

  it('builds partition key from muscleGroup', () => {
    expect(routineKeys.pk(muscleGroup)).toBe('ROUTINE#Chest');
  });

  it('builds sort key from exerciseId', () => {
    expect(routineKeys.sk(exerciseId)).toBe(`EXERCISE#${exerciseId}`);
  });

  it('primary() returns both keys', () => {
    expect(routineKeys.primary(muscleGroup, exerciseId)).toEqual({
      PK: 'ROUTINE#Chest',
      SK: `EXERCISE#${exerciseId}`,
    });
  });
});

// ─── Key Parsers ──────────────────────────────────────────────────────────────

describe('parseId', () => {
  it('strips the prefix from a simple key', () => {
    expect(parseId('USER#abc-123')).toBe('abc-123');
  });

  it('handles UUIDs with multiple hyphens', () => {
    const uuid = '550e8400-e29b-41d4-a716-446655440000';
    expect(parseId(`PAYMENT#${uuid}`)).toBe(uuid);
  });

  it('handles keys where the ID itself contains a #', () => {
    expect(parseId('USER#abc#sub')).toBe('abc#sub');
  });
});

describe('parsePrefix', () => {
  it('extracts the prefix correctly', () => {
    expect(parsePrefix('USER#abc')).toBe('USER');
    expect(parsePrefix('PAYMENT#xyz')).toBe('PAYMENT');
    expect(parsePrefix('ROUTINE#Chest')).toBe('ROUTINE');
    expect(parsePrefix('EXERCISE#ex-1')).toBe('EXERCISE');
  });
});

// ─── Type Guards ──────────────────────────────────────────────────────────────

describe('isUserKey', () => {
  it('returns true for user PKs', () => {
    expect(isUserKey('USER#abc-123')).toBe(true);
  });

  it('returns false for non-user keys', () => {
    expect(isUserKey('PAYMENT#abc-123')).toBe(false);
    expect(isUserKey('ROUTINE#Chest')).toBe(false);
  });
});

describe('isPaymentKey', () => {
  it('returns true for payment SKs', () => {
    expect(isPaymentKey('PAYMENT#pay-789')).toBe(true);
  });

  it('returns false for non-payment keys', () => {
    expect(isPaymentKey('METADATA')).toBe(false);
    expect(isPaymentKey('USER#abc')).toBe(false);
  });
});

describe('isRoutineKey', () => {
  it('returns true for routine PKs', () => {
    expect(isRoutineKey('ROUTINE#Chest')).toBe(true);
    expect(isRoutineKey('ROUTINE#Back')).toBe(true);
  });

  it('returns false for non-routine keys', () => {
    expect(isRoutineKey('USER#abc')).toBe(false);
    expect(isRoutineKey('EXERCISE#ex-1')).toBe(false);
  });
});

// ─── Schema Constants ─────────────────────────────────────────────────────────

describe('KEY_PREFIXES', () => {
  it('exports the expected prefix values', () => {
    expect(KEY_PREFIXES.USER).toBe('USER#');
    expect(KEY_PREFIXES.PAYMENT).toBe('PAYMENT#');
    expect(KEY_PREFIXES.ROUTINE).toBe('ROUTINE#');
    expect(KEY_PREFIXES.EXERCISE).toBe('EXERCISE#');
  });
});

describe('TABLE_NAME', () => {
  it('falls back to NeoFit_MasterTable_dev when env var is absent', () => {
    // The env var is not set in unit tests
    expect(TABLE_NAME).toBe('NeoFit_MasterTable_dev');
  });
});
