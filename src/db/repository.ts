import crypto from 'crypto';
import { and, desc, eq, gte, inArray, lte, ne, asc } from 'drizzle-orm';
import { db } from './index.ts';
import {
  admins,
  auditLogs,
  bookings,
  patients,
  scheduleSettings,
  systemConfig,
  treatmentHistory,
} from './schema.ts';
import {
  getBangkokDateStr,
  maskPhoneNumber,
  TIME_SLOTS,
  type AdminRole,
  type QueueStatus,
} from '../lib/constants.ts';

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split(':');
  if (parts.length !== 2) return false;
  const [salt, keyHex] = parts;
  const derived = crypto.scryptSync(password, salt, 64);
  const keyBuf = Buffer.from(keyHex, 'hex');
  if (derived.length !== keyBuf.length) return false;
  return crypto.timingSafeEqual(derived, keyBuf);
}

let seedPromise: Promise<void> | null = null;
let seededOnce = false;

export async function ensureInitialSeed(): Promise<void> {
  if (seededOnce) return;
  if (seedPromise) return seedPromise;

  seedPromise = (async () => {
    try {
      const existingConfig = await db.select().from(systemConfig);
      if (existingConfig.length === 0) {
        await db
          .insert(systemConfig)
          .values([
            { key: 'booking_paused', value: 'false' },
            { key: 'pause_reason', value: '' },
          ])
          .onConflictDoNothing();
      }

      const [existingAdmin1571] = await db
        .select()
        .from(admins)
        .where(eq(admins.username, 'Admin1571'));

      if (!existingAdmin1571) {
        await db
          .insert(admins)
          .values({
            email: 'emsrkl1669@gmail.com',
            username: 'Admin1571',
            passwordHash: hashPassword('1571'),
            displayName: 'ผู้ดูแลระบบ (Admin1571)',
            role: 'super_admin',
            isActive: true,
          })
          .onConflictDoNothing();
      }

      seededOnce = true;
    } catch (error) {
      seedPromise = null;
      console.error('Database initial seed failed:', error);
      throw new Error('Failed to initialize clinic database.', { cause: error });
    }
  })();

  return seedPromise;
}

export async function getClinicConfig() {
  try {
    await ensureInitialSeed();
    const configs = await db.select().from(systemConfig);
    const configMap = new Map(configs.map((c) => [c.key, c.value]));
    const today = getBangkokDateStr(0);

    const scheduleRows = await db
      .select()
      .from(scheduleSettings)
      .where(gte(scheduleSettings.dateStr, today))
      .orderBy(asc(scheduleSettings.dateStr));

    return {
      bookingPaused: configMap.get('booking_paused') === 'true',
      pauseReason: configMap.get('pause_reason') || '',
      dates: scheduleRows,
      timeSlots: TIME_SLOTS,
    };
  } catch (error) {
    console.error('Database query failed in getClinicConfig:', error);
    throw new Error('ไม่สามารถโหลดการตั้งค่าปฏิทินบริการได้ในขณะนี้', { cause: error });
  }
}

export async function getSlotsAvailability(dateStr: string) {
  try {
    await ensureInitialSeed();
    const [schedule] = await db
      .select()
      .from(scheduleSettings)
      .where(eq(scheduleSettings.dateStr, dateStr));

    const maxPerSlot = schedule?.maxPerSlot ?? 5;
    const isDateOpen = schedule ? schedule.isOpen : false;

    const dayBookings = await db
      .select()
      .from(bookings)
      .where(
        and(
          eq(bookings.bookingDate, dateStr),
          eq(bookings.queueType, 'regular'),
          ne(bookings.status, 'cancelled'),
        ),
      );

    const countBySlot = new Map<string, number>();
    for (const b of dayBookings) {
      countBySlot.set(b.bookingTime, (countBySlot.get(b.bookingTime) || 0) + 1);
    }

    const slots = TIME_SLOTS.map((slot) => {
      const bookedCount = countBySlot.get(slot.label) || 0;
      const remaining = Math.max(0, maxPerSlot - bookedCount);
      return {
        ...slot,
        maxPerSlot,
        bookedCount,
        remaining,
        isFull: remaining === 0,
      };
    });

    const totalBooked = slots.reduce((acc, s) => acc + s.bookedCount, 0);
    const totalCapacity = slots.reduce((acc, s) => acc + s.maxPerSlot, 0);

    return {
      dateStr,
      isOpen: isDateOpen,
      note: schedule?.note || '',
      totalBooked,
      totalCapacity,
      slots,
    };
  } catch (error) {
    console.error('Database query failed in getSlotsAvailability:', error);
    throw new Error('ไม่สามารถตรวจสอบจำนวนคิวว่างได้ในขณะนี้', { cause: error });
  }
}

