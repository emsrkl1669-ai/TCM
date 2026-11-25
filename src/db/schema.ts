import { relations } from 'drizzle-orm';
import {
  boolean,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

// ตารางผู้รับบริการ (Patients)
export const patients = pgTable('patients', {
  id: serial('id').primaryKey(),
  fullName: text('full_name').notNull(),
  age: integer('age').notNull(),
  disease: text('disease').notNull().default('ไม่มี'),
  phoneNumber: text('phone_number').notNull(),
  createdDate: timestamp('created_date').defaultNow().notNull(),
});

// ตารางวันเปิดให้บริการ (Schedule Settings)
export const scheduleSettings = pgTable('schedule_settings', {
  id: serial('id').primaryKey(),
  dateStr: text('date_str').notNull().unique(), // YYYY-MM-DD
  isOpen: boolean('is_open').notNull().default(true),
  maxPerSlot: integer('max_per_slot').notNull().default(5),
  note: text('note'),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// ตารางตั้งค่าระบบ (System Configuration)
export const systemConfig = pgTable('system_config', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// ตารางการจองคิว (Bookings)
export const bookings = pgTable('bookings', {
  id: serial('id').primaryKey(),
  patientId: integer('patient_id')
    .references(() => patients.id)
    .notNull(),
  bookingDate: text('booking_date').notNull(), // YYYY-MM-DD
  bookingTime: text('booking_time').notNull(), // e.g. "09.00 - 09.30 น."
  queueNo: text('queue_no').notNull(), // e.g. A001, S001
  queueType: text('queue_type').notNull().default('regular'), // 'regular' | 'special'
  status: text('status').notNull().default('waiting'), // 'waiting' | 'calling' | 'completed' | 'cancelled'
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// ตารางประวัติการรักษา (Treatment History)
export const treatmentHistory = pgTable('treatment_history', {
  id: serial('id').primaryKey(),
  patientId: integer('patient_id')
    .references(() => patients.id)
    .notNull(),
  bookingId: integer('booking_id').references(() => bookings.id),
  queueNo: text('queue_no').notNull(),
  visitDate: text('visit_date').notNull(), // YYYY-MM-DD
  providerName: text('provider_name').notNull(),
  diagnosis: text('diagnosis').notNull(),
  note: text('note'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ตารางเจ้าหน้าที่ (Admins & Staff)
export const admins = pgTable('admins', {
  id: serial('id').primaryKey(),
  uid: text('uid').unique(),
  email: text('email').unique(),
  username: text('username').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  displayName: text('display_name').notNull(),
  role: text('role').notNull().default('staff'), // 'staff' | 'super_admin'
  isActive: boolean('is_active').notNull().default(true),
  lastLogin: timestamp('last_login'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ตารางบันทึกการตรวจสอบ (Audit Logs)
export const auditLogs = pgTable('audit_logs', {
  id: serial('id').primaryKey(),
  actorUsername: text('actor_username').notNull(),
  actorRole: text('actor_role').notNull(),
  action: text('action').notNull(),
  targetType: text('target_type').notNull(),
  targetId: text('target_id'),
  details: text('details'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Relations
export const patientsRelations = relations(patients, ({ many }) => ({
  bookings: many(bookings),
  treatments: many(treatmentHistory),
}));

export const bookingsRelations = relations(bookings, ({ one }) => ({
  patient: one(patients, {
    fields: [bookings.patientId],
    references: [patients.id],
  }),
}));

export const treatmentHistoryRelations = relations(treatmentHistory, ({ one }) => ({
  patient: one(patients, {
    fields: [treatmentHistory.patientId],
    references: [patients.id],
  }),
  booking: one(bookings, {
    fields: [treatmentHistory.bookingId],
    references: [bookings.id],
  }),
}));
