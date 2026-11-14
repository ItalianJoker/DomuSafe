import { z } from 'zod';
import { instantSchema, localDateSchema, pageSchema, uuidSchema } from './common.js';

/** How a chore is assigned to residents. */
export const CHORE_ASSIGNMENTS = ['fixed', 'rotation'] as const;
/** How a chore is assigned to residents. */
export type ChoreAssignment = (typeof CHORE_ASSIGNMENTS)[number];

/** Approval state of a chore completion. */
export const CHORE_COMPLETION_STATUSES = ['pending_approval', 'approved', 'rejected'] as const;
/** Approval state of a chore completion. */
export type ChoreCompletionStatus = (typeof CHORE_COMPLETION_STATUSES)[number];

/** Origin of a point ledger row. */
export const POINT_SOURCES = ['chore', 'reward', 'manual', 'streak_bonus'] as const;
/** Origin of a point ledger row. */
export type PointSource = (typeof POINT_SOURCES)[number];

/** State of a reward redemption. */
export const REWARD_REDEMPTION_STATUSES = ['requested', 'approved', 'rejected', 'fulfilled'] as const;
/** State of a reward redemption. */
export type RewardRedemptionStatus = (typeof REWARD_REDEMPTION_STATUSES)[number];

const assignmentSchema = z.enum(CHORE_ASSIGNMENTS);
const completionStatusSchema = z.enum(CHORE_COMPLETION_STATUSES);
const pointSourceSchema = z.enum(POINT_SOURCES);
const redemptionStatusSchema = z.enum(REWARD_REDEMPTION_STATUSES);
const titleSchema = z.string().trim().min(1).max(140);
const descriptionSchema = z.string().trim().max(2000);
const noteSchema = z.string().trim().max(1000);
const reasonSchema = z.string().trim().min(1).max(200);
const rruleSchema = z
  .string()
  .trim()
  .min(1)
  .max(400)
  .regex(/^FREQ=(DAILY|WEEKLY|MONTHLY|YEARLY)(;[A-Z]+=[A-Z0-9,-]+)*$/, 'Invalid recurrence');
const proofPhotoSchema = z
  .string()
  .min(32)
  .max(24_576)
  .regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/);
const residentIdsSchema = z.array(uuidSchema).max(32);
const limitField = z.coerce.number().int().min(1).max(200).default(50);
const cursorField = z.string().max(512).optional();

function atLeastOneField(value: object): boolean {
  return Object.keys(value).length > 0;
}

/** Path parameters of one chore. */
export const choreParamsSchema = z.object({ familyId: uuidSchema, choreId: uuidSchema }).strict();
/** Path parameters of one chore. */
export type ChoreParams = z.infer<typeof choreParamsSchema>;

/** Path parameters of one chore completion. */
export const choreCompletionParamsSchema = z
  .object({ familyId: uuidSchema, completionId: uuidSchema })
  .strict();
/** Path parameters of one chore completion. */
export type ChoreCompletionParams = z.infer<typeof choreCompletionParamsSchema>;

/** Path parameters of one reward. */
export const rewardParamsSchema = z.object({ familyId: uuidSchema, rewardId: uuidSchema }).strict();
/** Path parameters of one reward. */
export type RewardParams = z.infer<typeof rewardParamsSchema>;

/** Path parameters of one redemption. */
export const redemptionParamsSchema = z.object({ familyId: uuidSchema, redemptionId: uuidSchema }).strict();
/** Path parameters of one redemption. */
export type RedemptionParams = z.infer<typeof redemptionParamsSchema>;

/** Query of the chore list. */
export const choreListQuerySchema = z
  .object({
    limit: limitField,
    cursor: cursorField,
    houseId: uuidSchema.optional(),
    active: z.coerce.boolean().optional(),
  })
  .strict();
/** Query of the chore list. */
export type ChoreListQuery = z.infer<typeof choreListQuerySchema>;

/** Query of the completion list. */
export const choreCompletionListQuerySchema = z
  .object({
    limit: limitField,
    cursor: cursorField,
    choreId: uuidSchema.optional(),
    residentId: uuidSchema.optional(),
    status: completionStatusSchema.optional(),
  })
  .strict();
/** Query of the completion list. */
export type ChoreCompletionListQuery = z.infer<typeof choreCompletionListQuerySchema>;

/** Query of the points view. */
export const pointsQuerySchema = z
  .object({
    residentId: uuidSchema,
    limit: limitField,
    cursor: cursorField,
  })
  .strict();
/** Query of the points view. */
export type PointsQuery = z.infer<typeof pointsQuerySchema>;

/** Query of the rewards list. */
export const rewardListQuerySchema = z
  .object({
    limit: limitField,
    cursor: cursorField,
    active: z.coerce.boolean().optional(),
  })
  .strict();
/** Query of the rewards list. */
export type RewardListQuery = z.infer<typeof rewardListQuerySchema>;