export interface CreateBookingInput {
  fullName: string;
  age: number;
  disease: string;
  phoneNumber: string;
  bookingDate: string;
  bookingTime: string;
}

export async function createPublicBooking(input: CreateBookingInput) {
  try {
    await ensureInitialSeed();

    return await db.transaction(async (tx) => {
      const pauseRow = await tx
        .select()
        .from(systemConfig)
        .where(eq(systemConfig.key, 'booking_paused'));

      if (pauseRow[0]?.value === 'true') {
        throw new Error('BOOKING_PAUSED');
      }

      const [schedule] = await tx
        .select()
        .from(scheduleSettings)
        .where(eq(scheduleSettings.dateStr, input.bookingDate));

      if (!schedule || !schedule.isOpen) {
        throw new Error('DATE_CLOSED');
      }

      const validSlot = TIME_SLOTS.find((s) => s.label === input.bookingTime);
      if (!validSlot) {
        throw new Error('INVALID_SLOT');
      }

      const existingSlotBookings = await tx
        .select()
        .from(bookings)
        .where(
          and(
            eq(bookings.bookingDate, input.bookingDate),
            eq(bookings.bookingTime, input.bookingTime),
            eq(bookings.queueType, 'regular'),
            ne(bookings.status, 'cancelled'),
          ),
        );

      if (existingSlotBookings.length >= schedule.maxPerSlot) {
        throw new Error('SLOT_FULL');
      }

      const allDayRegularBookings = await tx
        .select()
        .from(bookings)
        .where(
          and(
            eq(bookings.bookingDate, input.bookingDate),
            eq(bookings.queueType, 'regular'),
          ),
        );

      const nextNumber = allDayRegularBookings.length + 1;
      const queueNo = `A${String(nextNumber).padStart(3, '0')}`;

      const cleanPhone = input.phoneNumber.replace(/\D/g, '');
      const [existingPatient] = await tx
        .select()
        .from(patients)
        .where(eq(patients.phoneNumber, cleanPhone));

      let patientRecord = existingPatient;
      if (patientRecord) {
        const [updated] = await tx
          .update(patients)
          .set({
            fullName: input.fullName.trim(),
            age: input.age,
            disease: input.disease.trim() || 'ไม่มีโรคประจำตัว',
          })
          .where(eq(patients.id, patientRecord.id))
          .returning();
        patientRecord = updated;
      } else {
        const [inserted] = await tx
          .insert(patients)
          .values({
            fullName: input.fullName.trim(),
            age: input.age,
            disease: input.disease.trim() || 'ไม่มีโรคประจำตัว',
            phoneNumber: cleanPhone,
          })
          .returning();
        patientRecord = inserted;
      }

      const [bookingRecord] = await tx
        .insert(bookings)
        .values({
          patientId: patientRecord.id,
          bookingDate: input.bookingDate,
          bookingTime: input.bookingTime,
          queueNo,
          queueType: 'regular',
          status: 'waiting',
        })
        .returning();

      return {
        bookingId: bookingRecord.id,
        patientId: patientRecord.id,
        queueNo: bookingRecord.queueNo,
        queueType: bookingRecord.queueType,
        fullName: patientRecord.fullName,
        age: patientRecord.age,
        disease: patientRecord.disease,
        phoneNumber: patientRecord.phoneNumber,
        bookingDate: bookingRecord.bookingDate,
        bookingTime: bookingRecord.bookingTime,
        status: bookingRecord.status as QueueStatus,
        createdAt: bookingRecord.createdAt.toISOString(),
      };
    });
  } catch (error) {
    if (
      error instanceof Error &&
      ['BOOKING_PAUSED', 'DATE_CLOSED', 'INVALID_SLOT', 'SLOT_FULL'].includes(error.message)
    ) {
      throw error;
    }
    console.error('Database mutation failed in createPublicBooking:', error);
    throw new Error('ไม่สามารถบันทึกการจองคิวได้ กรุณาลองใหม่อีกครั้ง', { cause: error });
  }
}

