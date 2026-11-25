import {
  addDoc,
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type Unsubscribe,
} from 'firebase/firestore';
import { auth, db } from './firebase';
import { handleFirestoreError, OperationType } from './firestoreError';
import type { AdminRole, QueueStatus } from './constants';

export interface FirestoreClinicConfig {
  bookingPaused: boolean;
  pauseReason: string;
}

export interface FirestoreScheduleDate {
  dateStr: string;
  isOpen: boolean;
  maxPerSlot: number;
  note?: string;
}

export interface FirestorePublicQueueItem {
  bookingId: string;
  queueNo: string;
  queueType: 'regular' | 'special';
  bookingDate: string;
  bookingTime: string;
  status: QueueStatus;
}

export interface SyncBookingInput {
  bookingId: number | string;
  queueNo: string;
  queueType: string;
  bookingDate: string;
  bookingTime: string;
  status: QueueStatus;
  fullName: string;
  age: number;
  disease: string;
  phoneNumber: string;
  notes?: string;
}

function clampString(val: string | null | undefined, maxLen: number, fallback = ''): string {
  const s = (val ?? '').trim();
  if (!s) return fallback;
  return s.length > maxLen ? s.slice(0, maxLen) : s;
}

function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length >= 9 && digits.length <= 15) return digits;
  return digits.padEnd(9, '0').slice(0, 15);
}

function isValidDateStr(dateStr: string): boolean {
  return /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(dateStr);
}

function isValidDocId(id: string): boolean {
  return /^[a-zA-Z0-9_-]{1,128}$/.test(id);
}

function hasVerifiedFirebaseUser(): boolean {
  return Boolean(auth.currentUser && auth.currentUser.emailVerified);
}

// --- Public Real-time Subscriptions (Non-PII Only) ---

export function subscribeClinicConfig(
  onData: (cfg: FirestoreClinicConfig) => void,
): Unsubscribe {
  const path = 'clinic_config/settings';
  return onSnapshot(
    doc(db, 'clinic_config', 'settings'),
    (snap) => {
      if (!snap.exists()) return;
      const data = snap.data();
      onData({
        bookingPaused: Boolean(data.bookingPaused),
        pauseReason: typeof data.pauseReason === 'string' ? data.pauseReason : '',
      });
    },
    (error) => {
      handleFirestoreError(error, OperationType.GET, path);
    },
  );
}

export function subscribeScheduleDates(
  onData: (dates: FirestoreScheduleDate[]) => void,
): Unsubscribe {
  const path = 'schedule_dates';
  const q = query(collection(db, path), where('dateStr', '>=', '2000-01-01'));
  return onSnapshot(
    q,
    (snap) => {
      if (snap.empty) return;
      const rows: FirestoreScheduleDate[] = [];
      snap.forEach((docSnap) => {
        const d = docSnap.data();
        if (typeof d.dateStr === 'string' && isValidDateStr(d.dateStr)) {
          rows.push({
            dateStr: d.dateStr,
            isOpen: Boolean(d.isOpen),
            maxPerSlot: typeof d.maxPerSlot === 'number' ? d.maxPerSlot : 5,
            note: typeof d.note === 'string' ? d.note : '',
          });
        }
      });
      rows.sort((a, b) => a.dateStr.localeCompare(b.dateStr));
      onData(rows);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    },
  );
}

export function subscribePublicQueue(
  dateStr: string,
  onData: (items: FirestorePublicQueueItem[]) => void,
): Unsubscribe {
  const path = 'public_queue';
  if (!isValidDateStr(dateStr)) {
    return () => {};
  }
  const q = query(
    collection(db, path),
    where('bookingDate', '==', dateStr),
    where('status', 'in', ['waiting', 'calling', 'completed', 'cancelled']),
  );
  return onSnapshot(
    q,
    (snap) => {
      const items: FirestorePublicQueueItem[] = [];
      snap.forEach((docSnap) => {
        const d = docSnap.data();
        if (typeof d.queueNo === 'string' && typeof d.bookingDate === 'string') {
          items.push({
            bookingId: String(d.bookingId || docSnap.id),
            queueNo: d.queueNo,
            queueType: d.queueType === 'special' ? 'special' : 'regular',
            bookingDate: d.bookingDate,
            bookingTime: String(d.bookingTime || ''),
            status: (d.status as QueueStatus) || 'waiting',
          });
        }
      });
      onData(items);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    },
  );
}

// --- Verified Admin Sync Helpers ---

