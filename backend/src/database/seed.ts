/**
 * Database Seed Script
 *
 * Populates NeoFit_MasterTable with initial sample data for development.
 * Idempotent: repeated runs overwrite existing items with the same keys.
 *
 * Usage:
 *   pnpm seed              — seeds against the deployed AWS table
 *   pnpm seed:local        — seeds against dynamodb-local (localhost:8000)
 */

import { randomUUID } from 'crypto';
import { putItem } from './client';
import { userKeys, paymentKeys, routineKeys } from './keys';
import {
  TABLE_NAME,
  type UserRecord,
  type PaymentRecord,
  type RoutineRecord,
  type MuscleGroup,
  type Difficulty,
} from './schema';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const now = new Date().toISOString();

function addDays(date: Date, days: number): string {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

// ─── Sample Users ─────────────────────────────────────────────────────────────

const ADMIN_ID = 'admin-001';
const CLIENT_ID = 'client-001';

const users: UserRecord[] = [
  {
    PK: userKeys.pk(ADMIN_ID),
    SK: 'METADATA',
    userId: ADMIN_ID,
    email: 'admin@neofit.dev',
    firstName: 'Admin',
    lastName: 'NeoFit',
    phone: '+521234567890',
    status: 'Active',
    role: 'Admin',
    stripeCustomerId: 'cus_admin_placeholder',
    createdAt: now,
    updatedAt: now,
  },
  {
    PK: userKeys.pk(CLIENT_ID),
    SK: 'METADATA',
    userId: CLIENT_ID,
    email: 'client@neofit.dev',
    firstName: 'Juan',
    lastName: 'López',
    phone: '+529876543210',
    status: 'Active',
    role: 'Client',
    stripeCustomerId: 'cus_test_placeholder',
    createdAt: now,
    updatedAt: now,
  },
];

// ─── Sample Payments ──────────────────────────────────────────────────────────

const PAYMENT_ID = 'pay-001';

const payments: PaymentRecord[] = [
  {
    PK: paymentKeys.pk(CLIENT_ID),
    SK: paymentKeys.sk(PAYMENT_ID),
    EntityType: 'PAYMENT',
    Timestamp: now,
    paymentId: PAYMENT_ID,
    userId: CLIENT_ID,
    amount: 69900, // $699.00 MXN in cents
    currency: 'MXN',
    paymentDate: now,
    nextBillingDate: addDays(new Date(), 30),
    stripePaymentIntentId: 'pi_test_placeholder',
    status: 'Completed',
  },
];

// ─── Sample Routines ──────────────────────────────────────────────────────────

interface ExerciseSeed {
  name: string;
  muscleGroup: MuscleGroup;
  sets: number;
  reps: number;
  restSeconds: number;
  difficulty: Difficulty;
  description: string;
}

const exercises: ExerciseSeed[] = [
  // Chest
  {
    name: 'Barbell Bench Press',
    muscleGroup: 'Chest',
    sets: 4,
    reps: 8,
    restSeconds: 90,
    difficulty: 'Intermediate',
    description:
      'Lie on a flat bench. Grip the bar slightly wider than shoulder-width. Lower to the chest and press explosively.',
  },
  {
    name: 'Incline Dumbbell Press',
    muscleGroup: 'Chest',
    sets: 3,
    reps: 12,
    restSeconds: 60,
    difficulty: 'Intermediate',
    description:
      'Set bench to 30-45°. Press dumbbells from chest level, focus on upper pectoral contraction.',
  },
  {
    name: 'Push-Up',
    muscleGroup: 'Chest',
    sets: 3,
    reps: 15,
    restSeconds: 45,
    difficulty: 'Beginner',
    description:
      'Hands shoulder-width apart, body in a straight line. Lower chest to floor and push back.',
  },
  {
    name: 'Cable Fly',
    muscleGroup: 'Chest',
    sets: 3,
    reps: 15,
    restSeconds: 60,
    difficulty: 'Intermediate',
    description:
      'Using a cable machine, bring handles together in a wide arc. Emphasizes chest stretch at full extension.',
  },

  // Back
  {
    name: 'Barbell Deadlift',
    muscleGroup: 'Back',
    sets: 4,
    reps: 5,
    restSeconds: 120,
    difficulty: 'Advanced',
    description:
      'Hinge at hips, keep back neutral. Drive through heels and lock out at the top. Compound movement.',
  },
  {
    name: 'Pull-Up',
    muscleGroup: 'Back',
    sets: 3,
    reps: 8,
    restSeconds: 90,
    difficulty: 'Intermediate',
    description:
      'Dead hang grip, pull chin above bar. Initiate with scapular retraction before elbow drive.',
  },
  {
    name: 'Seated Cable Row',
    muscleGroup: 'Back',
    sets: 3,
    reps: 12,
    restSeconds: 60,
    difficulty: 'Beginner',
    description:
      'Sit upright, pull handle to lower chest. Squeeze shoulder blades together at full contraction.',
  },
  {
    name: 'Lat Pulldown',
    muscleGroup: 'Back',
    sets: 3,
    reps: 12,
    restSeconds: 60,
    difficulty: 'Beginner',
    description: 'Pull bar to upper chest. Lean slightly back, drive elbows down and back.',
  },

  // Legs
  {
    name: 'Barbell Back Squat',
    muscleGroup: 'Legs',
    sets: 4,
    reps: 8,
    restSeconds: 120,
    difficulty: 'Intermediate',
    description:
      'Bar on upper traps, feet shoulder-width. Squat until thighs are parallel to floor. Drive through heels.',
  },
  {
    name: 'Romanian Deadlift',
    muscleGroup: 'Legs',
    sets: 3,
    reps: 10,
    restSeconds: 90,
    difficulty: 'Intermediate',
    description:
      'Hinge at hips with soft knees. Lower barbell along legs until hamstring stretch, return to standing.',
  },
  {
    name: 'Leg Press',
    muscleGroup: 'Legs',
    sets: 3,
    reps: 15,
    restSeconds: 60,
    difficulty: 'Beginner',
    description:
      'Feet hip-width on platform. Press until legs are nearly extended. Control the descent.',
  },
  {
    name: 'Walking Lunge',
    muscleGroup: 'Legs',
    sets: 3,
    reps: 20,
    restSeconds: 60,
    difficulty: 'Beginner',
    description: 'Step forward into lunge, drive front heel to stand. Alternate legs for full set.',
  },

  // Arms
  {
    name: 'Barbell Curl',
    muscleGroup: 'Arms',
    sets: 3,
    reps: 10,
    restSeconds: 60,
    difficulty: 'Beginner',
    description:
      'Grip underhand, elbows fixed at sides. Curl bar to shoulder height, control the negative.',
  },
  {
    name: 'Tricep Dip',
    muscleGroup: 'Arms',
    sets: 3,
    reps: 12,
    restSeconds: 60,
    difficulty: 'Intermediate',
    description:
      'Hands on parallel bars, lower until elbows reach 90°. Keep torso upright to target triceps.',
  },
  {
    name: 'Hammer Curl',
    muscleGroup: 'Arms',
    sets: 3,
    reps: 12,
    restSeconds: 60,
    difficulty: 'Beginner',
    description:
      'Neutral grip (palms facing each other). Curl to shoulder height. Targets brachialis and brachioradialis.',
  },
  {
    name: 'Skull Crusher',
    muscleGroup: 'Arms',
    sets: 3,
    reps: 12,
    restSeconds: 60,
    difficulty: 'Intermediate',
    description:
      'Lie on bench, lower barbell toward forehead by bending elbows. Extend to lockout.',
  },

  // Shoulders
  {
    name: 'Overhead Press',
    muscleGroup: 'Shoulders',
    sets: 4,
    reps: 8,
    restSeconds: 90,
    difficulty: 'Intermediate',
    description:
      'Stand with barbell at clavicle height. Press overhead to lockout. Brace core throughout.',
  },
  {
    name: 'Lateral Raise',
    muscleGroup: 'Shoulders',
    sets: 3,
    reps: 15,
    restSeconds: 45,
    difficulty: 'Beginner',
    description:
      'Arms at sides, raise dumbbells to shoulder height. Lead with elbows, slight forward lean.',
  },
  {
    name: 'Face Pull',
    muscleGroup: 'Shoulders',
    sets: 3,
    reps: 15,
    restSeconds: 45,
    difficulty: 'Beginner',
    description:
      'Cable at forehead height. Pull to face with external rotation. Excellent for rear delt health.',
  },

  // Core
  {
    name: 'Plank',
    muscleGroup: 'Core',
    sets: 3,
    reps: 1, // reps = 1 hold for restSeconds duration
    restSeconds: 60,
    difficulty: 'Beginner',
    description:
      'Hold a straight-line position on forearms and toes for 30-60 seconds. Brace glutes and abs.',
  },
  {
    name: 'Cable Crunch',
    muscleGroup: 'Core',
    sets: 3,
    reps: 15,
    restSeconds: 45,
    difficulty: 'Beginner',
    description:
      'Kneel at cable tower, hands at head. Crunch elbows to knees, focusing on spinal flexion.',
  },
  {
    name: 'Hanging Leg Raise',
    muscleGroup: 'Core',
    sets: 3,
    reps: 12,
    restSeconds: 60,
    difficulty: 'Advanced',
    description:
      'Dead hang from pull-up bar. Raise legs to 90° with minimal swing. Control the descent.',
  },

  // Cardio
  {
    name: 'Treadmill Sprint Intervals',
    muscleGroup: 'Cardio',
    sets: 8,
    reps: 1,
    restSeconds: 60,
    difficulty: 'Intermediate',
    description: '30 seconds at maximum effort followed by 60 seconds walking. 8 rounds total.',
  },
  {
    name: 'Jump Rope',
    muscleGroup: 'Cardio',
    sets: 5,
    reps: 1,
    restSeconds: 30,
    difficulty: 'Beginner',
    description:
      '1 minute continuous jump rope per set. Focus on light landings and consistent rhythm.',
  },
];

// ─── Build Routine Records ────────────────────────────────────────────────────

const routines: RoutineRecord[] = exercises.map((exercise) => {
  const exerciseId = randomUUID();
  return {
    PK: routineKeys.pk(exercise.muscleGroup),
    SK: routineKeys.sk(exerciseId),
    exerciseId,
    exerciseName: exercise.name,
    muscleGroup: exercise.muscleGroup,
    sets: exercise.sets,
    reps: exercise.reps,
    restSeconds: exercise.restSeconds,
    difficulty: exercise.difficulty,
    description: exercise.description,
    createdAt: now,
    updatedAt: now,
  };
});

// ─── Seed Execution ───────────────────────────────────────────────────────────

async function seed(): Promise<void> {
  const allRecords = [
    ...users.map((item) => ({ item, label: `User: ${item.email}` })),
    ...payments.map((item) => ({ item, label: `Payment: ${item.paymentId}` })),
    ...routines.map((item) => ({ item, label: `Exercise: ${item.exerciseName}` })),
  ];

  console.info(`Seeding ${allRecords.length} records into ${TABLE_NAME}...`);

  let success = 0;
  let failed = 0;

  for (const { item, label } of allRecords) {
    try {
      await putItem({ TableName: TABLE_NAME, Item: item });
      console.info(`  [OK] ${label}`);
      success++;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`  [FAIL] ${label}: ${message}`);
      failed++;
    }
  }

  console.info(`\nDone. ${success} inserted, ${failed} failed.`);

  if (failed > 0) {
    process.exit(1);
  }
}

seed().catch((error) => {
  console.error('Seed script failed:', error);
  process.exit(1);
});