export async function getLiveQueueStatus(dateStr: string, searchQuery?: string) {
  try {
    await ensureInitialSeed();
    const rows = await db
      .select({
        booking: bookings,
        patient: patients,
      })
      .from(bookings)
      .innerJoin(patients, eq(bookings.patientId, patients.id))
      .where(eq(bookings.bookingDate, dateStr))
      .orderBy(asc(bookings.id));

    const callingRow = rows.find((r) => r.booking.status === 'calling');
    const waitingRows = rows.filter((r) => r.booking.status === 'waiting');

    // Sort waiting queues: special queues first if marked calling/next, or ordered by slot then ID
    const orderedWaiting = [...waitingRows].sort((a, b) => {
      if (a.booking.queueType !== b.booking.queueType) {
        return a.booking.queueType === 'special' ? -1 : 1;
      }
      return a.booking.id - b.booking.id;
    });

    const stats = {
      total: rows.length,
      completed: rows.filter((r) => r.booking.status === 'completed').length,
      waiting: waitingRows.length,
      cancelled: rows.filter((r) => r.booking.status === 'cancelled').length,
      special: rows.filter((r) => r.booking.queueType === 'special').length,
    };

    const publicFeed = rows
      .filter((r) => r.booking.status !== 'cancelled')
      .map((r) => ({
        queueNo: r.booking.queueNo,
        queueType: r.booking.queueType,
        bookingTime: r.booking.bookingTime,
        status: r.booking.status as QueueStatus,
        maskedName: `${r.patient.fullName.split(' ')[0]}***`,
      }));

    let matchedTicket = null;
    const trimmed = searchQuery?.trim();
    if (trimmed) {
      const normalizedDigits = trimmed.replace(/\D/g, '');
      const upperQuery = trimmed.toUpperCase();

      // Search across requested date first, then fallback to latest booking by phone/queueNo
      let found = rows.find(
        (r) =>
          r.booking.queueNo.toUpperCase() === upperQuery ||
          (normalizedDigits.length >= 9 && r.patient.phoneNumber === normalizedDigits),
      );

      if (!found) {
        const fallbackRows = await db
          .select({ booking: bookings, patient: patients })
          .from(bookings)
          .innerJoin(patients, eq(bookings.patientId, patients.id))
          .orderBy(desc(bookings.id));

        found = fallbackRows.find(
          (r) =>
            r.booking.queueNo.toUpperCase() === upperQuery ||
            (normalizedDigits.length >= 9 && r.patient.phoneNumber === normalizedDigits),
        );
      }

      if (found) {
        let queuesAhead = 0;
        if (found.booking.status === 'waiting') {
          if (found.booking.bookingDate === dateStr) {
            const idx = orderedWaiting.findIndex((w) => w.booking.id === found!.booking.id);
            queuesAhead = idx >= 0 ? idx + (callingRow ? 1 : 0) : 0;
          } else {
            const targetWaiting = await db
              .select()
              .from(bookings)
              .where(
                and(
                  eq(bookings.bookingDate, found.booking.bookingDate),
                  inArray(bookings.status, ['waiting', 'calling']),
                ),
              )
              .orderBy(asc(bookings.id));
            const idx = targetWaiting.findIndex((b) => b.id === found!.booking.id);
            queuesAhead = idx >= 0 ? idx : 0;
          }
        }

        matchedTicket = {
          bookingId: found.booking.id,
          queueNo: found.booking.queueNo,
          queueType: found.booking.queueType,
          fullName: found.patient.fullName,
          age: found.patient.age,
          disease: found.patient.disease,
          phoneNumber: maskPhoneNumber(found.patient.phoneNumber),
          rawPhone: found.patient.phoneNumber,
          bookingDate: found.booking.bookingDate,
          bookingTime: found.booking.bookingTime,
          status: found.booking.status as QueueStatus,
          queuesAhead,
        };
      }
    }

    return {
      dateStr,
      callingQueue: callingRow
        ? {
            queueNo: callingRow.booking.queueNo,
            bookingTime: callingRow.booking.bookingTime,
            queueType: callingRow.booking.queueType,
          }
        : null,
      stats,
      publicFeed,
      matchedTicket,
    };
  } catch (error) {
    console.error('Database query failed in getLiveQueueStatus:', error);
    throw new Error('ไม่สามารถโหลดสถานะคิวแบบเรียลไทม์ได้', { cause: error });
  }
}

