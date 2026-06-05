/**
 * DynamoDB Key Helpers
 *
 * All PK/SK construction goes through these functions so that
 * key formats are consistent across every repository.
 *
 * Pattern:  PREFIX#identifier
 */

import { KEY_PREFIXES, SORT_KEYS, type MuscleGroup } from './schema';

// ─── User Keys ────────────────────────────────────────────────────────────────

export const userKeys = {
  /** Primary key for a user's metadata record */
  pk: (userId: string) => `${KEY_PREFIXES.USER}${userId}`,
  sk: () => SORT_KEYS.METADATA,

  /** Key object ready to pass to GetCommand / DeleteCommand */
  primary: (userId: string) => ({
    PK: userKeys.pk(userId),
    SK: userKeys.sk(),
  }),
};

// ─── Payment Keys ─────────────────────────────────────────────────────────────

export const paymentKeys = {
  /** Partition key is the user who made the payment */
  pk: (userId: string) => `${KEY_PREFIXES.USER}${userId}`,
  sk: (paymentId: string) => `${KEY_PREFIXES.PAYMENT}${paymentId}`,

  primary: (userId: string, paymentId: string) => ({
    PK: paymentKeys.pk(userId),
    SK: paymentKeys.sk(paymentId),
  }),
};

// ─── Routine / Exercise Keys ──────────────────────────────────────────────────

export const routineKeys = {
  /**
   * Partition key groups all exercises by muscle group.
   * Querying PK = ROUTINE#Chest returns every chest exercise
   * without a GSI — this is the primary access pattern.
   */
  pk: (muscleGroup: MuscleGroup) => `${KEY_PREFIXES.ROUTINE}${muscleGroup}`,

  sk: (exerciseId: string) => `${KEY_PREFIXES.EXERCISE}${exerciseId}`,

  primary: (muscleGroup: MuscleGroup, exerciseId: string) => ({
    PK: routineKeys.pk(muscleGroup),
    SK: routineKeys.sk(exerciseId),
  }),
};

// ─── Key Parsers ──────────────────────────────────────────────────────────────

/**
 * Extract the plain identifier from a prefixed key.
 *
 * @example
 *   parseId('USER#abc-123')     → 'abc-123'
 *   parseId('PAYMENT#xyz-789')  → 'xyz-789'
 */
export const parseId = (key: string): string => {
  const parts = key.split('#');
  // Return everything after the first '#' to support IDs that contain '#'
  return parts.slice(1).join('#');
};

/**
 * Extract the prefix from a key (e.g. 'USER', 'PAYMENT').
 */
export const parsePrefix = (key: string): string => {
  return key.split('#')[0] ?? '';
};

/**
 * Type-guard: check if a PK belongs to a user record.
 */
export const isUserKey = (pk: string): boolean => pk.startsWith(KEY_PREFIXES.USER);

/**
 * Type-guard: check if a SK belongs to a payment record.
 */
export const isPaymentKey = (sk: string): boolean => sk.startsWith(KEY_PREFIXES.PAYMENT);

/**
 * Type-guard: check if a PK belongs to a routine/muscle-group record.
 */
export const isRoutineKey = (pk: string): boolean => pk.startsWith(KEY_PREFIXES.ROUTINE);
