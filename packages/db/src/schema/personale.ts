import { sql } from 'drizzle-orm';
import { boolean, char, date, integer, jsonb, pgTable, smallint, text, uuid } from 'drizzle-orm/pg-core';
import { instant } from '../columns.js';
import { bloodGroupEnum, mobilityEnum, petSpeciesEnum, taxItemKeyEnum, taxItemStatusEnum } from './enums.js';

/**
 * Readable rescue card of one resident (blood, mobility, allergies, conditions, devices).
 * Medicines and emergency contacts live in their own tables and share this version.
 */
export const residentProfiles = pgTable('resident_profiles', {
  residentId: uuid('resident_id').primaryKey(),
  familyId: uuid('family_id').notNull(),
  bloodGroup: bloodGroupEnum('blood_group'),
  mobility: mobilityEnum('mobility'),
  allergies: jsonb('allergies').$type<string[]>().notNull().default([]),
  conditions: jsonb('conditions').$type<string[]>().notNull().default([]),
  medicalDevices: jsonb('medical_devices').$type<string[]>().notNull().default([]),
  version: integer('version').notNull().default(1),
  createdAt: instant('created_at').notNull().defaultNow(),
  updatedAt: instant('updated_at').notNull().defaultNow(),
  createdBy: uuid('created_by'),
  updatedBy: uuid('updated_by'),
});

/** A lifesaving medicine and where it is kept. */
export const lifesavingMedicines = pgTable('lifesaving_medicines', {
  id: uuid('id')
    .primaryKey()
    .default(sql`uuidv7()`),
  familyId: uuid('family_id').notNull(),
  residentId: uuid('resident_id').notNull(),
  name: text('name').notNull(),
  location: text('location').notNull(),
  sortOrder: smallint('sort_order').notNull().default(0),
});

/** An ordered emergency contact. `hasKeys` says who can enter the house. */
export const emergencyContacts = pgTable('emergency_contacts', {
  id: uuid('id')
    .primaryKey()
    .default(sql`uuidv7()`),
  familyId: uuid('family_id').notNull(),
  residentId: uuid('resident_id').notNull(),
  displayName: text('display_name').notNull(),
  phone: text('phone'),
  relationship: text('relationship'),
  hasKeys: boolean('has_keys').notNull().default(false),
  sortOrder: smallint('sort_order').notNull().default(0),
});

/** A pet, with the veterinary clinic that should be called. */
export const pets = pgTable('pets', {
  id: uuid('id')
    .primaryKey()
    .default(sql`uuidv7()`),
  version: integer('version').notNull().default(1),
  createdAt: instant('created_at').notNull().defaultNow(),
  updatedAt: instant('updated_at').notNull().defaultNow(),
  createdBy: uuid('created_by'),
  updatedBy: uuid('updated_by'),
  familyId: uuid('family_id').notNull(),
  name: text('name').notNull(),
  species: petSpeciesEnum('species').notNull(),
  breed: text('breed'),
  notes: text('notes'),
  vetName: text('vet_name'),
  vetPhone: text('vet_phone'),
  vetAddress: text('vet_address'),
  planLockedAt: instant('plan_locked_at'),
  deletedAt: instant('deleted_at'),
});

/** Houses a pet lives in. */
export const petHouses = pgTable('pet_houses', {
  familyId: uuid('family_id').notNull(),
  petId: uuid('pet_id').notNull(),
  houseId: uuid('house_id').notNull(),
});

/** A personal mobile plan. The full SIM secrets are not stored. */
export const phoneLines = pgTable('phone_lines', {
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
  operatorName: text('operator_name').notNull(),
  phoneNumber: text('phone_number').notNull(),
  planName: text('plan_name').notNull(),
  monthlyCostMinor: integer('monthly_cost_minor'),
  currency: char('currency', { length: 3 }),
  renewalDate: date('renewal_date', { mode: 'string' }),
  deletedAt: instant('deleted_at'),
});

/** A personal subscription (streaming, gym, insurance of the person). */
export const subscriptions = pgTable('subscriptions', {
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
  name: text('name').notNull(),
  providerName: text('provider_name'),
  renewalDate: date('renewal_date', { mode: 'string' }),
  costMinor: integer('cost_minor'),
  currency: char('currency', { length: 3 }),
  notes: text('notes'),
  deletedAt: instant('deleted_at'),
});

/** A vehicle and the three deadlines the household tracks by hand. */
export const vehicles = pgTable('vehicles', {
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
  plate: text('plate').notNull(),
  make: text('make'),
  model: text('model'),
  insuranceRenewalDate: date('insurance_renewal_date', { mode: 'string' }),
  roadTaxDueDate: date('road_tax_due_date', { mode: 'string' }),
  inspectionDueDate: date('inspection_due_date', { mode: 'string' }),
  deletedAt: instant('deleted_at'),
});

/**
 * Personal bank account metadata. The full account number is never stored.
 * Writing it requires the Premium plan (or the running trial).
 */
export const personalBankAccounts = pgTable('personal_bank_accounts', {
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
  institution: text('institution').notNull(),
  label: text('label').notNull(),
  referenceHint: text('reference_hint'),
  notes: text('notes'),
  deletedAt: instant('deleted_at'),
});

/** One row of the annual Italian tax checklist on a resident. Premium (or the trial). */
export const taxChecklistItems = pgTable('tax_checklist_items', {
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
  taxYear: smallint('tax_year').notNull(),
  itemKey: taxItemKeyEnum('item_key').notNull(),
  dueDate: date('due_date', { mode: 'string' }),
  status: taxItemStatusEnum('status').notNull().default('todo'),
});