export async function searchTreatmentHistory(query: string) {
  try {
    await ensureInitialSeed();
    const clean = query.trim();
    if (!clean) return [];

    const digits = clean.replace(/\D/g, '');
    const allRecords = await db
      .select({
        visit: treatmentHistory,
        patient: patients,
      })
      .from(treatmentHistory)
      .innerJoin(patients, eq(treatmentHistory.patientId, patients.id))
      .orderBy(desc(treatmentHistory.visitDate), desc(treatmentHistory.id));

    return allRecords
      .filter((r) => {
        if (digits.length >= 9) {
          return r.patient.phoneNumber === digits;
        }
        return (
          r.visit.queueNo.toUpperCase() === clean.toUpperCase() ||
          r.patient.fullName.toLowerCase().includes(clean.toLowerCase())
        );
      })
      .map((r) => ({
        id: r.visit.id,
        visitDate: r.visit.visitDate,
        queueNo: r.visit.queueNo,
        patientName: r.patient.fullName,
        phoneMasked: maskPhoneNumber(r.patient.phoneNumber),
        providerName: r.visit.providerName,
        diagnosis: r.visit.diagnosis,
        note: r.visit.note || '-',
      }));
  } catch (error) {
    console.error('Database query failed in searchTreatmentHistory:', error);
    throw new Error('ไม่สามารถค้นหาประวัติการรับบริการได้', { cause: error });
  }
}

export async function findOrProvisionGoogleAdmin(uid: string, email: string, name?: string) {
  try {
    await ensureInitialSeed();
    const normalizedEmail = email.toLowerCase().trim();

    const [existing] = await db
      .select()
      .from(admins)
      .where(eq(admins.email, normalizedEmail));

    if (existing) {
      if (!existing.isActive) return null;
      const [updated] = await db
        .update(admins)
        .set({ uid, lastLogin: new Date() })
        .where(eq(admins.id, existing.id))
        .returning();
      return updated;
    }

    // Automatically authorize owner email as super_admin
    if (normalizedEmail === 'emsrkl1669@gmail.com') {
      const [created] = await db
        .insert(admins)
        .values({
          uid,
          email: normalizedEmail,
          username: 'emsrkl1669',
          passwordHash: hashPassword(crypto.randomBytes(16).toString('hex')),
          displayName: name || 'ผู้ดูแลระบบหลัก (มูลนิธิร่วมกุศลฯ)',
          role: 'super_admin',
          isActive: true,
          lastLogin: new Date(),
        })
        .returning();
      return created;
    }

    return null;
  } catch (error) {
    console.error('Database error in findOrProvisionGoogleAdmin:', error);
    throw new Error('ไม่สามารถตรวจสอบสิทธิ์เจ้าหน้าที่ได้', { cause: error });
  }
}

export async function findAdminByUsername(username: string) {
  try {
    await ensureInitialSeed();
    const [admin] = await db
      .select()
      .from(admins)
      .where(eq(admins.username, username.trim()));
    return admin || null;
  } catch (error) {
    console.error('Database error in findAdminByUsername:', error);
    throw new Error('ไม่สามารถตรวจสอบบัญชีผู้ใช้ได้', { cause: error });
  }
}

export async function markAdminLastLogin(adminId: number) {
  try {
    await db
      .update(admins)
      .set({ lastLogin: new Date() })
      .where(eq(admins.id, adminId));
  } catch (error) {
    console.error('Failed to update admin lastLogin:', error);
  }
}

export async function recordAuditLog(params: {
  actorUsername: string;
  actorRole: string;
  action: string;
  targetType: string;
  targetId?: string;
  details?: string;
}) {
  try {
    await db.insert(auditLogs).values({
      actorUsername: params.actorUsername,
      actorRole: params.actorRole,
      action: params.action,
      targetType: params.targetType,
      targetId: params.targetId || null,
      details: params.details || null,
    });
  } catch (error) {
    console.error('Failed to write audit log:', error);
  }
}