/** Query of the redemption list. */
export const redemptionListQuerySchema = z
  .object({
    limit: limitField,
    cursor: cursorField,
    residentId: uuidSchema.optional(),
    status: redemptionStatusSchema.optional(),
  })
  .strict();
/** Query of the redemption list. */
export type RedemptionListQuery = z.infer<typeof redemptionListQuerySchema>;

/** One family chore. */
export const choreSchema = z
  .object({
    id: uuidSchema,
    familyId: uuidSchema,
    houseId: uuidSchema.nullable(),
    title: titleSchema,
    description: descriptionSchema.nullable(),
    rrule: rruleSchema.nullable(),
    points: z.int().min(0).max(1000),
    assignment: assignmentSchema,
    assignedResidentIds: residentIdsSchema,
    nextDueDate: localDateSchema.nullable(),
    requiresApproval: z.boolean(),
    active: z.boolean(),
    version: z.int().min(1),
    createdAt: instantSchema,
    updatedAt: instantSchema,
  })
  .strict()
  .meta({ id: 'Chore' });
/** One family chore. */
export type Chore = z.infer<typeof choreSchema>;

/** Page of chores. */
export const chorePageSchema = pageSchema(choreSchema).meta({ id: 'ChorePage' });
/** Page of chores. */
export type ChorePage = z.infer<typeof chorePageSchema>;

/** Body of `POST …/chores`. */
export const createChoreRequestSchema = z
  .object({
    title: titleSchema,
    description: descriptionSchema.nullable().optional(),
    houseId: uuidSchema.nullable().optional(),
    rrule: rruleSchema.nullable().optional(),
    points: z.int().min(0).max(1000).default(1),
    assignment: assignmentSchema.default('fixed'),
    assignedResidentIds: residentIdsSchema.default([]),
    nextDueDate: localDateSchema.nullable().optional(),
    requiresApproval: z.boolean().default(true),
    active: z.boolean().default(true),
  })
  .strict()
  .meta({ id: 'CreateChoreRequest' });
/** Body of `POST …/chores`. */
export type CreateChoreRequest = z.infer<typeof createChoreRequestSchema>;

/** Body of `PATCH …/chores/{choreId}`. */
export const updateChoreRequestSchema = z
  .object({
    title: titleSchema.optional(),
    description: descriptionSchema.nullable().optional(),
    houseId: uuidSchema.nullable().optional(),
    rrule: rruleSchema.nullable().optional(),
    points: z.int().min(0).max(1000).optional(),
    assignment: assignmentSchema.optional(),
    assignedResidentIds: residentIdsSchema.optional(),
    nextDueDate: localDateSchema.nullable().optional(),
    requiresApproval: z.boolean().optional(),
    active: z.boolean().optional(),
  })
  .strict()
  .refine(atLeastOneField, { message: 'At least one field is required' })
  .meta({ id: 'UpdateChoreRequest' });
/** Body of `PATCH …/chores/{choreId}`. */
export type UpdateChoreRequest = z.infer<typeof updateChoreRequestSchema>;

/** One chore completion awaiting or past parent review. */
export const choreCompletionSchema = z
  .object({
    id: uuidSchema,
    familyId: uuidSchema,
    choreId: uuidSchema,
    residentId: uuidSchema,
    dueDate: localDateSchema,
    completedAt: instantSchema,
    status: completionStatusSchema,
    decidedBy: uuidSchema.nullable(),
    decidedAt: instantSchema.nullable(),
    pointsAwarded: z.int().min(0),
    proofPhotoDataUrl: proofPhotoSchema.nullable(),
    note: noteSchema.nullable(),
  })
  .strict()
  .meta({ id: 'ChoreCompletion' });
/** One chore completion awaiting or past parent review. */
export type ChoreCompletion = z.infer<typeof choreCompletionSchema>;

/** Page of chore completions. */
export const choreCompletionPageSchema = pageSchema(choreCompletionSchema).meta({
  id: 'ChoreCompletionPage',
});
/** Page of chore completions. */
export type ChoreCompletionPage = z.infer<typeof choreCompletionPageSchema>;

/** Body of `POST …/chores/{choreId}/completions`. */
export const createChoreCompletionRequestSchema = z
  .object({
    residentId: uuidSchema,
    dueDate: localDateSchema.optional(),
    note: noteSchema.nullable().optional(),
    proofPhotoDataUrl: proofPhotoSchema.nullable().optional(),
  })
  .strict()
  .meta({ id: 'CreateChoreCompletionRequest' });
/** Body of `POST …/chores/{choreId}/completions`. */
export type CreateChoreCompletionRequest = z.infer<typeof createChoreCompletionRequestSchema>;

/** Consecutive-day streak for one resident. */
export const residentStreakSchema = z
  .object({
    residentId: uuidSchema,
    currentDays: z.int().min(0),
    bestDays: z.int().min(0),
    lastCompletedOn: localDateSchema.nullable(),
  })
  .strict()
  .meta({ id: 'ResidentStreak' });
