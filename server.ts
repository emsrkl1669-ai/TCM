import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import express, { type NextFunction, type Request, type Response } from 'express';
import {
  createOrUpdateStaffAccount,
  createPublicBooking,
  createSpecialBooking,
  findAdminByUsername,
  findOrProvisionGoogleAdmin,
  getAdminDashboardData,
  getAuditLogsList,
  getClinicConfig,
  getLiveQueueStatus,
  getReportsData,
  getSlotsAvailability,
  getStaffAccounts,
  markAdminLastLogin,
  recordAuditLog,
  searchTreatmentHistory,
  updateBookingDetails,
  updateBookingStatus,
  updateScheduleAndPause,
  verifyPassword,
} from './src/db/repository.ts';
import { adminAuth } from './src/lib/firebase-admin.ts';
import { getBangkokDateStr, type AdminRole, type QueueStatus } from './src/lib/constants.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SESSION_SECRET =
  process.env.SESSION_SECRET ||
  crypto.createHash('sha256').update(process.env.SQL_PASSWORD || 'ruamkuson-samutprakan-clinic').digest('hex');

interface AdminSessionUser {
  id: number;
  username: string;
  displayName: string;
  email: string | null;
  role: AdminRole;
}

interface AdminRequest extends Request {
  adminUser?: AdminSessionUser;
}

function signStaffToken(payload: AdminSessionUser): string {
  const data = {
    ...payload,
    exp: Date.now() + 12 * 60 * 60 * 1000,
  };
  const encoded = Buffer.from(JSON.stringify(data), 'utf8').toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(encoded).digest('base64url');
  return `staff.${encoded}.${sig}`;
}

function verifyStaffToken(token: string): AdminSessionUser | null {
  if (!token.startsWith('staff.')) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [, encoded, sig] = parts;
  const expectedSig = crypto.createHmac('sha256', SESSION_SECRET).update(encoded).digest('base64url');
  if (sig.length !== expectedSig.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig))) return null;

  try {
    const parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    if (!parsed.exp || Date.now() > parsed.exp) return null;
    return {
      id: parsed.id,
      username: parsed.username,
      displayName: parsed.displayName,
      email: parsed.email || null,
      role: parsed.role,
    };
  } catch {
    return null;
  }
}