export async function getAdminDashboardData(dateStr: string) {
  try {
    await ensureInitialSeed();
    const rows = await db
      .select({
        booking: bookings,
        patient: patients,
      })
      .from(bookings)
      .innerJoin(patients, eq(bookings.patientId, patients.id))
      .where(eq(bookings.bookingDate, dateStr))
      .orderBy(asc(bookings.id));

    const stats = {
      total: rows.length,
      completed: rows.filter((r) => r.booking.status === 'completed').length,
      waiting: rows.filter((r) => r.booking.status === 'waiting').length,
      calling: rows.filter((r) => r.booking.status === 'calling').length,
      cancelled: rows.filter((r) => r.booking.status === 'cancelled').length,
      special: rows.filter((r) => r.booking.queueType === 'special').length,
    };

    const list = rows.map((r) => ({
      bookingId: r.booking.id,
      patientId: r.patient.id,
      queueNo: r.booking.queueNo,
      queueType: r.booking.queueType,
      bookingDate: r.booking.bookingDate,
      bookingTime: r.booking.bookingTime,
      status: r.booking.status as QueueStatus,
      notes: r.booking.notes || '',
      fullName: r.patient.fullName,
      age: r.patient.age,
      disease: r.patient.disease,
      phoneNumber: r.patient.phoneNumber,
      createdAt: r.booking.createdAt.toISOString(),
    }));

    const config = await getClinicConfig();

    return {
      dateStr,
      stats,
      bookings: list,
      config,
    };
  } catch (error) {
    console.error('Database query failed in getAdminDashboardData:', error);
    throw new Error('ไม่สามารถโหลดข้อมูลแดชบอร์ดเจ้าหน้าที่ได้', { cause: error });
  }
}

export async function updateBookingStatus(
  bookingId: number,
  status: QueueStatus,
  actor: { username: string; role: string },
  treatment?: { providerName: string; diagnosis: string; note?: string },
) {
  try {
    return await db.transaction(async (tx) => {
      const [target] = await tx
        .select()
        .from(bookings)
        .where(eq(bookings.id, bookingId));

      if (!target) {
        throw new Error('BOOKING_NOT_FOUND');
      }

      if (status === 'calling') {
        await tx
          .update(bookings)
          .set({ status: 'completed', updatedAt: new Date() })
          .where(
            and(
              eq(bookings.bookingDate, target.bookingDate),
              eq(bookings.status, 'calling'),
              ne(bookings.id, bookingId),
            ),
          );
      }

      const [updated] = await tx
        .update(bookings)
        .set({ status, updatedAt: new Date() })
        .where(eq(bookings.id, bookingId))
        .returning();

      if (status === 'completed' && treatment && treatment.diagnosis.trim()) {
        await tx.insert(treatmentHistory).values({
          patientId: target.patientId,
          bookingId: target.id,
          queueNo: target.queueNo,
          visitDate: target.bookingDate,
          providerName: treatment.providerName.trim() || 'แพทย์แผนจีน มูลนิธิร่วมกุศลสมุทรปราการ',
          diagnosis: treatment.diagnosis.trim(),
          note: treatment.note?.trim() || '',
        });
      }

      await tx.insert(auditLogs).values({
        actorUsername: actor.username,
        actorRole: actor.role,
        action: `UPDATE_STATUS_${status.toUpperCase()}`,
        targetType: 'booking',
        targetId: String(bookingId),
        details: `คิว ${target.queueNo} -> ${status}`,
      });

      return updated;
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'BOOKING_NOT_FOUND') {
      throw error;
    }
    console.error('Database mutation failed in updateBookingStatus:', error);
    throw new Error('ไม่สามารถอัปเดตสถานะคิวได้', { cause: error });
  }
}

export async function updateBookingDetails(
  bookingId: number,
  updates: {
    fullName?: string;
    age?: number;
    disease?: string;
    phoneNumber?: string;
    bookingDate?: string;
    bookingTime?: string;
    notes?: string;
  },
  actor: { username: string; role: string },
) {
  try {
    return await db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(bookings)
        .where(eq(bookings.id, bookingId));

      if (!existing) {
        throw new Error('BOOKING_NOT_FOUND');
      }

      if (updates.fullName || updates.age !== undefined || updates.disease !== undefined || updates.phoneNumber) {
        await tx
          .update(patients)
          .set({
            ...(updates.fullName ? { fullName: updates.fullName.trim() } : {}),
            ...(updates.age !== undefined ? { age: updates.age } : {}),
            ...(updates.disease !== undefined ? { disease: updates.disease.trim() } : {}),
            ...(updates.phoneNumber ? { phoneNumber: updates.phoneNumber.replace(/\D/g, '') } : {}),
          })
          .where(eq(patients.id, existing.patientId));
      }

      const [updatedBooking] = await tx
        .update(bookings)
        .set({
          ...(updates.bookingDate ? { bookingDate: updates.bookingDate } : {}),
          ...(updates.bookingTime ? { bookingTime: updates.bookingTime } : {}),
          ...(updates.notes !== undefined ? { notes: updates.notes } : {}),
          updatedAt: new Date(),
        })
        .where(eq(bookings.id, bookingId))
        .returning();

      await tx.insert(auditLogs).values({
        actorUsername: actor.username,
        actorRole: actor.role,
        action: updates.bookingDate || updates.bookingTime ? 'RESCHEDULE_BOOKING' : 'EDIT_PATIENT_INFO',
        targetType: 'booking',
        targetId: String(bookingId),
        details: `แก้ไขข้อมูลคิว ${existing.queueNo}`,
      });

      return updatedBooking;
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'BOOKING_NOT_FOUND') {
      throw error;
    }
    console.error('Database mutation failed in updateBookingDetails:', error);
    throw new Error('ไม่สามารถแก้ไขข้อมูลคิวได้', { cause: error });
  }
}

