import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import {
  getBangkokDateStr,
  maskPhoneNumber,
  TIME_SLOTS,
  type AdminRole,
  type QueueStatus,
} from '../lib/constants.ts';
import { hashPassword } from './password.ts';

interface StorePatient {
  id: number;
  fullName: string;
  age: number;
  disease: string;
  phoneNumber: string;
  createdAt: string;
}

interface StoreBooking {
  id: number;
  patientId: number;
  bookingDate: string;
  bookingTime: string;
  queueNo: string;
  queueType: string;
  status: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

interface StoreTreatment {
  id: number;
  patientId: number;
  bookingId: number;
  queueNo: string;
  visitDate: string;
  providerName: string;
  diagnosis: string;
  note: string;
  createdAt: string;
}

interface StoreAdmin {
  id: number;
  uid: string | null;
  email: string | null;
  username: string;
  passwordHash: string;
  displayName: string;
  role: string;
  isActive: boolean;
  lastLogin: string | null;
  createdAt: string;
}

interface StoreSchedule {
  id: number;
  dateStr: string;
  isOpen: boolean;
  maxPerSlot: number;
  note: string;
  updatedAt: string;
}

interface StoreAuditLog {
  id: number;
  actorUsername: string;
  actorRole: string;
  action: string;
  targetType: string;
  targetId: string | null;
  details: string | null;
  createdAt: string;
}

interface LocalClinicStore {
  nextIds: {
    patients: number;
    bookings: number;
    treatmentHistory: number;
    admins: number;
    scheduleSettings: number;
    auditLogs: number;
  };
  systemConfig: Record<string, string>;
  patients: StorePatient[];
  bookings: StoreBooking[];
  treatmentHistory: StoreTreatment[];
  admins: StoreAdmin[];
  scheduleSettings: StoreSchedule[];
  auditLogs: StoreAuditLog[];
}

const DATA_DIR = path.resolve(process.cwd(), '.data');
const STORE_PATH = path.join(DATA_DIR, 'clinic-store.json');

let writeChain: Promise<unknown> = Promise.resolve();

function withLock<T>(fn: () => Promise<T> | T): Promise<T> {
  const next = writeChain.then(() => fn());
  writeChain = next.catch(() => undefined);
  return next;
}

function createInitialStore(): LocalClinicStore {
  const now = new Date().toISOString();
  const bootstrapPassword = process.env.ADMIN_BOOTSTRAP_PASSWORD || '1571';
  return {
    nextIds: {
      patients: 1,
      bookings: 1,
      treatmentHistory: 1,
      admins: 2,
      scheduleSettings: 1,
      auditLogs: 1,
    },
    systemConfig: {
      booking_paused: 'false',
      pause_reason: '',
    },
    patients: [],
    bookings: [],
    treatmentHistory: [],
    admins: [
      {
        id: 1,
        uid: null,
        email: null,
        username: 'Admin1571',
        passwordHash: hashPassword(bootstrapPassword),
        displayName: 'ผู้ดูแลระบบ (Admin1571)',
        role: 'super_admin',
        isActive: true,
        lastLogin: null,
        createdAt: now,
      },
    ],
    scheduleSettings: [],
    auditLogs: [],
  };
}

function ensureAdmin1571(store: LocalClinicStore): boolean {
  const existing = store.admins.find(
    (a) => a.username.toLowerCase() === 'admin1571',
  );
  if (existing) return false;
  const now = new Date().toISOString();
  const bootstrapPassword = process.env.ADMIN_BOOTSTRAP_PASSWORD || '1571';
  const id = store.nextIds.admins++;
  store.admins.push({
    id,
    uid: null,
    email: null,
    username: 'Admin1571',
    passwordHash: hashPassword(bootstrapPassword),
    displayName: 'ผู้ดูแลระบบ (Admin1571)',
    role: 'super_admin',
    isActive: true,
    lastLogin: null,
    createdAt: now,
  });
  return true;
}

function readStore(): LocalClinicStore {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(STORE_PATH)) {
    const initial = createInitialStore();
    saveStore(initial);
    return initial;
  }
  try {
    const raw = fs.readFileSync(STORE_PATH, 'utf8');
    const parsed = JSON.parse(raw) as LocalClinicStore;
    if (ensureAdmin1571(parsed)) {
      saveStore(parsed);
    }
    return parsed;
  } catch {
    const initial = createInitialStore();
    saveStore(initial);
    return initial;
  }
}