export async function ensureGoogleAdminDocInFirestore(user: {
  displayName: string;
  email: string | null;
  role: AdminRole;
}): Promise<void> {
  if (!hasVerifiedFirebaseUser() || !auth.currentUser) return;
  if (user.role !== 'super_admin') return;

  const uid = auth.currentUser.uid;
  if (!isValidDocId(uid)) return;
  const path = `admins/${uid}`;
  const ref = doc(db, 'admins', uid);

  try {
    await setDoc(ref, {
      uid,
      email: clampString(auth.currentUser.email || user.email, 160, 'staff@clinic.local'),
      displayName: clampString(user.displayName, 120, 'ผู้ดูแลระบบ'),
      role: user.role,
      isActive: true,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function syncClinicConfigToFirestore(
  bookingPaused: boolean,
  pauseReason: string,
  role: AdminRole,
): Promise<void> {
  if (!hasVerifiedFirebaseUser() || !auth.currentUser || role !== 'super_admin') return;
  const path = 'clinic_config/settings';
  try {
    await setDoc(doc(db, 'clinic_config', 'settings'), {
      bookingPaused: Boolean(bookingPaused),
      pauseReason: clampString(pauseReason, 240, ''),
      updatedAt: serverTimestamp(),
      updatedBy: clampString(auth.currentUser.uid, 128, 'admin'),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function syncScheduleDateToFirestore(
  dateStr: string,
  isOpen: boolean,
  maxPerSlot: number,
  note: string,
  role: AdminRole,
): Promise<void> {
  if (!hasVerifiedFirebaseUser() || role !== 'super_admin') return;
  if (!isValidDateStr(dateStr)) return;
  const path = `schedule_dates/${dateStr}`;
  const clampedMax = Math.min(20, Math.max(1, Math.trunc(maxPerSlot || 5)));

  try {
    await setDoc(doc(db, 'schedule_dates', dateStr), {
      dateStr,
      isOpen: Boolean(isOpen),
      maxPerSlot: clampedMax,
      note: clampString(note, 200, ''),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function syncBookingRecordToFirestore(
  booking: SyncBookingInput,
  role: AdminRole,
): Promise<void> {
  if (!hasVerifiedFirebaseUser()) return;
  const bookingId = String(booking.bookingId);
  if (!isValidDocId(bookingId) || !isValidDateStr(booking.bookingDate)) return;

  const queueType = booking.queueType === 'special' ? 'special' : 'regular';
  const queueNo = clampString(booking.queueNo, 16, 'A001');
  const bookingTime = clampString(booking.bookingTime, 40, '09.00 - 09.30 น.');
  const fullName = clampString(booking.fullName, 120, 'ผู้รับบริการ');
  const age = Math.min(120, Math.max(1, Math.trunc(Number(booking.age) || 1)));
  const disease = clampString(booking.disease, 160, 'ไม่มีโรคประจำตัว');
  const phoneNumber = normalizePhone(booking.phoneNumber);
  const notes = clampString(booking.notes, 300, '');

  const bookingPath = `bookings/${bookingId}`;
  const bookingRef = doc(db, 'bookings', bookingId);
  try {
    const existingSnap = await getDoc(bookingRef);
    if (!existingSnap.exists()) {
      await setDoc(bookingRef, {
        bookingId,
        queueNo,
        queueType,
        bookingDate: booking.bookingDate,
        bookingTime,
        status: booking.status,
        fullName,
        age,
        disease,
        phoneNumber,
        notes,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else if (role === 'super_admin') {
      await updateDoc(bookingRef, {
        fullName,
        age,
        disease,
        phoneNumber,
        bookingDate: booking.bookingDate,
        bookingTime,
        status: booking.status,
        notes,
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(bookingRef, {
        status: booking.status,
        notes,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, bookingPath);
  }

  const publicPath = `public_queue/${bookingId}`;
  try {
    await setDoc(doc(db, 'public_queue', bookingId), {
      bookingId,
      queueNo,
      queueType,
      bookingDate: booking.bookingDate,
      bookingTime,
      status: booking.status,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, publicPath);
  }
}

export async function syncTreatmentRecordToFirestore(params: {
  booking: SyncBookingInput;
  providerName: string;
  diagnosis: string;
  note?: string;
  role: AdminRole;
}): Promise<void> {
  if (!hasVerifiedFirebaseUser()) return;
  await syncBookingRecordToFirestore(
    { ...params.booking, status: 'completed' },
    params.role,
  );

  const bookingId = String(params.booking.bookingId);
  if (!isValidDocId(bookingId) || !isValidDateStr(params.booking.bookingDate)) return;

  const path = 'treatment_history';
  try {
    await addDoc(collection(db, path), {
      bookingId,
      queueNo: clampString(params.booking.queueNo, 16, 'A001'),
      visitDate: params.booking.bookingDate,
      patientName: clampString(params.booking.fullName, 120, 'ผู้รับบริการ'),
      phoneNumber: normalizePhone(params.booking.phoneNumber),
      providerName: clampString(params.providerName, 120, 'แพทย์ผู้ให้บริการ'),
      diagnosis: clampString(params.diagnosis, 240, 'รับบริการฝังเข็ม'),
      note: clampString(params.note, 400, ''),
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function syncAuditLogToFirestore(params: {
  action: string;
  targetPath: string;
  details: string;
}): Promise<void> {
  if (!hasVerifiedFirebaseUser() || !auth.currentUser) return;
  const uid = auth.currentUser.uid;
  if (!isValidDocId(uid)) return;
  const path = 'audit_logs';
  try {
    await addDoc(collection(db, path), {
      actorUid: uid,
      actorEmail: clampString(auth.currentUser.email, 160, 'staff'),
      action: clampString(params.action, 80, 'ADMIN_ACTION'),
      targetPath: clampString(params.targetPath, 160, 'clinic'),
      details: clampString(params.details, 300, ''),
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}