/** Consecutive-day streak for one resident. */
export type ResidentStreak = z.infer<typeof residentStreakSchema>;

/** One append-only point ledger row. */
export const pointEntrySchema = z
  .object({
    id: uuidSchema,
    familyId: uuidSchema,
    residentId: uuidSchema,
    delta: z.int(),
    reason: reasonSchema,
    source: pointSourceSchema,
    sourceId: uuidSchema.nullable(),
    createdBy: uuidSchema.nullable(),
    approvedBy: uuidSchema.nullable(),
    createdAt: instantSchema,
  })
  .strict()
  .meta({ id: 'PointEntry' });
/** One append-only point ledger row. */
export type PointEntry = z.infer<typeof pointEntrySchema>;

/** Balance, streak and recent ledger for one resident. */
export const pointsViewSchema = z
  .object({
    residentId: uuidSchema,
    balance: z.int(),
    streak: residentStreakSchema,
    items: z.array(pointEntrySchema),
    nextCursor: z.string().nullable(),
  })
  .strict()
  .meta({ id: 'PointsView' });
/** Balance, streak and recent ledger for one resident. */
export type PointsView = z.infer<typeof pointsViewSchema>;

/** Body of `POST …/points` (manual adjustment by a parent). */
export const createPointEntryRequestSchema = z
  .object({
    residentId: uuidSchema,
    delta: z.int().refine((value) => value !== 0, { message: 'delta must not be zero' }),
    reason: reasonSchema,
  })
  .strict()
  .meta({ id: 'CreatePointEntryRequest' });
/** Body of `POST …/points`. */
export type CreatePointEntryRequest = z.infer<typeof createPointEntryRequestSchema>;

/** One item in the rewards store. */
export const rewardSchema = z
  .object({
    id: uuidSchema,
    familyId: uuidSchema,
    title: titleSchema,
    description: descriptionSchema.nullable(),
    costPoints: z.int().min(1).max(100_000),
    stock: z.int().min(0).nullable(),
    active: z.boolean(),
    version: z.int().min(1),
    createdAt: instantSchema,
    updatedAt: instantSchema,
  })
  .strict()
  .meta({ id: 'Reward' });
/** One item in the rewards store. */
export type Reward = z.infer<typeof rewardSchema>;

/** Page of rewards. */
export const rewardPageSchema = pageSchema(rewardSchema).meta({ id: 'RewardPage' });
/** Page of rewards. */
export type RewardPage = z.infer<typeof rewardPageSchema>;

/** Body of `POST …/rewards`. */
export const createRewardRequestSchema = z
  .object({
    title: titleSchema,
    description: descriptionSchema.nullable().optional(),
    costPoints: z.int().min(1).max(100_000),
    stock: z.int().min(0).nullable().optional(),
    active: z.boolean().default(true),
  })
  .strict()
  .meta({ id: 'CreateRewardRequest' });
/** Body of `POST …/rewards`. */
export type CreateRewardRequest = z.infer<typeof createRewardRequestSchema>;

/** Body of `PATCH …/rewards/{rewardId}`. */
export const updateRewardRequestSchema = z
  .object({
    title: titleSchema.optional(),
    description: descriptionSchema.nullable().optional(),
    costPoints: z.int().min(1).max(100_000).optional(),
    stock: z.int().min(0).nullable().optional(),
    active: z.boolean().optional(),
  })
  .strict()
  .refine(atLeastOneField, { message: 'At least one field is required' })
  .meta({ id: 'UpdateRewardRequest' });
/** Body of `PATCH …/rewards/{rewardId}`. */
export type UpdateRewardRequest = z.infer<typeof updateRewardRequestSchema>;

/** One reward redemption request. */
export const rewardRedemptionSchema = z
  .object({
    id: uuidSchema,
    familyId: uuidSchema,
    residentId: uuidSchema,
    rewardId: uuidSchema,
    status: redemptionStatusSchema,
    decidedBy: uuidSchema.nullable(),
    decidedAt: instantSchema.nullable(),
    pointEntryId: uuidSchema.nullable(),
    version: z.int().min(1),
    createdAt: instantSchema,
    updatedAt: instantSchema,
  })
  .strict()
  .meta({ id: 'RewardRedemption' });
/** One reward redemption request. */
export type RewardRedemption = z.infer<typeof rewardRedemptionSchema>;

/** Page of redemptions. */
export const rewardRedemptionPageSchema = pageSchema(rewardRedemptionSchema).meta({
  id: 'RewardRedemptionPage',
});
/** Page of redemptions. */
export type RewardRedemptionPage = z.infer<typeof rewardRedemptionPageSchema>;

/** Body of `POST …/rewards/{rewardId}/redemptions`. */
export const createRedemptionRequestSchema = z
  .object({ residentId: uuidSchema })
  .strict()
  .meta({ id: 'CreateRedemptionRequest' });
/** Body of `POST …/rewards/{rewardId}/redemptions`. */
export type CreateRedemptionRequest = z.infer<typeof createRedemptionRequestSchema>;