export async function createSpecialBooking(
  input: CreateBookingInput & { notes?: string },
  actor: { username: string; role: string },
) {
  try {
    return await db.transaction(async (tx) => {
      const specialBookings = await tx
        .select()
        .from(bookings)
        .where(
          and(
            eq(bookings.bookingDate, input.bookingDate),
            eq(bookings.queueType, 'special'),
          ),
        );

      const queueNo = `S${String(specialBookings.length + 1).padStart(3, '0')}`;
      const cleanPhone = input.phoneNumber.replace(/\D/g, '');

      const [patientRecord] = await tx
        .insert(patients)
        .values({
          fullName: input.fullName.trim(),
          age: input.age,
          disease: input.disease.trim() || 'เร่งด่วน',
          phoneNumber: cleanPhone,
        })
        .returning();

      const [bookingRecord] = await tx
        .insert(bookings)
        .values({
          patientId: patientRecord.id,
          bookingDate: input.bookingDate,
          bookingTime: input.bookingTime,
          queueNo,
          queueType: 'special',
          status: 'waiting',
          notes: input.notes?.trim() || 'คิวพิเศษเร่งด่วนโดยผู้ดูแลระบบ',
        })
        .returning();

      await tx.insert(auditLogs).values({
        actorUsername: actor.username,
        actorRole: actor.role,
        action: 'CREATE_SPECIAL_QUEUE',
        targetType: 'booking',
        targetId: String(bookingRecord.id),
        details: `ออกคิวพิเศษ ${queueNo} (${patientRecord.fullName})`,
      });

      return {
        bookingId: bookingRecord.id,
        queueNo: bookingRecord.queueNo,
        fullName: patientRecord.fullName,
        bookingDate: bookingRecord.bookingDate,
        bookingTime: bookingRecord.bookingTime,
      };
    });
  } catch (error) {
    console.error('Database mutation failed in createSpecialBooking:', error);
    throw new Error('ไม่สามารถสร้างคิวพิเศษได้', { cause: error });
  }
}

