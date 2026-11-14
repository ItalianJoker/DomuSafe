import { sql } from 'drizzle-orm';
import { integer, jsonb, numeric, pgTable, smallint, text, uuid } from 'drizzle-orm/pg-core';
import { instant } from '../columns.js';
import { handoverAudienceEnum } from './enums.js';

/**
 * One diary row of vital parameters for a resident.
 * Pressure values travel together; at least one measurement or a note is required in SQL.
 */
export const vitalEntries = pgTable('vital_entries', {
  id: uuid('id')
    .primaryKey()
    .default(sql`uuidv7()`),
  version: integer('version').notNull().default(1),
  createdAt: instant('created_at').notNull().defaultNow(),
  updatedAt: instant('updated_at').notNull().defaultNow(),
  createdBy: uuid('created_by'),
  updatedBy: uuid('updated_by'),
  familyId: uuid('family_id').notNull(),
  residentId: uuid('resident_id').notNull(),
  measuredAt: instant('measured_at').notNull(),
  systolicMmhg: smallint('systolic_mmhg'),
  diastolicMmhg: smallint('diastolic_mmhg'),
  heartRateBpm: smallint('heart_rate_bpm'),
  temperatureCelsius: numeric('temperature_celsius'),
  bloodGlucoseMgDl: smallint('blood_glucose_mg_dl'),
  weightKg: numeric('weight_kg'),
  oxygenSaturationPercent: smallint('oxygen_saturation_percent'),
  notes: text('notes'),
  deletedAt: instant('deleted_at'),
});

/**
 * «Chi sono» sheet: how caregivers should address and support one resident.
 * One row per resident; empty fields mean “not filled yet”.
 */
export const residentAboutCards = pgTable('resident_about_cards', {
  residentId: uuid('resident_id').primaryKey(),
  familyId: uuid('family_id').notNull(),
  preferredName: text('preferred_name'),
  howToAddress: text('how_to_address'),
  likes: jsonb('likes').$type<string[]>().notNull().default([]),
  dislikes: jsonb('dislikes').$type<string[]>().notNull().default([]),
  dailyRoutine: text('daily_routine'),
  calmingTips: text('calming_tips'),
  communicationTips: text('communication_tips'),
  importantNotes: text('important_notes'),
  version: integer('version').notNull().default(1),
  createdAt: instant('created_at').notNull().defaultNow(),
  updatedAt: instant('updated_at').notNull().defaultNow(),
  createdBy: uuid('created_by'),
  updatedBy: uuid('updated_by'),
});

/**
 * A handover note between caregivers (or for a guest).
 * Acknowledgement records who read it and when.
 */
export const handovers = pgTable('handovers', {
  id: uuid('id')
    .primaryKey()
    .default(sql`uuidv7()`),
  version: integer('version').notNull().default(1),
  createdAt: instant('created_at').notNull().defaultNow(),
  updatedAt: instant('updated_at').notNull().defaultNow(),
  createdBy: uuid('created_by'),
  updatedBy: uuid('updated_by'),
  familyId: uuid('family_id').notNull(),
  houseId: uuid('house_id'),
  residentId: uuid('resident_id'),
  audience: handoverAudienceEnum('audience').notNull().default('family'),
  body: text('body').notNull(),
  postedAt: instant('posted_at').notNull().defaultNow(),
  acknowledgedAt: instant('acknowledged_at'),
  acknowledgedBy: uuid('acknowledged_by'),
  deletedAt: instant('deleted_at'),
});