async function requireAdmin(req: AdminRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'กรุณาเข้าสู่ระบบเจ้าหน้าที่ก่อนดำเนินการ' });
  }

  const token = authHeader.slice('Bearer '.length).trim();

  if (token.startsWith('staff.')) {
    const staffUser = verifyStaffToken(token);
    if (!staffUser) {
      return res.status(401).json({ error: 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่อีกครั้ง' });
    }
    req.adminUser = staffUser;
    return next();
  }

  try {
    const decoded = await adminAuth.verifyIdToken(token);
    if (!decoded.email) {
      return res.status(403).json({ error: 'ไม่พบอีเมลในบัญชี Google นี้' });
    }
    const adminRecord = await findOrProvisionGoogleAdmin(decoded.uid, decoded.email, decoded.name);
    if (!adminRecord) {
      return res.status(403).json({ error: 'บัญชี Google นี้ไม่ได้รับอนุญาตให้เข้าถึงระบบเจ้าหน้าที่' });
    }
    req.adminUser = {
      id: adminRecord.id,
      username: adminRecord.username,
      displayName: adminRecord.displayName,
      email: adminRecord.email,
      role: adminRecord.role as AdminRole,
    };
    return next();
  } catch (error) {
    console.error('Admin token verification failed:', error);
    return res.status(401).json({ error: 'การยืนยันตัวตนไม่ถูกต้องหรือหมดอายุ' });
  }
}

function requireSuperAdmin(req: AdminRequest, res: Response, next: NextFunction) {
  if (!req.adminUser || req.adminUser.role !== 'super_admin') {
    return res.status(403).json({ error: 'สิทธิ์เฉพาะผู้ดูแลระบบ (Super Admin) เท่านั้น' });
  }
  return next();
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
  });

  // --- Public Citizen Endpoints (No Login Required) ---

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  app.get('/api/clinic/config', async (_req, res) => {
    try {
      const config = await getClinicConfig();
      res.json(config);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'เกิดข้อผิดพลาดในการโหลดข้อมูลคลินิก';
      res.status(500).json({ error: msg });
    }
  });

  app.get('/api/slots', async (req, res) => {
    try {
      const dateStr = typeof req.query.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.query.date)
        ? req.query.date
        : getBangkokDateStr(0);
      const data = await getSlotsAvailability(dateStr);
      res.json(data);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'ไม่สามารถโหลดช่วงเวลาว่างได้';
      res.status(500).json({ error: msg });
    }
  });

  app.post('/api/bookings', async (req, res) => {
    try {
      const { fullName, age, disease, phoneNumber, bookingDate, bookingTime } = req.body || {};

      if (typeof fullName !== 'string' || fullName.trim().length < 2 || fullName.trim().length > 120) {
        return res.status(400).json({ error: 'กรุณากรอกชื่อ-นามสกุลให้ถูกต้อง' });
      }
      const parsedAge = Number(age);
      if (!Number.isInteger(parsedAge) || parsedAge < 1 || parsedAge > 120) {
        return res.status(400).json({ error: 'กรุณากรอกอายุระหว่าง 1 - 120 ปี' });
      }
      const cleanPhone = typeof phoneNumber === 'string' ? phoneNumber.replace(/\D/g, '') : '';
      if (cleanPhone.length < 9 || cleanPhone.length > 10) {
        return res.status(400).json({ error: 'กรุณากรอกเบอร์โทรศัพท์ 9-10 หลักให้ถูกต้อง' });
      }
      if (typeof bookingDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(bookingDate)) {
        return res.status(400).json({ error: 'กรุณาเลือกวันนัดหมายที่ถูกต้อง' });
      }
      if (typeof bookingTime !== 'string' || !bookingTime.trim()) {
        return res.status(400).json({ error: 'กรุณาเลือกช่วงเวลานัดหมาย' });
      }

      const ticket = await createPublicBooking({
        fullName: fullName.trim(),
        age: parsedAge,
        disease: typeof disease === 'string' && disease.trim() ? disease.trim().slice(0, 160) : 'ไม่มีโรคประจำตัว',
        phoneNumber: cleanPhone,
        bookingDate,
        bookingTime: bookingTime.trim(),
      });

      res.status(201).json(ticket);
    } catch (error: unknown) {
      if (error instanceof Error) {
        if (error.message === 'BOOKING_PAUSED') {
          return res.status(409).json({ error: 'ขณะนี้คลินิกปิดรับจองคิวชั่วคราว กรุณาติดต่อเจ้าหน้าที่ 02-175-8668' });
        }
        if (error.message === 'DATE_CLOSED') {
          return res.status(400).json({ error: 'วันที่เลือกไม่ได้เปิดให้บริการรับจองคิว' });
        }
        if (error.message === 'INVALID_SLOT') {
          return res.status(400).json({ error: 'ช่วงเวลาที่เลือกไม่ถูกต้อง' });
        }
        if (error.message === 'SLOT_FULL') {
          return res.status(409).json({ error: 'ช่วงเวลานี้คิวเต็มแล้ว กรุณาเลือกช่วงเวลาหรือวันนัดหมายอื่น' });
        }
        return res.status(500).json({ error: error.message });
      }
      res.status(500).json({ error: 'ไม่สามารถบันทึกการจองคิวได้' });
    }
  });

  app.get('/api/queue/live', async (req, res) => {
    try {
      const dateStr = typeof req.query.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.query.date)
        ? req.query.date
        : getBangkokDateStr(0);
      const q = typeof req.query.query === 'string' ? req.query.query : undefined;
      const live = await getLiveQueueStatus(dateStr, q);
      res.json(live);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'ไม่สามารถโหลดสถานะคิวได้';
      res.status(500).json({ error: msg });
    }
  });

  app.get('/api/history', async (req, res) => {
    try {
      const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
      if (!q || q.length < 3) {
        return res.status(400).json({ error: 'กรุณากรอกเบอร์โทรศัพท์ เลขคิว หรือชื่อ-นามสกุล (อย่างน้อย 3 ตัวอักษร)' });
      }
      const records = await searchTreatmentHistory(q);
      res.json({ records });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'ไม่สามารถค้นหาประวัติการรับบริการได้';
      res.status(500).json({ error: msg });
    }
  });

  // --- Admin Auth & MFA Endpoints ---

  app.post('/api/admin/auth/google', async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'ไม่พบโทเคนยืนยันตัวตน' });
    }
    const token = authHeader.slice('Bearer '.length).trim();

    try {
      const decoded = await adminAuth.verifyIdToken(token);
      if (!decoded.email) {
        return res.status(403).json({ error: 'ไม่พบอีเมลในบัญชี Google' });
      }
      const adminRecord = await findOrProvisionGoogleAdmin(decoded.uid, decoded.email, decoded.name);
      if (!adminRecord) {
        return res.status(403).json({ error: `อีเมล ${decoded.email} ยังไม่ได้รับสิทธิ์เจ้าหน้าที่ กรุณาติดต่อผู้ดูแลระบบ` });
      }

      await markAdminLastLogin(adminRecord.id);

      const sessionUser: AdminSessionUser = {
        id: adminRecord.id,
        username: adminRecord.username,
        displayName: adminRecord.displayName,
        email: adminRecord.email,
        role: adminRecord.role as AdminRole,
      };
      const sessionToken = signStaffToken(sessionUser);

      await recordAuditLog({
        actorUsername: sessionUser.username,
        actorRole: sessionUser.role,
        action: 'GOOGLE_SIGN_IN',
        targetType: 'admin',
        targetId: String(sessionUser.id),
        details: `เข้าสู่ระบบด้วย Google (${sessionUser.email})`,
      });

      res.json({
        token: sessionToken,
        user: sessionUser,
      });
    } catch (error) {
      console.error('Google admin auth failed:', error);
      const code =
        error && typeof error === 'object' && 'code' in error
          ? String((error as { code?: string }).code || '')
          : '';
      if (code === 'auth/id-token-expired') {
        return res.status(401).json({ error: 'โทเคน Google หมดอายุ กรุณาเข้าสู่ระบบใหม่อีกครั้ง' });
      }
      if (code === 'auth/argument-invalid' || code === 'auth/invalid-id-token') {
        return res.status(401).json({ error: 'โทเคนยืนยันตัวตน Google ไม่ตรงกับโปรเจกต์ กรุณารีเฟรชหน้าเว็บแล้วลองใหม่' });
      }
      res.status(401).json({ error: 'การเข้าสู่ระบบด้วย Google ไม่สำเร็จ กรุณาลองใหม่หรือใช้ชื่อผู้ใช้และรหัสผ่าน' });
    }
  });

  app.post('/api/admin/auth/login', async (req, res) => {
    try {
      const { username, password } = req.body || {};
      if (typeof username !== 'string' || typeof password !== 'string' || !username.trim() || !password) {
        return res.status(400).json({ error: 'กรุณากรอกชื่อผู้ใช้และรหัสผ่าน' });
      }

      const admin = await findAdminByUsername(username);
      if (!admin || !admin.isActive || !verifyPassword(password, admin.passwordHash)) {
        return res.status(401).json({ error: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' });
      }

      await markAdminLastLogin(admin.id);

      const sessionUser: AdminSessionUser = {
        id: admin.id,
        username: admin.username,
        displayName: admin.displayName,
        email: admin.email,
        role: admin.role as AdminRole,
      };
      const token = signStaffToken(sessionUser);

      await recordAuditLog({
        actorUsername: sessionUser.username,
        actorRole: sessionUser.role,
        action: 'LOGIN_SUCCESS',
        targetType: 'admin',
        targetId: String(sessionUser.id),
        details: 'เข้าสู่ระบบด้วย Username/Password',
      });

      res.json({ token, user: sessionUser });
    } catch (error) {
      console.error('Staff login error:', error);
      res.status(500).json({ error: 'เกิดข้อผิดพลาดในการเข้าสู่ระบบ' });
    }
  });

  app.get('/api/admin/me', requireAdmin, (req: AdminRequest, res) => {
    res.json({ user: req.adminUser });
  });

  // --- Admin Operations Endpoints ---

  app.get('/api/admin/dashboard', requireAdmin, async (req: AdminRequest, res) => {
    try {
      const dateStr = typeof req.query.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.query.date)
        ? req.query.date
        : getBangkokDateStr(0);
      const data = await getAdminDashboardData(dateStr);
      res.json(data);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'ไม่สามารถโหลดข้อมูลแดชบอร์ดได้';
      res.status(500).json({ error: msg });
    }
  });

  app.patch('/api/admin/bookings/:id/status', requireAdmin, async (req: AdminRequest, res) => {
    try {
      const bookingId = Number(req.params.id);
      if (!Number.isInteger(bookingId) || bookingId <= 0) {
        return res.status(400).json({ error: 'รหัสคิวไม่ถูกต้อง' });
      }
      const { status, providerName, diagnosis, note } = req.body || {};
      if (!['waiting', 'calling', 'completed', 'cancelled'].includes(status)) {
        return res.status(400).json({ error: 'สถานะไม่ถูกต้อง' });
      }

      const updated = await updateBookingStatus(
        bookingId,
        status as QueueStatus,
        { username: req.adminUser!.username, role: req.adminUser!.role },
        diagnosis ? { providerName: providerName || '', diagnosis, note } : undefined,
      );
      res.json(updated);
    } catch (error: unknown) {
      if (error instanceof Error && error.message === 'BOOKING_NOT_FOUND') {
        return res.status(404).json({ error: 'ไม่พบรายการคิวนี้' });
      }
      const msg = error instanceof Error ? error.message : 'ไม่สามารถอัปเดตสถานะคิวได้';
      res.status(500).json({ error: msg });
    }
  });

  app.patch('/api/admin/bookings/:id', requireAdmin, async (req: AdminRequest, res) => {
    try {
      const bookingId = Number(req.params.id);
      if (!Number.isInteger(bookingId) || bookingId <= 0) {
        return res.status(400).json({ error: 'รหัสคิวไม่ถูกต้อง' });
      }
      const { fullName, age, disease, phoneNumber, bookingDate, bookingTime, notes } = req.body || {};

      // Rescheduling date/time slot is privileged for super_admin
      if ((bookingDate || bookingTime) && req.adminUser!.role !== 'super_admin') {
        return res.status(403).json({ error: 'การเลื่อนคิวหรือย้ายช่วงเวลาสงวนสิทธิ์สำหรับผู้ดูแลระบบ (Super Admin)' });
      }

      const updated = await updateBookingDetails(
        bookingId,
        {
          ...(typeof fullName === 'string' && fullName.trim() ? { fullName } : {}),
          ...(age !== undefined ? { age: Number(age) } : {}),
          ...(typeof disease === 'string' ? { disease } : {}),
          ...(typeof phoneNumber === 'string' && phoneNumber.trim() ? { phoneNumber } : {}),
          ...(typeof bookingDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(bookingDate) ? { bookingDate } : {}),
          ...(typeof bookingTime === 'string' && bookingTime.trim() ? { bookingTime } : {}),
          ...(typeof notes === 'string' ? { notes } : {}),
        },
        { username: req.adminUser!.username, role: req.adminUser!.role },
      );

      res.json(updated);
    } catch (error: unknown) {
      if (error instanceof Error && error.message === 'BOOKING_NOT_FOUND') {
        return res.status(404).json({ error: 'ไม่พบรายการคิวนี้' });
      }
      const msg = error instanceof Error ? error.message : 'ไม่สามารถแก้ไขข้อมูลคิวได้';
      res.status(500).json({ error: msg });
    }
  });

  app.post('/api/admin/bookings/special', requireAdmin, requireSuperAdmin, async (req: AdminRequest, res) => {
    try {
      const { fullName, age, disease, phoneNumber, bookingDate, bookingTime, notes } = req.body || {};
      if (typeof fullName !== 'string' || fullName.trim().length < 2) {
        return res.status(400).json({ error: 'กรุณากรอกชื่อ-นามสกุลผู้รับบริการ' });
      }
      const parsedAge = Number(age);
      if (!Number.isInteger(parsedAge) || parsedAge < 1 || parsedAge > 120) {
        return res.status(400).json({ error: 'กรุณากรอกอายุระหว่าง 1 - 120 ปี' });
      }
      const cleanPhone = typeof phoneNumber === 'string' ? phoneNumber.replace(/\D/g, '') : '';
      if (cleanPhone.length < 9) {
        return res.status(400).json({ error: 'กรุณากรอกเบอร์โทรศัพท์ให้ถูกต้อง' });
      }

      const result = await createSpecialBooking(
        {
          fullName: fullName.trim(),
          age: parsedAge,
          disease: typeof disease === 'string' && disease.trim() ? disease.trim() : 'คิวพิเศษเร่งด่วน',
          phoneNumber: cleanPhone,
          bookingDate: typeof bookingDate === 'string' ? bookingDate : getBangkokDateStr(0),
          bookingTime: typeof bookingTime === 'string' ? bookingTime : '09.00 - 09.30 น.',
          notes: typeof notes === 'string' ? notes : undefined,
        },
        { username: req.adminUser!.username, role: req.adminUser!.role },
      );
      res.status(201).json(result);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'ไม่สามารถเพิ่มคิวพิเศษได้';
      res.status(500).json({ error: msg });
    }
  });

  app.put('/api/admin/schedule', requireAdmin, requireSuperAdmin, async (req: AdminRequest, res) => {
    try {
      const { dateStr, isOpen, maxPerSlot, note, bookingPaused, pauseReason } = req.body || {};
      const updatedConfig = await updateScheduleAndPause(
        {
          ...(typeof dateStr === 'string' ? { dateStr } : {}),
          ...(typeof isOpen === 'boolean' ? { isOpen } : {}),
          ...(typeof maxPerSlot === 'number' ? { maxPerSlot } : {}),
          ...(typeof note === 'string' ? { note } : {}),
          ...(typeof bookingPaused === 'boolean' ? { bookingPaused } : {}),
          ...(typeof pauseReason === 'string' ? { pauseReason } : {}),
        },
        { username: req.adminUser!.username, role: req.adminUser!.role },
      );
      res.json(updatedConfig);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'ไม่สามารถบันทึกตารางเปิดจองได้';
      res.status(500).json({ error: msg });
    }
  });

  app.get('/api/admin/reports', requireAdmin, requireSuperAdmin, async (req: AdminRequest, res) => {
    try {
      const periodParam = req.query.period;
      const period = periodParam === 'monthly' || periodParam === 'yearly' ? periodParam : 'daily';
      const refDate = typeof req.query.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.query.date)
        ? req.query.date
        : getBangkokDateStr(0);
      const report = await getReportsData(period, refDate);
      res.json(report);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'ไม่สามารถสร้างรายงานได้';
      res.status(500).json({ error: msg });
    }
  });

  app.get('/api/admin/audit-logs', requireAdmin, requireSuperAdmin, async (_req, res) => {
    try {
      const logs = await getAuditLogsList(50);
      res.json({ logs });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'ไม่สามารถโหลด Audit Log ได้';
      res.status(500).json({ error: msg });
    }
  });

  app.get('/api/admin/staff', requireAdmin, requireSuperAdmin, async (_req, res) => {
    try {
      const staff = await getStaffAccounts();
      res.json({ staff });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'ไม่สามารถโหลดรายชื่อเจ้าหน้าที่ได้';
      res.status(500).json({ error: msg });
    }
  });

  app.post('/api/admin/staff', requireAdmin, requireSuperAdmin, async (req: AdminRequest, res) => {
    try {
      const { username, displayName, email, password, role, isActive } = req.body || {};
      if (typeof username !== 'string' || username.trim().length < 3) {
        return res.status(400).json({ error: 'ชื่อผู้ใช้ต้องมีอย่างน้อย 3 ตัวอักษร' });
      }
      if (typeof displayName !== 'string' || displayName.trim().length < 2) {
        return res.status(400).json({ error: 'กรุณากรอกชื่อแสดงผล' });
      }
      if (role !== 'staff' && role !== 'super_admin') {
        return res.status(400).json({ error: 'ระดับสิทธิ์ไม่ถูกต้อง' });
      }

      const saved = await createOrUpdateStaffAccount(
        {
          username,
          displayName,
          email: typeof email === 'string' ? email : undefined,
          password: typeof password === 'string' ? password : undefined,
          role,
          isActive: typeof isActive === 'boolean' ? isActive : true,
        },
        { username: req.adminUser!.username, role: req.adminUser!.role },
      );
      res.json(saved);
    } catch (error: unknown) {
      if (error instanceof Error && error.message === 'PASSWORD_TOO_SHORT') {
        return res.status(400).json({ error: 'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร' });
      }
      const msg = error instanceof Error ? error.message : 'ไม่สามารถบันทึกข้อมูลเจ้าหน้าที่ได้';
      res.status(500).json({ error: msg });
    }
  });

  // Catch unmatched /api routes as JSON so they never fall through to HTML 404
  app.use('/api', (req, res) => {
    res.status(404).json({ error: `ไม่พบ API ปลายทาง (${req.method} ${req.originalUrl})` });
  });

  // --- Vite Middleware / Static Serving ---
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      const indexFile = path.join(distDir, 'index.html');
      if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile);
      } else {
        res.status(404).send('Build not found');
      }
    });
  }

  app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
    console.error('Unhandled server error:', err);
    if (req.originalUrl.startsWith('/api')) {
      const msg = err instanceof Error ? err.message : 'เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์';
      res.status(500).json({ error: msg });
      return;
    }
    res.status(500).send('Internal Server Error');
  });

  const portArgIdx = process.argv.indexOf('--port');
  const cliPort = portArgIdx >= 0 ? Number(process.argv[portArgIdx + 1]) : NaN;
  const port = Number(process.env.PORT) || (Number.isFinite(cliPort) && cliPort > 0 ? cliPort : 3000);
  app.listen(port, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${port}`);
  });
}

startServer().catch((err) => {
  console.error('Fatal server startup error:', err);
  process.exit(1);
});