export async function updateScheduleAndPause(
  params: {
    dateStr?: string;
    isOpen?: boolean;
    maxPerSlot?: number;
    note?: string;
    bookingPaused?: boolean;
    pauseReason?: string;
  },
  actor: { username: string; role: string },
) {
  try {
    if (params.dateStr !== undefined && params.isOpen !== undefined) {
      await db
        .insert(scheduleSettings)
        .values({
          dateStr: params.dateStr,
          isOpen: params.isOpen,
          maxPerSlot: params.maxPerSlot ?? 5,
          note: params.note || (params.isOpen ? 'เปิดให้บริการตามปกติ' : 'ปิดรับจองโดยเจ้าหน้าที่'),
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: scheduleSettings.dateStr,
          set: {
            isOpen: params.isOpen,
            ...(params.maxPerSlot ? { maxPerSlot: params.maxPerSlot } : {}),
            ...(params.note !== undefined ? { note: params.note } : {}),
            updatedAt: new Date(),
          },
        });

      await recordAuditLog({
        actorUsername: actor.username,
        actorRole: actor.role,
        action: params.isOpen ? 'OPEN_DATE' : 'CLOSE_DATE',
        targetType: 'schedule',
        targetId: params.dateStr,
        details: params.note || '',
      });
    }

    if (params.bookingPaused !== undefined) {
      await db
        .insert(systemConfig)
        .values({ key: 'booking_paused', value: String(params.bookingPaused), updatedAt: new Date() })
        .onConflictDoUpdate({
          target: systemConfig.key,
          set: { value: String(params.bookingPaused), updatedAt: new Date() },
        });

      if (params.pauseReason !== undefined) {
        await db
          .insert(systemConfig)
          .values({ key: 'pause_reason', value: params.pauseReason, updatedAt: new Date() })
          .onConflictDoUpdate({
            target: systemConfig.key,
            set: { value: params.pauseReason, updatedAt: new Date() },
          });
      }

      await recordAuditLog({
        actorUsername: actor.username,
        actorRole: actor.role,
        action: params.bookingPaused ? 'PAUSE_SYSTEM_BOOKING' : 'RESUME_SYSTEM_BOOKING',
        targetType: 'system_config',
        targetId: 'booking_paused',
        details: params.pauseReason || '',
      });
    }

    return await getClinicConfig();
  } catch (error) {
    console.error('Database mutation failed in updateScheduleAndPause:', error);
    throw new Error('ไม่สามารถบันทึกการตั้งค่าตารางเปิดจองได้', { cause: error });
  }
}

export async function getReportsData(period: 'daily' | 'monthly' | 'yearly', referenceDate: string) {
  try {
    await ensureInitialSeed();
    let startDate = referenceDate;
    let endDate = referenceDate;

    if (period === 'monthly') {
      const prefix = referenceDate.slice(0, 7); // YYYY-MM
      startDate = `${prefix}-01`;
      endDate = `${prefix}-31`;
    } else if (period === 'yearly') {
      const year = referenceDate.slice(0, 4);
      startDate = `${year}-01-01`;
      endDate = `${year}-12-31`;
    }

    const rows = await db
      .select({
        booking: bookings,
        patient: patients,
      })
      .from(bookings)
      .innerJoin(patients, eq(bookings.patientId, patients.id))
      .where(
        and(
          gte(bookings.bookingDate, startDate),
          lte(bookings.bookingDate, endDate),
        ),
      )
      .orderBy(desc(bookings.bookingDate), asc(bookings.id));

    const validRows = rows.filter((r) => r.booking.status !== 'cancelled');
    const totalPatients = validRows.length;
    const avgAge =
      totalPatients > 0
        ? Math.round((validRows.reduce((sum, r) => sum + r.patient.age, 0) / totalPatients) * 10) / 10
        : 0;

    const diseaseMap = new Map<string, number>();
    const slotMap = new Map<string, number>();

    for (const r of validRows) {
      const d = r.patient.disease || 'ไม่ระบุ';
      diseaseMap.set(d, (diseaseMap.get(d) || 0) + 1);
      slotMap.set(r.booking.bookingTime, (slotMap.get(r.booking.bookingTime) || 0) + 1);
    }

    const topDiseases = Array.from(diseaseMap.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);

    const slotDistribution = TIME_SLOTS.map((s) => ({
      slot: s.label,
      count: slotMap.get(s.label) || 0,
    })).sort((a, b) => b.count - a.count);

    return {
      period,
      referenceDate,
      summary: {
        totalBookings: rows.length,
        activePatients: totalPatients,
        completedCount: rows.filter((r) => r.booking.status === 'completed').length,
        cancelledCount: rows.filter((r) => r.booking.status === 'cancelled').length,
        specialCount: rows.filter((r) => r.booking.queueType === 'special').length,
        averageAge: avgAge,
        peakTimeSlot: slotDistribution[0]?.count > 0 ? slotDistribution[0].slot : '-',
      },
      topDiseases,
      slotDistribution,
      records: rows.map((r) => ({
        queueNo: r.booking.queueNo,
        bookingDate: r.booking.bookingDate,
        bookingTime: r.booking.bookingTime,
        fullName: r.patient.fullName,
        age: r.patient.age,
        disease: r.patient.disease,
        phoneNumber: r.patient.phoneNumber,
        queueType: r.booking.queueType === 'special' ? 'คิวพิเศษ' : 'คิวปกติ',
        status: r.booking.status,
      })),
    };
  } catch (error) {
    console.error('Database query failed in getReportsData:', error);
    throw new Error('ไม่สามารถประมวลผลรายงานสถิติได้', { cause: error });
  }
}