function saveStore(store: LocalClinicStore): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  const tmpPath = `${STORE_PATH}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tmpPath, JSON.stringify(store, null, 2), 'utf8');
  fs.renameSync(tmpPath, STORE_PATH);
}

export async function localGetClinicConfig() {
  const store = readStore();
  const today = getBangkokDateStr(0);
  const dates = store.scheduleSettings
    .filter((d) => d.dateStr >= today)
    .sort((a, b) => a.dateStr.localeCompare(b.dateStr))
    .map((d) => ({
      ...d,
      updatedAt: new Date(d.updatedAt),
    }));

  return {
    bookingPaused: store.systemConfig.booking_paused === 'true',
    pauseReason: store.systemConfig.pause_reason || '',
    dates,
    timeSlots: TIME_SLOTS,
  };
}

export async function localGetSlotsAvailability(dateStr: string) {
  const store = readStore();
  const schedule = store.scheduleSettings.find((s) => s.dateStr === dateStr);
  const maxPerSlot = schedule?.maxPerSlot ?? 5;
  const isDateOpen = schedule ? schedule.isOpen : false;

  const dayBookings = store.bookings.filter(
    (b) =>
      b.bookingDate === dateStr &&
      b.queueType === 'regular' &&
      b.status !== 'cancelled',
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

  return {
    dateStr,
    isOpen: isDateOpen,
    note: schedule?.note || '',
    totalBooked: slots.reduce((acc, s) => acc + s.bookedCount, 0),
    totalCapacity: slots.reduce((acc, s) => acc + s.maxPerSlot, 0),
    slots,
  };
}

export async function localCreatePublicBooking(input: {
  fullName: string;
  age: number;
  disease: string;
  phoneNumber: string;
  bookingDate: string;
  bookingTime: string;
}) {
  return withLock(() => {
    const store = readStore();
    if (store.systemConfig.booking_paused === 'true') {
      throw new Error('BOOKING_PAUSED');
    }

    const schedule = store.scheduleSettings.find(
      (s) => s.dateStr === input.bookingDate,
    );
    if (!schedule || !schedule.isOpen) {
      throw new Error('DATE_CLOSED');
    }

    const validSlot = TIME_SLOTS.find((s) => s.label === input.bookingTime);
    if (!validSlot) {
      throw new Error('INVALID_SLOT');
    }

    const existingSlotBookings = store.bookings.filter(
      (b) =>
        b.bookingDate === input.bookingDate &&
        b.bookingTime === input.bookingTime &&
        b.queueType === 'regular' &&
        b.status !== 'cancelled',
    );
    if (existingSlotBookings.length >= schedule.maxPerSlot) {
      throw new Error('SLOT_FULL');
    }

    const allDayRegular = store.bookings.filter(
      (b) => b.bookingDate === input.bookingDate && b.queueType === 'regular',
    );
    const queueNo = `A${String(allDayRegular.length + 1).padStart(3, '0')}`;
    const cleanPhone = input.phoneNumber.replace(/\D/g, '');
    const now = new Date().toISOString();

    let patient = store.patients.find((p) => p.phoneNumber === cleanPhone);
    if (patient) {
      patient.fullName = input.fullName.trim();
      patient.age = input.age;
      patient.disease = input.disease.trim() || 'ไม่มีโรคประจำตัว';
    } else {
      patient = {
        id: store.nextIds.patients++,
        fullName: input.fullName.trim(),
        age: input.age,
        disease: input.disease.trim() || 'ไม่มีโรคประจำตัว',
        phoneNumber: cleanPhone,
        createdAt: now,
      };
      store.patients.push(patient);
    }

    const booking: StoreBooking = {
      id: store.nextIds.bookings++,
      patientId: patient.id,
      bookingDate: input.bookingDate,
      bookingTime: input.bookingTime,
      queueNo,
      queueType: 'regular',
      status: 'waiting',
      notes: '',
      createdAt: now,
      updatedAt: now,
    };
    store.bookings.push(booking);
    saveStore(store);

    return {
      bookingId: booking.id,
      patientId: patient.id,
      queueNo: booking.queueNo,
      queueType: booking.queueType,
      fullName: patient.fullName,
      age: patient.age,
      disease: patient.disease,
      phoneNumber: patient.phoneNumber,
      bookingDate: booking.bookingDate,
      bookingTime: booking.bookingTime,
      status: booking.status as QueueStatus,
      createdAt: booking.createdAt,
    };
  });
}

export async function localGetLiveQueueStatus(
  dateStr: string,
  searchQuery?: string,
) {
  const store = readStore();
  const patientMap = new Map(store.patients.map((p) => [p.id, p]));
  const rows = store.bookings
    .filter((b) => b.bookingDate === dateStr)
    .sort((a, b) => a.id - b.id)
    .map((b) => ({ booking: b, patient: patientMap.get(b.patientId)! }))
    .filter((r) => Boolean(r.patient));

  const callingRow = rows.find((r) => r.booking.status === 'calling');
  const waitingRows = rows.filter((r) => r.booking.status === 'waiting');
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

    let found = rows.find(
      (r) =>
        r.booking.queueNo.toUpperCase() === upperQuery ||
        (normalizedDigits.length >= 9 &&
          r.patient.phoneNumber === normalizedDigits),
    );

    if (!found) {
      const allDesc = [...store.bookings]
        .sort((a, b) => b.id - a.id)
        .map((b) => ({ booking: b, patient: patientMap.get(b.patientId)! }))
        .filter((r) => Boolean(r.patient));
      found = allDesc.find(
        (r) =>
          r.booking.queueNo.toUpperCase() === upperQuery ||
          (normalizedDigits.length >= 9 &&
            r.patient.phoneNumber === normalizedDigits),
      );
    }

    if (found) {
      let queuesAhead = 0;
      if (found.booking.status === 'waiting') {
        if (found.booking.bookingDate === dateStr) {
          const idx = orderedWaiting.findIndex(
            (w) => w.booking.id === found!.booking.id,
          );
          queuesAhead = idx >= 0 ? idx + (callingRow ? 1 : 0) : 0;
        } else {
          const targetWaiting = store.bookings
            .filter(
              (b) =>
                b.bookingDate === found!.booking.bookingDate &&
                (b.status === 'waiting' || b.status === 'calling'),
            )
            .sort((a, b) => a.id - b.id);
          const idx = targetWaiting.findIndex(
            (b) => b.id === found!.booking.id,
          );
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
}

export async function localSearchTreatmentHistory(query: string) {
  const store = readStore();
  const clean = query.trim();
  if (!clean) return [];
  const digits = clean.replace(/\D/g, '');
  const patientMap = new Map(store.patients.map((p) => [p.id, p]));

  return [...store.treatmentHistory]
    .sort((a, b) =>
      b.visitDate !== a.visitDate
        ? b.visitDate.localeCompare(a.visitDate)
        : b.id - a.id,
    )
    .map((visit) => ({ visit, patient: patientMap.get(visit.patientId) }))
    .filter(
      (r): r is { visit: StoreTreatment; patient: StorePatient } =>
        Boolean(r.patient),
    )
    .filter((r) => {
      if (digits.length >= 9) return r.patient.phoneNumber === digits;
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
}

export async function localFindOrProvisionGoogleAdmin(
  uid: string,
  email: string,
  name?: string,
) {
  return withLock(() => {
    const store = readStore();
    const normalizedEmail = email.toLowerCase().trim();
    const existing = store.admins.find(
      (a) => a.email?.toLowerCase() === normalizedEmail,
    );
    const now = new Date().toISOString();

    if (existing) {
      if (!existing.isActive) return null;
      existing.uid = uid;
      existing.lastLogin = now;
      saveStore(store);
      return {
        ...existing,
        lastLogin: existing.lastLogin ? new Date(existing.lastLogin) : null,
        createdAt: new Date(existing.createdAt),
      };
    }

    if (normalizedEmail === 'emsrkl1669@gmail.com') {
      const admin1571 = store.admins.find(
        (a) => a.username.toLowerCase() === 'admin1571' && !a.email,
      );
      if (admin1571) {
        admin1571.uid = uid;
        admin1571.email = normalizedEmail;
        admin1571.isActive = true;
        admin1571.lastLogin = now;
        saveStore(store);
        return {
          ...admin1571,
          lastLogin: admin1571.lastLogin ? new Date(admin1571.lastLogin) : null,
          createdAt: new Date(admin1571.createdAt),
        };
      }

      const created: StoreAdmin = {
        id: store.nextIds.admins++,
        uid,
        email: normalizedEmail,
        username: 'emsrkl1669',
        passwordHash: hashPassword(crypto.randomBytes(16).toString('hex')),
        displayName: name || 'ผู้ดูแลระบบหลัก (มูลนิธิร่วมกุศลฯ)',
        role: 'super_admin',
        isActive: true,
        lastLogin: now,
        createdAt: now,
      };
      store.admins.push(created);
      saveStore(store);
      return {
        ...created,
        lastLogin: created.lastLogin ? new Date(created.lastLogin) : null,
        createdAt: new Date(created.createdAt),
      };
    }

    return null;
  });
}

export async function localFindAdminByUsername(username: string) {
  const store = readStore();
  const clean = username.trim().toLowerCase();
  if (!clean) return null;
  const found =
    store.admins.find(
      (a) =>
        a.username.toLowerCase() === clean ||
        (clean.includes('@') && a.email?.toLowerCase() === clean),
    ) || null;
  if (!found) return null;
  return {
    ...found,
    lastLogin: found.lastLogin ? new Date(found.lastLogin) : null,
    createdAt: new Date(found.createdAt),
  };
}

export async function localMarkAdminLastLogin(adminId: number) {
  return withLock(() => {
    const store = readStore();
    const target = store.admins.find((a) => a.id === adminId);
    if (target) {
      target.lastLogin = new Date().toISOString();
      saveStore(store);
    }
  });
}

export async function localRecordAuditLog(params: {
  actorUsername: string;
  actorRole: string;
  action: string;
  targetType: string;
  targetId?: string;
  details?: string;
}) {
  return withLock(() => {
    const store = readStore();
    store.auditLogs.push({
      id: store.nextIds.auditLogs++,
      actorUsername: params.actorUsername,
      actorRole: params.actorRole,
      action: params.action,
      targetType: params.targetType,
      targetId: params.targetId || null,
      details: params.details || null,
      createdAt: new Date().toISOString(),
    });
    saveStore(store);
  });
}

export async function localGetAdminDashboardData(dateStr: string) {
  const store = readStore();
  const patientMap = new Map(store.patients.map((p) => [p.id, p]));
  const rows = store.bookings
    .filter((b) => b.bookingDate === dateStr)
    .sort((a, b) => a.id - b.id)
    .map((b) => ({ booking: b, patient: patientMap.get(b.patientId)! }))
    .filter((r) => Boolean(r.patient));

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
    createdAt: r.booking.createdAt,
  }));

  const config = await localGetClinicConfig();
  return { dateStr, stats, bookings: list, config };
}

export async function localUpdateBookingStatus(
  bookingId: number,
  status: QueueStatus,
  actor: { username: string; role: string },
  treatment?: { providerName: string; diagnosis: string; note?: string },
) {
  return withLock(() => {
    const store = readStore();
    const target = store.bookings.find((b) => b.id === bookingId);
    if (!target) {
      throw new Error('BOOKING_NOT_FOUND');
    }

    const now = new Date().toISOString();
    if (status === 'calling') {
      for (const b of store.bookings) {
        if (
          b.bookingDate === target.bookingDate &&
          b.status === 'calling' &&
          b.id !== bookingId
        ) {
          b.status = 'completed';
          b.updatedAt = now;
        }
      }
    }

    target.status = status;
    target.updatedAt = now;

    if (status === 'completed' && treatment && treatment.diagnosis.trim()) {
      store.treatmentHistory.push({
        id: store.nextIds.treatmentHistory++,
        patientId: target.patientId,
        bookingId: target.id,
        queueNo: target.queueNo,
        visitDate: target.bookingDate,
        providerName:
          treatment.providerName.trim() ||
          'แพทย์แผนจีน มูลนิธิร่วมกุศลสมุทรปราการ',
        diagnosis: treatment.diagnosis.trim(),
        note: treatment.note?.trim() || '',
        createdAt: now,
      });
    }

    store.auditLogs.push({
      id: store.nextIds.auditLogs++,
      actorUsername: actor.username,
      actorRole: actor.role,
      action: `UPDATE_STATUS_${status.toUpperCase()}`,
      targetType: 'booking',
      targetId: String(bookingId),
      details: `คิว ${target.queueNo} -> ${status}`,
      createdAt: now,
    });

    saveStore(store);
    return {
      ...target,
      createdAt: new Date(target.createdAt),
      updatedAt: new Date(target.updatedAt),
    };
  });
}

export async function localUpdateBookingDetails(
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
  return withLock(() => {
    const store = readStore();
    const existing = store.bookings.find((b) => b.id === bookingId);
    if (!existing) {
      throw new Error('BOOKING_NOT_FOUND');
    }

    const patient = store.patients.find((p) => p.id === existing.patientId);
    if (patient) {
      if (updates.fullName) patient.fullName = updates.fullName.trim();
      if (updates.age !== undefined) patient.age = updates.age;
      if (updates.disease !== undefined) patient.disease = updates.disease.trim();
      if (updates.phoneNumber) {
        patient.phoneNumber = updates.phoneNumber.replace(/\D/g, '');
      }
    }

    const now = new Date().toISOString();
    if (updates.bookingDate) existing.bookingDate = updates.bookingDate;
    if (updates.bookingTime) existing.bookingTime = updates.bookingTime;
    if (updates.notes !== undefined) existing.notes = updates.notes;
    existing.updatedAt = now;

    store.auditLogs.push({
      id: store.nextIds.auditLogs++,
      actorUsername: actor.username,
      actorRole: actor.role,
      action:
        updates.bookingDate || updates.bookingTime
          ? 'RESCHEDULE_BOOKING'
          : 'EDIT_PATIENT_INFO',
      targetType: 'booking',
      targetId: String(bookingId),
      details: `แก้ไขข้อมูลคิว ${existing.queueNo}`,
      createdAt: now,
    });

    saveStore(store);
    return {
      ...existing,
      createdAt: new Date(existing.createdAt),
      updatedAt: new Date(existing.updatedAt),
    };
  });
}

export async function localCreateSpecialBooking(
  input: {
    fullName: string;
    age: number;
    disease: string;
    phoneNumber: string;
    bookingDate: string;
    bookingTime: string;
    notes?: string;
  },
  actor: { username: string; role: string },
) {
  return withLock(() => {
    const store = readStore();
    const specialCount = store.bookings.filter(
      (b) => b.bookingDate === input.bookingDate && b.queueType === 'special',
    ).length;
    const queueNo = `S${String(specialCount + 1).padStart(3, '0')}`;
    const cleanPhone = input.phoneNumber.replace(/\D/g, '');
    const now = new Date().toISOString();

    const patient: StorePatient = {
      id: store.nextIds.patients++,
      fullName: input.fullName.trim(),
      age: input.age,
      disease: input.disease.trim() || 'เร่งด่วน',
      phoneNumber: cleanPhone,
      createdAt: now,
    };
    store.patients.push(patient);

    const booking: StoreBooking = {
      id: store.nextIds.bookings++,
      patientId: patient.id,
      bookingDate: input.bookingDate,
      bookingTime: input.bookingTime,
      queueNo,
      queueType: 'special',
      status: 'waiting',
      notes: input.notes?.trim() || 'คิวพิเศษเร่งด่วนโดยผู้ดูแลระบบ',
      createdAt: now,
      updatedAt: now,
    };
    store.bookings.push(booking);

    store.auditLogs.push({
      id: store.nextIds.auditLogs++,
      actorUsername: actor.username,
      actorRole: actor.role,
      action: 'CREATE_SPECIAL_QUEUE',
      targetType: 'booking',
      targetId: String(booking.id),
      details: `ออกคิวพิเศษ ${queueNo} (${patient.fullName})`,
      createdAt: now,
    });

    saveStore(store);
    return {
      bookingId: booking.id,
      queueNo: booking.queueNo,
      fullName: patient.fullName,
      bookingDate: booking.bookingDate,
      bookingTime: booking.bookingTime,
    };
  });
}

export async function localUpdateScheduleAndPause(
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
  await withLock(() => {
    const store = readStore();
    const now = new Date().toISOString();

    if (params.dateStr !== undefined && params.isOpen !== undefined) {
      const existing = store.scheduleSettings.find(
        (s) => s.dateStr === params.dateStr,
      );
      if (existing) {
        existing.isOpen = params.isOpen;
        if (params.maxPerSlot) existing.maxPerSlot = params.maxPerSlot;
        if (params.note !== undefined) existing.note = params.note;
        existing.updatedAt = now;
      } else {
        store.scheduleSettings.push({
          id: store.nextIds.scheduleSettings++,
          dateStr: params.dateStr,
          isOpen: params.isOpen,
          maxPerSlot: params.maxPerSlot ?? 5,
          note:
            params.note ||
            (params.isOpen ? 'เปิดให้บริการตามปกติ' : 'ปิดรับจองโดยเจ้าหน้าที่'),
          updatedAt: now,
        });
      }

      store.auditLogs.push({
        id: store.nextIds.auditLogs++,
        actorUsername: actor.username,
        actorRole: actor.role,
        action: params.isOpen ? 'OPEN_DATE' : 'CLOSE_DATE',
        targetType: 'schedule',
        targetId: params.dateStr,
        details: params.note || '',
        createdAt: now,
      });
    }

    if (params.bookingPaused !== undefined) {
      store.systemConfig.booking_paused = String(params.bookingPaused);
      if (params.pauseReason !== undefined) {
        store.systemConfig.pause_reason = params.pauseReason;
      }
      store.auditLogs.push({
        id: store.nextIds.auditLogs++,
        actorUsername: actor.username,
        actorRole: actor.role,
        action: params.bookingPaused
          ? 'PAUSE_SYSTEM_BOOKING'
          : 'RESUME_SYSTEM_BOOKING',
        targetType: 'system_config',
        targetId: 'booking_paused',
        details: params.pauseReason || '',
        createdAt: now,
      });
    }

    saveStore(store);
  });

  return localGetClinicConfig();
}

export async function localGetReportsData(
  period: 'daily' | 'monthly' | 'yearly',
  referenceDate: string,
) {
  const store = readStore();
  let startDate = referenceDate;
  let endDate = referenceDate;

  if (period === 'monthly') {
    const prefix = referenceDate.slice(0, 7);
    startDate = `${prefix}-01`;
    endDate = `${prefix}-31`;
  } else if (period === 'yearly') {
    const year = referenceDate.slice(0, 4);
    startDate = `${year}-01-01`;
    endDate = `${year}-12-31`;
  }

  const patientMap = new Map(store.patients.map((p) => [p.id, p]));
  const rows = store.bookings
    .filter((b) => b.bookingDate >= startDate && b.bookingDate <= endDate)
    .sort((a, b) =>
      b.bookingDate !== a.bookingDate
        ? b.bookingDate.localeCompare(a.bookingDate)
        : a.id - b.id,
    )
    .map((b) => ({ booking: b, patient: patientMap.get(b.patientId)! }))
    .filter((r) => Boolean(r.patient));

  const validRows = rows.filter((r) => r.booking.status !== 'cancelled');
  const totalPatients = validRows.length;
  const avgAge =
    totalPatients > 0
      ? Math.round(
          (validRows.reduce((sum, r) => sum + r.patient.age, 0) /
            totalPatients) *
            10,
        ) / 10
      : 0;

  const diseaseMap = new Map<string, number>();
  const slotMap = new Map<string, number>();

  for (const r of validRows) {
    const d = r.patient.disease || 'ไม่ระบุ';
    diseaseMap.set(d, (diseaseMap.get(d) || 0) + 1);
    slotMap.set(
      r.booking.bookingTime,
      (slotMap.get(r.booking.bookingTime) || 0) + 1,
    );
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
      completedCount: rows.filter((r) => r.booking.status === 'completed')
        .length,
      cancelledCount: rows.filter((r) => r.booking.status === 'cancelled')
        .length,
      specialCount: rows.filter((r) => r.booking.queueType === 'special')
        .length,
      averageAge: avgAge,
      peakTimeSlot:
        slotDistribution[0]?.count > 0 ? slotDistribution[0].slot : '-',
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
}

export async function localGetAuditLogsList(limitCount = 40) {
  const store = readStore();
  return [...store.auditLogs]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limitCount)
    .map((log) => ({
      ...log,
      createdAt: new Date(log.createdAt),
    }));
}

export async function localGetStaffAccounts() {
  const store = readStore();
  return [...store.admins]
    .sort((a, b) => a.id - b.id)
    .map((a) => ({
      id: a.id,
      username: a.username,
      email: a.email,
      displayName: a.displayName,
      role: a.role,
      isActive: a.isActive,
      lastLogin: a.lastLogin ? new Date(a.lastLogin) : null,
    }));
}

export async function localCreateOrUpdateStaffAccount(
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
  return withLock(() => {
    const store = readStore();
    const cleanUsername = input.username.trim();
    const existing = store.admins.find(
      (a) => a.username.toLowerCase() === cleanUsername.toLowerCase(),
    );
    const now = new Date().toISOString();

    if (existing) {
      existing.displayName = input.displayName.trim();
      existing.email = input.email?.trim()
        ? input.email.trim().toLowerCase()
        : existing.email;
      existing.role = input.role;
      existing.isActive = input.isActive;
      if (input.password && input.password.length >= 6) {
        existing.passwordHash = hashPassword(input.password);
      }

      store.auditLogs.push({
        id: store.nextIds.auditLogs++,
        actorUsername: actor.username,
        actorRole: actor.role,
        action: 'UPDATE_STAFF_ACCOUNT',
        targetType: 'admin',
        targetId: cleanUsername,
        details: `สิทธิ์: ${input.role}`,
        createdAt: now,
      });
      saveStore(store);

      return {
        id: existing.id,
        username: existing.username,
        email: existing.email,
        displayName: existing.displayName,
        role: existing.role,
        isActive: existing.isActive,
      };
    }

    if (!input.password || input.password.length < 6) {
      throw new Error('PASSWORD_TOO_SHORT');
    }

    const created: StoreAdmin = {
      id: store.nextIds.admins++,
      uid: null,
      email: input.email?.trim() ? input.email.trim().toLowerCase() : null,
      username: cleanUsername,
      passwordHash: hashPassword(input.password),
      displayName: input.displayName.trim(),
      role: input.role,
      isActive: input.isActive,
      lastLogin: null,
      createdAt: now,
    };
    store.admins.push(created);

    store.auditLogs.push({
      id: store.nextIds.auditLogs++,
      actorUsername: actor.username,
      actorRole: actor.role,
      action: 'CREATE_STAFF_ACCOUNT',
      targetType: 'admin',
      targetId: cleanUsername,
      details: `สร้างบัญชีสิทธิ์: ${input.role}`,
      createdAt: now,
    });
    saveStore(store);

    return {
      id: created.id,
      username: created.username,
      email: created.email,
      displayName: created.displayName,
      role: created.role,
      isActive: created.isActive,
    };
  });
}
