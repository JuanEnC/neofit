/**
 * DynamoDB Single Table Schema — NeoFit
 *
 * All entities share the same table (NeoFit_MasterTable).
 * Keys follow a prefixed composite pattern:
 *   PK: entity type + identifier    (e.g. USER#abc123)
 *   SK: record type + identifier    (e.g. METADATA, PAYMENT#xyz789)
 *
 * GSI1: Inverted index (SK → PK) for cross-entity queries
 * GSI2: EntityType + Timestamp for chronological financial queries
 */

// ─── Key Prefixes ─────────────────────────────────────────────────────────────

export const KEY_PREFIXES = {
  USER: 'USER#',
  PAYMENT: 'PAYMENT#',
  ROUTINE: 'ROUTINE#',
  EXERCISE: 'EXERCISE#',
} as const;

export const SORT_KEYS = {
  METADATA: 'METADATA',
} as const;

// ─── Domain Enums ─────────────────────────────────────────────────────────────

export type MemberStatus = 'Active' | 'Inactive' | 'Frozen';
export type UserRole = 'Client' | 'Admin';
export type PaymentStatus = 'Completed' | 'Failed' | 'Pending';
export type Difficulty = 'Beginner' | 'Intermediate' | 'Advanced';

export type MuscleGroup = 'Chest' | 'Back' | 'Legs' | 'Arms' | 'Shoulders' | 'Core' | 'Cardio';

// ─── Base DynamoDB Record ─────────────────────────────────────────────────────

/**
 * Fields present on every record in the table.
 * GSI2 attributes are optional; only payment records use them.
 */
interface DynamoBaseRecord {
  PK: string;
  SK: string;
  // GSI2 attributes — present on records that require chronological queries
  EntityType?: string;
  Timestamp?: string;
}

// ─── User / Member ────────────────────────────────────────────────────────────

/**
 * PK: USER#<userId>
 * SK: METADATA
 */
export interface UserRecord extends DynamoBaseRecord {
  SK: 'METADATA';
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
  status: MemberStatus;
  role: UserRole;
  stripeCustomerId: string;
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
}

// ─── Payment ──────────────────────────────────────────────────────────────────

/**
 * PK: USER#<userId>
 * SK: PAYMENT#<paymentId>
 * GSI2: EntityType = "PAYMENT", Timestamp = paymentDate
 */
export interface PaymentRecord extends DynamoBaseRecord {
  EntityType: 'PAYMENT';
  Timestamp: string; // paymentDate — enables GSI2 chronological queries
  paymentId: string;
  userId: string;
  amount: number; // in MXN cents (e.g. 69900 = $699.00 MXN)
  currency: 'MXN';
  paymentDate: string; // ISO 8601
  nextBillingDate: string; // ISO 8601
  stripePaymentIntentId: string;
  status: PaymentStatus;
}

// ─── Routine / Exercise ───────────────────────────────────────────────────────

/**
 * PK: ROUTINE#<muscleGroup>    (e.g. ROUTINE#Chest)
 * SK: EXERCISE#<exerciseId>
 *
 * No GSI required for muscle group queries — direct PK query:
 *   PK = "ROUTINE#Chest" AND begins_with(SK, "EXERCISE#")
 *
 * GSI1 handles the global exercise list:
 *   GSI1_PK begins_with "EXERCISE#"
 */
export interface RoutineRecord extends DynamoBaseRecord {
  exerciseId: string;
  exerciseName: string;
  muscleGroup: MuscleGroup;
  sets: number;
  reps: number;
  restSeconds: number; // rest between sets in seconds
  difficulty: Difficulty;
  description: string;
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
}

// ─── Union Type ───────────────────────────────────────────────────────────────

/** Union of all record shapes stored in the table */
export type NeoFitRecord = UserRecord | PaymentRecord | RoutineRecord;

// ─── Domain Objects (without DynamoDB keys) ───────────────────────────────────

/**
 * Plain domain objects returned from repositories to controllers.
 * These omit PK/SK/GSI fields — callers work with domain concepts only.
 */
export type User = Omit<UserRecord, 'PK' | 'SK' | 'EntityType' | 'Timestamp'>;

export type Payment = Omit<PaymentRecord, 'PK' | 'SK' | 'EntityType' | 'Timestamp'>;

export type Routine = Omit<RoutineRecord, 'PK' | 'SK' | 'EntityType' | 'Timestamp'>;

// ─── Input Types (for create / update operations) ────────────────────────────

/** Fields required to create a new user (IDs and timestamps generated at runtime) */
export type CreateUserInput = Omit<
  User,
  'userId' | 'createdAt' | 'updatedAt' | 'stripeCustomerId'
> & {
  stripeCustomerId?: string;
};

/** Fields that a client may update on their own profile */
export type UpdateUserInput = Partial<Pick<User, 'firstName' | 'lastName' | 'phone'>>;

/** Fields required to create a payment record */
export type CreatePaymentInput = Omit<Payment, 'paymentId' | 'paymentDate'>;

/** Fields required to create a new exercise */
export type CreateRoutineInput = Omit<Routine, 'exerciseId' | 'createdAt' | 'updatedAt'>;

/** Fields that an admin may update on an exercise */
export type UpdateRoutineInput = Partial<
  Omit<Routine, 'exerciseId' | 'muscleGroup' | 'createdAt' | 'updatedAt'>
>;

// ─── Table Constants ──────────────────────────────────────────────────────────

export const TABLE_NAME = process.env.DYNAMODB_TABLE_NAME ?? 'NeoFit_MasterTable_dev';

export const INDEX_NAMES = {
  GSI1: 'GSI1',
  GSI2: 'GSI2',
} as const;