export async function getAuditLogsList(limitCount = 40) {
  try {
    return await db
      .select()
      .from(auditLogs)
      .orderBy(desc(auditLogs.createdAt))
      .limit(limitCount);
  } catch (error) {
    console.error('Database query failed in getAuditLogsList:', error);
    throw new Error('ไม่สามารถโหลดประวัติการใช้งานระบบได้', { cause: error });
  }
}

export async function getStaffAccounts() {
  try {
    const list = await db
      .select({
        id: admins.id,
        username: admins.username,
        email: admins.email,
        displayName: admins.displayName,
        role: admins.role,
        isActive: admins.isActive,
        lastLogin: admins.lastLogin,
      })
      .from(admins)
      .orderBy(asc(admins.id));
    return list;
  } catch (error) {
    console.error('Database query failed in getStaffAccounts:', error);
    throw new Error('ไม่สามารถโหลดรายชื่อเจ้าหน้าที่ได้', { cause: error });
  }
}

export async function createOrUpdateStaffAccount(
  input: {
    username: string;
    displayName: string;
    email?: string;
    password?: string;
    role: AdminRole;
    isActive: boolean;
  },
  actor: { username: string; role: string },
) {
  try {
    const cleanUsername = input.username.trim();
    const [existing] = await db
      .select()
      .from(admins)
      .where(eq(admins.username, cleanUsername));

    if (existing) {
      const [updated] = await db
        .update(admins)
        .set({
          displayName: input.displayName.trim(),
          email: input.email?.trim() ? input.email.trim().toLowerCase() : existing.email,
          role: input.role,
          isActive: input.isActive,
          ...(input.password && input.password.length >= 6
            ? { passwordHash: hashPassword(input.password) }
            : {}),
        })
        .where(eq(admins.id, existing.id))
        .returning({
          id: admins.id,
          username: admins.username,
          email: admins.email,
          displayName: admins.displayName,
          role: admins.role,
          isActive: admins.isActive,
        });

      await recordAuditLog({
        actorUsername: actor.username,
        actorRole: actor.role,
        action: 'UPDATE_STAFF_ACCOUNT',
        targetType: 'admin',
        targetId: cleanUsername,
        details: `สิทธิ์: ${input.role}`,
      });
      return updated;
    }

    if (!input.password || input.password.length < 6) {
      throw new Error('PASSWORD_TOO_SHORT');
    }

    const [created] = await db
      .insert(admins)
      .values({
        username: cleanUsername,
        displayName: input.displayName.trim(),
        email: input.email?.trim() ? input.email.trim().toLowerCase() : null,
        passwordHash: hashPassword(input.password),
        role: input.role,
        isActive: input.isActive,
      })
      .returning({
        id: admins.id,
        username: admins.username,
        email: admins.email,
        displayName: admins.displayName,
        role: admins.role,
        isActive: admins.isActive,
      });

    await recordAuditLog({
      actorUsername: actor.username,
      actorRole: actor.role,
      action: 'CREATE_STAFF_ACCOUNT',
      targetType: 'admin',
      targetId: cleanUsername,
      details: `สร้างบัญชีสิทธิ์: ${input.role}`,
    });

    return created;
  } catch (error) {
    if (error instanceof Error && error.message === 'PASSWORD_TOO_SHORT') {
      throw error;
    }
    console.error('Database mutation failed in createOrUpdateStaffAccount:', error);
    throw new Error('ไม่สามารถบันทึกข้อมูลบัญชีเจ้าหน้าที่ได้', { cause: error });
  }
}
