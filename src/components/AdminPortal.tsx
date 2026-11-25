import React, { useCallback, useEffect, useState } from 'react';
import { signInWithPopup, signOut } from 'firebase/auth';
import {
  Activity,
  AlertCircle,
  BarChart3,
  CalendarCog,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Download,
  Edit3,
  Eye,
  EyeOff,
  FileSpreadsheet,
  KeyRound,
  Loader2,
  LogOut,
  PauseCircle,
  PlayCircle,
  Plus,
  Printer,
  RefreshCw,
  Shield,
  Users,
  Volume2,
  X,
  XCircle,
} from 'lucide-react';
import { auth, googleAuthProvider } from '../lib/firebase';
import {
  ensureGoogleAdminDocInFirestore,
  syncAuditLogToFirestore,
  syncBookingRecordToFirestore,
  syncClinicConfigToFirestore,
  syncScheduleDateToFirestore,
  syncTreatmentRecordToFirestore,
} from '../lib/firestoreSync';
import {
  FOUNDATION_LOGO_PATH,
  FOUNDATION_NAME,
  FOUNDATION_PHONE,
  QUEUE_STATUS_LABELS,
  THAI_DAYS_SHORT,
  THAI_MONTHS_FULL,
  TIME_SLOTS,
  formatPhoneDisplay,
  formatThaiDateFull,
  formatThaiDateNumeric,
  getBangkokDateStr,
  type AdminRole,
  type QueueStatus,
} from '../lib/constants';
import {
  exportReportCsv,
  exportReportExcel,
  exportReportPdf,
  type ReportPayload,
} from '../lib/reportExport';

interface AdminUser {
  id: number;
  username: string;
  displayName: string;
  email: string | null;
  role: AdminRole;
}

interface AdminBookingRow {
  bookingId: number;
  patientId: number;
  queueNo: string;
  queueType: string;
  bookingDate: string;
  bookingTime: string;
  status: QueueStatus;
  notes: string;
  fullName: string;
  age: number;
  disease: string;
  phoneNumber: string;
  createdAt: string;
}

interface DashboardResponse {
  dateStr: string;
  stats: {
    total: number;
    completed: number;
    waiting: number;
    calling: number;
    cancelled: number;
    special: number;
  };
  bookings: AdminBookingRow[];
  config: {
    bookingPaused: boolean;
    pauseReason: string;
    dates: Array<{ dateStr: string; isOpen: boolean; maxPerSlot: number; note?: string | null }>;
  };
}

interface StaffRecord {
  id: number;
  username: string;
  email: string | null;
  displayName: string;
  role: AdminRole;
  isActive: boolean;
  lastLogin: string | null;
}

interface AuditLogRecord {
  id: number;
  actorUsername: string;
  actorRole: string;
  action: string;
  targetType: string;
  targetId: string | null;
  details: string | null;
  createdAt: string;
}

type AdminTab = 'dashboard' | 'schedule' | 'reports' | 'staff';

interface AdminPortalProps {
  onConfigChanged: () => void;
}

export const AdminPortal: React.FC<AdminPortalProps> = ({ onConfigChanged }) => {
  const [adminUser, setAdminUser] = useState<AdminUser | null>(null);
  const [authToken, setAuthToken] = useState<string>('');
  const [authMode, setAuthMode] = useState<'google' | 'password'>('password');
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState('');

  // Username/Password login state
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Workspace state
  const [activeTab, setActiveTab] = useState<AdminTab>('dashboard');
  const [selectedDate, setSelectedDate] = useState<string>(getBangkokDateStr(0));
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
  const [loadingDash, setLoadingDash] = useState(false);
  const [dashError, setDashError] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');

  // Modals
  const [completeModal, setCompleteModal] = useState<AdminBookingRow | null>(null);
  const [providerName, setProviderName] = useState('พจ. นันทพร วรโชติ');
  const [diagnosis, setDiagnosis] = useState('');
  const [treatmentNote, setTreatmentNote] = useState('');

  const [editModal, setEditModal] = useState<AdminBookingRow | null>(null);
  const [editFullName, setEditFullName] = useState('');
  const [editAge, setEditAge] = useState('');
  const [editDisease, setEditDisease] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editTime, setEditTime] = useState('');

  // Special queue & schedule state
  const [specialName, setSpecialName] = useState('');
  const [specialAge, setSpecialAge] = useState('');
  const [specialDisease, setSpecialDisease] = useState('');
  const [specialPhone, setSpecialPhone] = useState('');
  const [specialTime, setSpecialTime] = useState(TIME_SLOTS[0].label);
  const [specialNote, setSpecialNote] = useState('คิวเร่งด่วนโดยผู้ดูแลระบบ');
  const [pauseReasonInput, setPauseReasonInput] = useState('');
  const [newOpenDate, setNewOpenDate] = useState(getBangkokDateStr(1));
  const [adminCalMonth, setAdminCalMonth] = useState<{ year: number; month: number }>(() => {
    const today = getBangkokDateStr(0);
    const [y, m] = today.split('-').map(Number);
    return { year: y, month: m - 1 };
  });
  const [printMode, setPrintMode] = useState<'dashboard' | 'report'>('dashboard');

  // Reports & Audit/Staff state
  const [reportPeriod, setReportPeriod] = useState<'daily' | 'monthly' | 'yearly'>('daily');
  const [reportData, setReportData] = useState<ReportPayload | null>(null);
  const [staffList, setStaffList] = useState<StaffRecord[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogRecord[]>([]);
  const [newStaffUsername, setNewStaffUsername] = useState('');
  const [newStaffName, setNewStaffName] = useState('');
  const [newStaffEmail, setNewStaffEmail] = useState('');
  const [newStaffPassword, setNewStaffPassword] = useState('');
  const [newStaffRole, setNewStaffRole] = useState<AdminRole>('staff');

  const [actionMsg, setActionMsg] = useState('');

  const parseResponsePayload = async (res: Response) => {
    const raw = await res.text();
    if (!raw) return {};
    try {
      return JSON.parse(raw);
    } catch {
      if (res.status === 404) {
        return { error: 'ไม่พบการเชื่อมต่อบริการหลังบ้าน (HTTP 404) กรุณารีเฟรชหน้าเว็บแล้วลองใหม่อีกครั้ง' };
      }
      return { error: res.ok ? 'ข้อมูลตอบกลับจากเซิร์ฟเวอร์ไม่ถูกต้อง' : `เซิร์ฟเวอร์ไม่ตอบสนองตามปกติ (HTTP ${res.status})` };
    }
  };

  const getBearerToken = useCallback(async () => {
    if (authToken.startsWith('staff.')) return authToken;
    if (auth.currentUser) {
      return await auth.currentUser.getIdToken();
    }
    return authToken;
  }, [authToken]);

  const adminFetch = useCallback(
    async (url: string, options: RequestInit = {}) => {
      const token = await getBearerToken();
      const res = await fetch(url, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...(options.headers || {}),
          Authorization: `Bearer ${token}`,
        },
      });
      const json = await parseResponsePayload(res);
      if (res.status === 401) {
        setAdminUser(null);
        setAuthToken('');
        setAuthError(json.error || 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่อีกครั้ง');
        throw new Error(json.error || 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่อีกครั้ง');
      }
      if (!res.ok) {
        throw new Error(json.error || 'การดำเนินการไม่สำเร็จ');
      }
      return json;
    },
    [getBearerToken],
  );

  const loadDashboard = useCallback(async () => {
    if (!adminUser) return;
    setLoadingDash(true);
    setDashError('');
    try {
      const data: DashboardResponse = await adminFetch(
        `/api/admin/dashboard?date=${encodeURIComponent(selectedDate)}`,
      );
      setDashboard(data);
      setPauseReasonInput(data.config.pauseReason || '');
      if (auth.currentUser?.emailVerified) {
        if (adminUser.role === 'super_admin') {
          void syncClinicConfigToFirestore(
            data.config.bookingPaused,
            data.config.pauseReason || '',
            adminUser.role,
          ).catch(() => {});
          for (const d of data.config.dates) {
            void syncScheduleDateToFirestore(
              d.dateStr,
              d.isOpen,
              d.maxPerSlot,
              d.note || '',
              adminUser.role,
            ).catch(() => {});
          }
        }
        for (const row of data.bookings) {
          void syncBookingRecordToFirestore(row, adminUser.role).catch(() => {});
        }
      }
    } catch (err: unknown) {
      setDashError(err instanceof Error ? err.message : 'ไม่สามารถโหลดข้อมูลได้');
    } finally {
      setLoadingDash(false);
    }
  }, [adminFetch, adminUser, selectedDate]);

  useEffect(() => {
    if (adminUser) {
      loadDashboard();
    }
  }, [adminUser, loadDashboard]);

  const loadReports = useCallback(async () => {
    if (!adminUser || adminUser.role !== 'super_admin') return;
    try {
      const data = await adminFetch(
        `/api/admin/reports?period=${reportPeriod}&date=${encodeURIComponent(selectedDate)}`,
      );
      setReportData(data);
    } catch (err: unknown) {
      setActionMsg(err instanceof Error ? err.message : 'โหลดรายงานไม่สำเร็จ');
    }
  }, [adminFetch, adminUser, reportPeriod, selectedDate]);

  const loadStaffAndLogs = useCallback(async () => {
    if (!adminUser || adminUser.role !== 'super_admin') return;
    try {
      const [staffRes, logsRes] = await Promise.all([
        adminFetch('/api/admin/staff'),
        adminFetch('/api/admin/audit-logs'),
      ]);
      setStaffList(staffRes.staff || []);
      setAuditLogs(logsRes.logs || []);
    } catch (err: unknown) {
      setActionMsg(err instanceof Error ? err.message : 'โหลดข้อมูลเจ้าหน้าที่ไม่สำเร็จ');
    }
  }, [adminFetch, adminUser]);

  useEffect(() => {
    if (activeTab === 'reports') loadReports();
    if (activeTab === 'staff') loadStaffAndLogs();
  }, [activeTab, loadReports, loadStaffAndLogs]);

  const formatGoogleAuthError = (err: unknown): string => {
    if (err && typeof err === 'object' && 'code' in err) {
      const code = String((err as { code?: string }).code || '');
      if (code === 'auth/unauthorized-domain') {
        return 'โดเมนนี้ยังไม่ได้รับอนุญาตสำหรับ Google Sign-In กรุณาเข้าสู่ระบบด้วยแท็บ "ชื่อผู้ใช้ + รหัสผ่าน" แทน';
      }
      if (code === 'auth/popup-blocked' || code === 'auth/operation-not-supported-in-this-environment') {
        return 'เบราว์เซอร์บล็อกหน้าต่างเข้าสู่ระบบ Google กรุณาอนุญาต Popup หรือเข้าสู่ระบบด้วย "ชื่อผู้ใช้ + รหัสผ่าน"';
      }
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
        return 'ยกเลิกการเข้าสู่ระบบด้วย Google แล้ว กรุณาลองใหม่หรือใช้ "ชื่อผู้ใช้ + รหัสผ่าน"';
      }
    }
    return err instanceof Error ? err.message : 'เข้าสู่ระบบด้วย Google ไม่สำเร็จ';
  };

  const handleGoogleSignIn = async () => {
    setAuthLoading(true);
    setAuthError('');
    try {
      const cred = await signInWithPopup(auth, googleAuthProvider);
      const idToken = await cred.user.getIdToken();
      const res = await fetch('/api/admin/auth/google', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
      });
      const json = await parseResponsePayload(res);
      if (!res.ok) throw new Error(json.error || 'บัญชี Google นี้ไม่มีสิทธิ์เข้าถึง');
      if (json.user) {
        await ensureGoogleAdminDocInFirestore(json.user);
      }
      setAuthToken(json.token || idToken);
      setAdminUser(json.user);
    } catch (err: unknown) {
      setAuthError(formatGoogleAuthError(err));
    } finally {
      setAuthLoading(false);
    }
  };

  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthLoading(true);
    setAuthError('');
    try {
      const cleanUsername = username.trim();
      if (!cleanUsername || !password) {
        throw new Error('กรุณากรอกชื่อผู้ใช้และรหัสผ่านให้ครบถ้วน');
      }
      const res = await fetch('/api/admin/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: cleanUsername, password }),
      });
      const json = await parseResponsePayload(res);
      if (!res.ok) throw new Error(json.error || 'เข้าสู่ระบบไม่สำเร็จ');
      if (!json.token || !json.user) {
        throw new Error('ไม่สามารถสร้างเซสชันผู้ดูแลระบบได้ กรุณาลองใหม่อีกครั้ง');
      }
      setAuthToken(json.token);
      setAdminUser(json.user);
      setPassword('');
    } catch (err: unknown) {
      setAuthError(err instanceof Error ? err.message : 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch {
      // Ignore if signed in via staff token
    }
    setAdminUser(null);
    setAuthToken('');
    setDashboard(null);
  };

  const handleStatusChange = async (bookingId: number, status: QueueStatus) => {
    setActionMsg('');
    try {
      await adminFetch(`/api/admin/bookings/${bookingId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      const targetRow = dashboard?.bookings.find((b) => b.bookingId === bookingId);
      if (targetRow && adminUser) {
        await syncBookingRecordToFirestore(
          { ...targetRow, status },
          adminUser.role,
        );
        await syncAuditLogToFirestore({
          action: 'UPDATE_QUEUE_STATUS',
          targetPath: `bookings/${bookingId}`,
          details: `เปลี่ยนสถานะคิว ${targetRow.queueNo} เป็น ${status}`,
        });
      }
      setActionMsg(`อัปเดตสถานะเป็น “${QUEUE_STATUS_LABELS[status]}” เรียบร้อย`);
      await loadDashboard();
    } catch (err: unknown) {
      setActionMsg(err instanceof Error ? err.message : 'อัปเดตสถานะไม่สำเร็จ');
    }
  };

  const handleCompleteWithTreatment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!completeModal) return;
    try {
      await adminFetch(`/api/admin/bookings/${completeModal.bookingId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: 'completed',
          providerName,
          diagnosis: diagnosis || completeModal.disease,
          note: treatmentNote,
        }),
      });
      if (adminUser) {
        await syncTreatmentRecordToFirestore({
          booking: completeModal,
          providerName,
          diagnosis: diagnosis || completeModal.disease,
          note: treatmentNote,
          role: adminUser.role,
        });
        await syncAuditLogToFirestore({
          action: 'COMPLETE_TREATMENT',
          targetPath: `bookings/${completeModal.bookingId}`,
          details: `บันทึกการรักษาคิว ${completeModal.queueNo}`,
        });
      }
      setActionMsg(`บันทึกผลการรักษาคิว ${completeModal.queueNo} สำเร็จ`);
      setCompleteModal(null);
      setDiagnosis('');
      setTreatmentNote('');
      await loadDashboard();
    } catch (err: unknown) {
      setActionMsg(err instanceof Error ? err.message : 'บันทึกไม่สำเร็จ');
    }
  };

  const openEditBooking = (row: AdminBookingRow) => {
    setEditModal(row);
    setEditFullName(row.fullName);
    setEditAge(String(row.age));
    setEditDisease(row.disease);
    setEditPhone(row.phoneNumber);
    setEditDate(row.bookingDate);
    setEditTime(row.bookingTime);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editModal) return;
    try {
      const payload: Record<string, unknown> = {
        fullName: editFullName,
        age: Number(editAge),
        disease: editDisease,
        phoneNumber: editPhone,
      };
      if (adminUser?.role === 'super_admin') {
        payload.bookingDate = editDate;
        payload.bookingTime = editTime;
      }
      await adminFetch(`/api/admin/bookings/${editModal.bookingId}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
      if (adminUser) {
        await syncBookingRecordToFirestore(
          {
            ...editModal,
            fullName: editFullName,
            age: Number(editAge),
            disease: editDisease,
            phoneNumber: editPhone,
            bookingDate: adminUser.role === 'super_admin' ? editDate : editModal.bookingDate,
            bookingTime: adminUser.role === 'super_admin' ? editTime : editModal.bookingTime,
          },
          adminUser.role,
        );
        await syncAuditLogToFirestore({
          action: 'EDIT_BOOKING',
          targetPath: `bookings/${editModal.bookingId}`,
          details: `แก้ไขข้อมูลคิว ${editModal.queueNo}`,
        });
      }
      setActionMsg(`บันทึกการแก้ไขคิว ${editModal.queueNo} เรียบร้อย`);
      setEditModal(null);
      await loadDashboard();
    } catch (err: unknown) {
      setActionMsg(err instanceof Error ? err.message : 'แก้ไขข้อมูลไม่สำเร็จ');
    }
  };

  const handleCreateSpecialQueue = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionMsg('');
    try {
      const res = await adminFetch('/api/admin/bookings/special', {
        method: 'POST',
        body: JSON.stringify({
          fullName: specialName,
          age: Number(specialAge),
          disease: specialDisease || 'เร่งด่วน',
          phoneNumber: specialPhone,
          bookingDate: selectedDate,
          bookingTime: specialTime,
          notes: specialNote,
        }),
      });
      if (adminUser && res.bookingId) {
        await syncBookingRecordToFirestore(
          {
            bookingId: res.bookingId,
            queueNo: res.queueNo,
            queueType: 'special',
            bookingDate: res.bookingDate || selectedDate,
            bookingTime: res.bookingTime || specialTime,
            status: 'waiting',
            fullName: res.fullName || specialName,
            age: Number(specialAge),
            disease: specialDisease || 'เร่งด่วน',
            phoneNumber: specialPhone,
            notes: specialNote,
          },
          adminUser.role,
        );
        await syncAuditLogToFirestore({
          action: 'CREATE_SPECIAL_QUEUE',
          targetPath: `bookings/${res.bookingId}`,
          details: `สร้างคิวพิเศษ ${res.queueNo}`,
        });
      }
      setActionMsg(`ออกคิวพิเศษ ${res.queueNo} ให้คุณ ${res.fullName} เรียบร้อยแล้ว`);
      setSpecialName('');
      setSpecialAge('');
      setSpecialDisease('');
      setSpecialPhone('');
      await loadDashboard();
    } catch (err: unknown) {
      setActionMsg(err instanceof Error ? err.message : 'สร้างคิวพิเศษไม่สำเร็จ');
    }
  };

  const handleToggleGlobalPause = async (paused: boolean) => {
    try {
      await adminFetch('/api/admin/schedule', {
        method: 'PUT',
        body: JSON.stringify({
          bookingPaused: paused,
          pauseReason: pauseReasonInput,
        }),
      });
      if (adminUser) {
        await syncClinicConfigToFirestore(paused, pauseReasonInput, adminUser.role);
        await syncAuditLogToFirestore({
          action: 'TOGGLE_CLINIC_PAUSE',
          targetPath: 'clinic_config/settings',
          details: paused ? 'ปิดรับจองชั่วคราว' : 'เปิดรับจองออนไลน์ตามปกติ',
        });
      }
      setActionMsg(paused ? 'ปิดรับจองออนไลน์ชั่วคราวแล้ว' : 'เปิดรับจองออนไลน์ตามปกติแล้ว');
      await loadDashboard();
      onConfigChanged();
    } catch (err: unknown) {
      setActionMsg(err instanceof Error ? err.message : 'ไม่สามารถเปลี่ยนสถานะระบบได้');
    }
  };

  const handleToggleDateOpen = async (dateStr: string, isOpen: boolean) => {
    const note = isOpen ? 'เปิดให้บริการตามปกติ' : 'ปิดรับจองโดยผู้ดูแลระบบ';
    try {
      await adminFetch('/api/admin/schedule', {
        method: 'PUT',
        body: JSON.stringify({
          dateStr,
          isOpen,
          maxPerSlot: 5,
          note,
        }),
      });
      if (adminUser) {
        await syncScheduleDateToFirestore(dateStr, isOpen, 5, note, adminUser.role);
        await syncAuditLogToFirestore({
          action: 'UPDATE_SCHEDULE_DATE',
          targetPath: `schedule_dates/${dateStr}`,
          details: `${dateStr}: ${isOpen ? 'OPEN' : 'CLOSED'}`,
        });
      }
      setActionMsg(`อัปเดตวัน ${formatThaiDateNumeric(dateStr)} เป็น ${isOpen ? 'เปิดรับจอง' : 'ปิดบริการ'} แล้ว`);
      await loadDashboard();
      onConfigChanged();
    } catch (err: unknown) {
      setActionMsg(err instanceof Error ? err.message : 'อัปเดตปฏิทินไม่สำเร็จ');
    }
  };

  const handleSaveStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await adminFetch('/api/admin/staff', {
        method: 'POST',
        body: JSON.stringify({
          username: newStaffUsername,
          displayName: newStaffName,
          email: newStaffEmail,
          password: newStaffPassword,
          role: newStaffRole,
          isActive: true,
        }),
      });
      setActionMsg(`บันทึกบัญชีเจ้าหน้าที่ ${newStaffUsername} เรียบร้อย`);
      setNewStaffUsername('');
      setNewStaffName('');
      setNewStaffEmail('');
      setNewStaffPassword('');
      await loadStaffAndLogs();
    } catch (err: unknown) {
      setActionMsg(err instanceof Error ? err.message : 'บันทึกบัญชีเจ้าหน้าที่ไม่สำเร็จ');
    }
  };

  // --- Login Gate ---
  if (!adminUser) {
    return (
      <div className="w-full min-h-[calc(100vh-11rem)] flex items-center justify-center py-6">
        <div className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 space-y-6 max-w-lg w-full">
          <div className="flex items-center gap-4">
            <img
              src={FOUNDATION_LOGO_PATH}
              alt="โลโก้มูลนิธิร่วมกุศลสมุทรปราการ"
              className="w-14 h-14 object-contain shrink-0"
              referrerPolicy="no-referrer"
            />
            <div>
              <h1 className="text-xl font-bold text-slate-900">ระบบบริหารจัดการสำหรับเจ้าหน้าที่</h1>
              <p className="text-sm text-slate-600">{FOUNDATION_NAME}</p>
            </div>
          </div>

          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl">
            <button
              type="button"
              onClick={() => {
                setAuthMode('password');
                setAuthError('');
              }}
              className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-colors ${
                authMode === 'password'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              ชื่อผู้ใช้ + รหัสผ่าน
            </button>
            <button
              type="button"
              onClick={() => {
                setAuthMode('google');
                setAuthError('');
              }}
              className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-colors ${
                authMode === 'google'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Google Sign-In
            </button>
          </div>

          {authError && (
            <div
              role="alert"
              className="p-3.5 bg-red-50 border border-red-200 rounded-xl text-sm text-red-800 flex items-start gap-2"
            >
              <AlertCircle className="w-4 h-4 text-red-700 shrink-0 mt-0.5" />
              <span>{authError}</span>
            </div>
          )}

          {authMode === 'google' ? (
            <div className="space-y-4">
              <p className="text-sm text-slate-600 leading-relaxed">
                เข้าสู่ระบบด้วยบัญชี Google ที่ได้รับสิทธิ์เจ้าหน้าที่หรือผู้ดูแลระบบของมูลนิธิร่วมกุศลสมุทรปราการ
              </p>
              <button
                type="button"
                disabled={authLoading}
                onClick={handleGoogleSignIn}
                className="w-full min-h-[48px] px-5 py-3 bg-[#1E3A8A] hover:bg-[#172554] text-white font-semibold rounded-xl flex items-center justify-center gap-2 transition-colors"
              >
                {authLoading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <Shield className="w-5 h-5" />
                )}
                <span>เข้าสู่ระบบด้วย Google</span>
              </button>
            </div>
          ) : (
            <form onSubmit={handlePasswordLogin} className="space-y-4">
              <div>
                <label htmlFor="admin-username" className="block text-sm font-semibold text-slate-800 mb-1.5">
                  ชื่อผู้ใช้ (Username)
                </label>
                <input
                  id="admin-username"
                  type="text"
                  required
                  autoComplete="username"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Admin1571"
                  className="w-full min-h-[46px] px-4 py-2 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1E3A8A]"
                />
              </div>
              <div>
                <label htmlFor="admin-password" className="block text-sm font-semibold text-slate-800 mb-1.5">
                  รหัสผ่าน (Password)
                </label>
                <div className="relative">
                  <input
                    id="admin-password"
                    type={showPassword ? 'text' : 'password'}
                    required
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full min-h-[46px] pl-4 pr-11 py-2 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1E3A8A]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    aria-label={showPassword ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}
                    className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 flex items-center justify-center text-slate-500 hover:text-slate-800 rounded-lg"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <button
                type="submit"
                disabled={authLoading}
                className="w-full min-h-[48px] px-5 py-3 bg-[#1E3A8A] hover:bg-[#172554] text-white font-semibold rounded-xl flex items-center justify-center gap-2"
              >
                {authLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <KeyRound className="w-5 h-5" />}
                <span>เข้าสู่ระบบเจ้าหน้าที่</span>
              </button>
              <p className="text-xs text-slate-500">
                เข้าสู่ระบบด้วยชื่อผู้ใช้และรหัสผ่านเจ้าหน้าที่โดยตรง
              </p>
            </form>
          )}
        </div>
      </div>
    );
  }

  const isSuperAdmin = adminUser.role === 'super_admin';

  const triggerPrint = (mode: 'dashboard' | 'report') => {
    setPrintMode(mode);
    setTimeout(() => {
      window.print();
    }, 80);
  };

  const todayStr = getBangkokDateStr(0);
  const scheduleDateMap = new Map((dashboard?.config.dates || []).map((d) => [d.dateStr, d]));
  const adminFirstDay = new Date(adminCalMonth.year, adminCalMonth.month, 1);
  const adminStartWeekday = adminFirstDay.getDay();
  const adminDaysInMonth = new Date(adminCalMonth.year, adminCalMonth.month + 1, 0).getDate();
  const adminCalCells: Array<{ day: number | null; dateStr: string }> = [];
  for (let i = 0; i < adminStartWeekday; i++) {
    adminCalCells.push({ day: null, dateStr: `empty-${i}` });
  }
  for (let d = 1; d <= adminDaysInMonth; d++) {
    const mStr = String(adminCalMonth.month + 1).padStart(2, '0');
    const dStr = String(d).padStart(2, '0');
    adminCalCells.push({ day: d, dateStr: `${adminCalMonth.year}-${mStr}-${dStr}` });
  }

  const changeAdminMonth = (delta: number) => {
    setAdminCalMonth((prev) => {
      let nextMonth = prev.month + delta;
      let nextYear = prev.year;
      if (nextMonth < 0) {
        nextMonth = 11;
        nextYear -= 1;
      } else if (nextMonth > 11) {
        nextMonth = 0;
        nextYear += 1;
      }
      return { year: nextYear, month: nextMonth };
    });
  };

  const filteredBookings = (dashboard?.bookings || []).filter((b) => {
    if (statusFilter !== 'all' && b.status !== statusFilter) return false;
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      return (
        b.queueNo.toLowerCase().includes(q) ||
        b.fullName.toLowerCase().includes(q) ||
        b.phoneNumber.includes(q)
      );
    }
    return true;
  });

  const printableRows =
    printMode === 'report' && reportData
      ? reportData.records.map((r) => ({
          queueNo: r.queueNo,
          queueType: r.queueType,
          bookingDate: r.bookingDate,
          bookingTime: r.bookingTime,
          fullName: r.fullName,
          age: r.age,
          disease: r.disease,
          phoneNumber: r.phoneNumber,
          status: r.status as QueueStatus,
        }))
      : (dashboard?.bookings || []).map((b) => ({
          queueNo: b.queueNo,
          queueType: b.queueType === 'special' ? 'คิวพิเศษ' : 'คิวปกติ',
          bookingDate: b.bookingDate,
          bookingTime: b.bookingTime,
          fullName: b.fullName,
          age: b.age,
          disease: b.disease,
          phoneNumber: b.phoneNumber,
          status: b.status,
        }));

  return (
    <div className="w-full pb-6">
      <div className="print:hidden grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Sidebar Navigation */}
        <aside className="lg:col-span-3 bg-white border border-slate-200 rounded-2xl p-5 space-y-5">
          <div className="pb-4 border-b border-slate-200 space-y-1">
            <p className="text-xs font-semibold text-[#1E3A8A]">
              {isSuperAdmin ? 'ผู้ดูแลระบบ (Super Admin)' : 'เจ้าหน้าที่ (Staff)'}
            </p>
            <p className="text-base font-bold text-slate-900 truncate">{adminUser.displayName}</p>
            <p className="text-xs text-slate-500 truncate">{adminUser.email || adminUser.username}</p>
          </div>

          <nav className="space-y-1.5">
            <button
              type="button"
              onClick={() => setActiveTab('dashboard')}
              className={`w-full min-h-[44px] px-3.5 py-2.5 rounded-xl text-sm font-semibold flex items-center gap-2.5 transition-colors ${
                activeTab === 'dashboard'
                  ? 'bg-[#1E3A8A] text-white'
                  : 'text-slate-700 hover:bg-slate-100'
              }`}
            >
              <Activity className="w-4 h-4 shrink-0" />
              <span>แดชบอร์ดคิววันนี้</span>
            </button>

            {isSuperAdmin && (
              <>
                <button
                  type="button"
                  onClick={() => setActiveTab('schedule')}
                  className={`w-full min-h-[44px] px-3.5 py-2.5 rounded-xl text-sm font-semibold flex items-center gap-2.5 transition-colors ${
                    activeTab === 'schedule'
                      ? 'bg-[#1E3A8A] text-white'
                      : 'text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <CalendarCog className="w-4 h-4 shrink-0" />
                  <span>คิวพิเศษ & วันเปิดจอง</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('reports')}
                  className={`w-full min-h-[44px] px-3.5 py-2.5 rounded-xl text-sm font-semibold flex items-center gap-2.5 transition-colors ${
                    activeTab === 'reports'
                      ? 'bg-[#1E3A8A] text-white'
                      : 'text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <BarChart3 className="w-4 h-4 shrink-0" />
                  <span>รายงาน & ส่งออกข้อมูล</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('staff')}
                  className={`w-full min-h-[44px] px-3.5 py-2.5 rounded-xl text-sm font-semibold flex items-center gap-2.5 transition-colors ${
                    activeTab === 'staff'
                      ? 'bg-[#1E3A8A] text-white'
                      : 'text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <Users className="w-4 h-4 shrink-0" />
                  <span>สิทธิ์เจ้าหน้าที่ & Audit Log</span>
                </button>
              </>
            )}
          </nav>

          <div className="pt-4 border-t border-slate-200">
            <button
              type="button"
              onClick={handleLogout}
              className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl text-sm font-semibold text-red-700 bg-red-50 hover:bg-red-100 flex items-center justify-center gap-2 transition-colors"
            >
              <LogOut className="w-4 h-4 shrink-0" />
              <span>ออกจากระบบ</span>
            </button>
          </div>
        </aside>

        {/* Main Workspace */}
        <main className="lg:col-span-9 space-y-6">
          {/* Top Context Bar */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <p className="text-xs text-slate-500">ระบบบริหารจัดการ · {FOUNDATION_NAME}</p>
              <h1 className="text-xl font-bold text-slate-900">
                {activeTab === 'dashboard' && `จัดการคิวประจำวันที่ ${formatThaiDateFull(selectedDate)}`}
                {activeTab === 'schedule' && 'ระบบคิวพิเศษและกำหนดวันเปิดรับจอง'}
                {activeTab === 'reports' && 'รายงานสถิติและส่งออกข้อมูล'}
                {activeTab === 'staff' && 'จัดการสิทธิ์เจ้าหน้าที่และ Audit Log'}
              </h1>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="min-h-[40px] px-3 py-1.5 border border-slate-300 rounded-xl text-sm tabular-nums bg-white"
              />
              <button
                type="button"
                onClick={() => triggerPrint('dashboard')}
                className="min-h-[40px] px-3.5 py-1.5 bg-[#1E3A8A] hover:bg-[#172554] text-white rounded-xl text-sm font-semibold inline-flex items-center gap-1.5"
              >
                <Printer className="w-4 h-4" />
                <span>พิมพ์ใบรายงานคิว</span>
              </button>
              <button
                type="button"
                onClick={loadDashboard}
                className="min-h-[40px] px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-sm font-semibold inline-flex items-center gap-1.5"
              >
                <RefreshCw className={`w-4 h-4 ${loadingDash ? 'animate-spin' : ''}`} />
                <span>รีเฟรช</span>
              </button>
            </div>
          </div>

          {actionMsg && (
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl text-sm font-medium text-blue-950 flex items-center justify-between gap-3">
              <span>{actionMsg}</span>
              <button type="button" onClick={() => setActionMsg('')} aria-label="ปิดข้อความ">
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {dashError && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
              {dashError}
            </div>
          )}

          {/* TAB 1: DASHBOARD */}
          {activeTab === 'dashboard' && (
            <div className="space-y-6">
              {/* 5-KPI Strip */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                <div className="bg-white border border-slate-200 rounded-xl p-4">
                  <p className="text-xs text-slate-500">คิววันนี้</p>
                  <p className="mt-1 text-2xl font-bold text-slate-900 tabular-nums">
                    {dashboard?.stats.total ?? 0}
                  </p>
                </div>
                <div className="bg-white border border-slate-200 rounded-xl p-4">
                  <p className="text-xs text-emerald-700">เข้ารับบริการแล้ว</p>
                  <p className="mt-1 text-2xl font-bold text-emerald-700 tabular-nums">
                    {dashboard?.stats.completed ?? 0}
                  </p>
                </div>
                <div className="bg-white border border-slate-200 rounded-xl p-4">
                  <p className="text-xs text-[#1E3A8A]">รอรับบริการ</p>
                  <p className="mt-1 text-2xl font-bold text-[#1E3A8A] tabular-nums">
                    {(dashboard?.stats.waiting ?? 0) + (dashboard?.stats.calling ?? 0)}
                  </p>
                </div>
                <div className="bg-white border border-slate-200 rounded-xl p-4">
                  <p className="text-xs text-red-700">ยกเลิก</p>
                  <p className="mt-1 text-2xl font-bold text-red-700 tabular-nums">
                    {dashboard?.stats.cancelled ?? 0}
                  </p>
                </div>
                <div className="bg-white border border-slate-200 rounded-xl p-4 col-span-2 sm:col-span-1">
                  <p className="text-xs text-amber-800">คิวพิเศษ</p>
                  <p className="mt-1 text-2xl font-bold text-amber-800 tabular-nums">
                    {dashboard?.stats.special ?? 0}
                  </p>
                </div>
              </div>

              {/* Filters */}
              <div className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-xl">
                  {[
                    ['all', 'ทั้งหมด'],
                    ['calling', 'กำลังเรียก'],
                    ['waiting', 'รอรับบริการ'],
                    ['completed', 'เสร็จสิ้น'],
                    ['cancelled', 'ยกเลิก'],
                  ].map(([val, label]) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setStatusFilter(val)}
                      className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
                        statusFilter === val
                          ? 'bg-white text-slate-900 shadow-sm'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="ค้นหาเลขคิว ชื่อ หรือเบอร์โทร"
                  className="min-h-[40px] px-3.5 py-1.5 border border-slate-300 rounded-xl text-sm w-full md:w-64"
                />
              </div>

              {/* Queue Operations Table */}
              <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                      <tr>
                        <th className="px-4 py-3 font-semibold">เลขคิว</th>
                        <th className="px-4 py-3 font-semibold">ผู้รับบริการ</th>
                        <th className="px-4 py-3 font-semibold">ช่วงเวลา</th>
                        <th className="px-4 py-3 font-semibold">โรคประจำตัว</th>
                        <th className="px-4 py-3 font-semibold">สถานะ</th>
                        <th className="px-4 py-3 font-semibold text-right">การจัดการ</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {filteredBookings.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="px-6 py-10 text-center text-slate-500">
                            ไม่มีรายการคิวที่ตรงกับเงื่อนไข
                          </td>
                        </tr>
                      ) : (
                        filteredBookings.map((row) => (
                          <tr
                            key={row.bookingId}
                            className={row.status === 'calling' ? 'bg-blue-50/70' : 'hover:bg-slate-50'}
                          >
                            <td className="px-4 py-3.5">
                              <span
                                className={`font-mono-num font-bold ${
                                  row.queueType === 'special' ? 'text-red-700' : 'text-[#1E3A8A]'
                                }`}
                              >
                                {row.queueNo}
                              </span>
                              {row.queueType === 'special' && (
                                <p className="text-[11px] font-semibold text-red-700">คิวพิเศษ</p>
                              )}
                            </td>
                            <td className="px-4 py-3.5">
                              <p className="font-semibold text-slate-900">{row.fullName}</p>
                              <p className="text-xs text-slate-500 tabular-nums">
                                อายุ {row.age} ปี · {formatPhoneDisplay(row.phoneNumber)}
                              </p>
                            </td>
                            <td className="px-4 py-3.5 text-slate-700 tabular-nums whitespace-nowrap">
                              {row.bookingTime}
                            </td>
                            <td className="px-4 py-3.5 text-slate-700 max-w-[180px] truncate">
                              {row.disease}
                            </td>
                            <td className="px-4 py-3.5 whitespace-nowrap">
                              <span
                                className={`text-xs font-semibold ${
                                  row.status === 'calling'
                                    ? 'text-[#1E3A8A]'
                                    : row.status === 'completed'
                                      ? 'text-emerald-700'
                                      : row.status === 'cancelled'
                                        ? 'text-red-700'
                                        : 'text-amber-800'
                                }`}
                              >
                                {QUEUE_STATUS_LABELS[row.status]}
                              </span>
                            </td>
                            <td className="px-4 py-3.5 text-right">
                              <div className="inline-flex flex-wrap justify-end gap-1.5">
                                {row.status === 'waiting' && (
                                  <button
                                    type="button"
                                    onClick={() => handleStatusChange(row.bookingId, 'calling')}
                                    className="px-2.5 py-1.5 bg-[#1E3A8A] hover:bg-[#172554] text-white text-xs font-semibold rounded-lg inline-flex items-center gap-1"
                                  >
                                    <Volume2 className="w-3.5 h-3.5" />
                                    <span>เรียกคิว</span>
                                  </button>
                                )}
                                {(row.status === 'waiting' || row.status === 'calling') && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setCompleteModal(row);
                                      setDiagnosis(row.disease);
                                    }}
                                    className="px-2.5 py-1.5 bg-[#16A34A] hover:bg-[#15803D] text-white text-xs font-semibold rounded-lg inline-flex items-center gap-1"
                                  >
                                    <CheckCircle2 className="w-3.5 h-3.5" />
                                    <span>เสร็จสิ้น</span>
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => openEditBooking(row)}
                                  className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold rounded-lg inline-flex items-center gap-1"
                                >
                                  <Edit3 className="w-3.5 h-3.5" />
                                  <span>{isSuperAdmin ? 'แก้ไข/ย้าย' : 'แก้ไข'}</span>
                                </button>
                                {row.status === 'waiting' && (
                                  <button
                                    type="button"
                                    onClick={() => handleStatusChange(row.bookingId, 'cancelled')}
                                    className="px-2.5 py-1.5 bg-red-50 hover:bg-red-100 text-red-700 text-xs font-semibold rounded-lg inline-flex items-center gap-1"
                                  >
                                    <XCircle className="w-3.5 h-3.5" />
                                    <span>ยกเลิก</span>
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: SPECIAL QUEUE & SCHEDULE (Super Admin Only) */}
          {activeTab === 'schedule' && isSuperAdmin && (
            <div className="space-y-6">
              {/* Pause System Toggle */}
              <section className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-bold text-slate-900">
                      ควบคุมการเปิด-ปิดรับจองชั่วคราว (Real-Time)
                    </h2>
                    <p className="text-sm text-slate-600">
                      สถานะปัจจุบัน:{' '}
                      <strong className={dashboard?.config.bookingPaused ? 'text-red-700' : 'text-emerald-700'}>
                        {dashboard?.config.bookingPaused ? 'ปิดรับจองชั่วคราว' : 'เปิดรับจองปกติ'}
                      </strong>
                    </p>
                  </div>

                  {dashboard?.config.bookingPaused ? (
                    <button
                      type="button"
                      onClick={() => handleToggleGlobalPause(false)}
                      className="min-h-[44px] px-4 py-2 bg-[#16A34A] hover:bg-[#15803D] text-white text-sm font-semibold rounded-xl inline-flex items-center gap-2 shrink-0"
                    >
                      <PlayCircle className="w-4 h-4" />
                      <span>เปิดรับจองอีกครั้ง</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleToggleGlobalPause(true)}
                      className="min-h-[44px] px-4 py-2 bg-red-700 hover:bg-red-800 text-white text-sm font-semibold rounded-xl inline-flex items-center gap-2 shrink-0"
                    >
                      <PauseCircle className="w-4 h-4" />
                      <span>ปิดรับจองชั่วคราว</span>
                    </button>
                  )}
                </div>

                <input
                  type="text"
                  value={pauseReasonInput}
                  onChange={(e) => setPauseReasonInput(e.target.value)}
                  placeholder="ระบุข้อความแจ้งผู้รับบริการกรณีปิดรับจองชั่วคราว (เช่น ปิดอบรมเจ้าหน้าที่)"
                  className="w-full min-h-[44px] px-4 py-2 border border-slate-300 rounded-xl text-sm"
                />
              </section>

              {/* Add Special Urgent Queue */}
              <section className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4">
                <div className="flex items-center gap-2">
                  <Plus className="w-5 h-5 text-red-700" />
                  <h2 className="text-lg font-bold text-slate-900">
                    เพิ่มคิวพิเศษ / คิวเร่งด่วน (วันที่ {formatThaiDateNumeric(selectedDate)})
                  </h2>
                </div>
                <form onSubmit={handleCreateSpecialQueue} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  <input
                    type="text"
                    required
                    value={specialName}
                    onChange={(e) => setSpecialName(e.target.value)}
                    placeholder="ชื่อ-นามสกุลผู้รับบริการ"
                    className="min-h-[44px] px-3.5 py-2 border border-slate-300 rounded-xl text-sm"
                  />
                  <input
                    type="number"
                    required
                    min={1}
                    max={120}
                    value={specialAge}
                    onChange={(e) => setSpecialAge(e.target.value)}
                    placeholder="อายุ (ปี)"
                    className="min-h-[44px] px-3.5 py-2 border border-slate-300 rounded-xl text-sm"
                  />
                  <input
                    type="tel"
                    required
                    value={specialPhone}
                    onChange={(e) => setSpecialPhone(e.target.value)}
                    placeholder="เบอร์โทรศัพท์"
                    className="min-h-[44px] px-3.5 py-2 border border-slate-300 rounded-xl text-sm"
                  />
                  <input
                    type="text"
                    value={specialDisease}
                    onChange={(e) => setSpecialDisease(e.target.value)}
                    placeholder="อาการ / โรคประจำตัว"
                    className="min-h-[44px] px-3.5 py-2 border border-slate-300 rounded-xl text-sm"
                  />
                  <select
                    value={specialTime}
                    onChange={(e) => setSpecialTime(e.target.value)}
                    className="min-h-[44px] px-3.5 py-2 border border-slate-300 rounded-xl text-sm bg-white"
                  >
                    {TIME_SLOTS.map((s) => (
                      <option key={s.id} value={s.label}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                  <button
                    type="submit"
                    className="min-h-[44px] px-4 py-2 bg-red-700 hover:bg-red-800 text-white text-sm font-semibold rounded-xl"
                  >
                    ออกคิวพิเศษทันที (S)
                  </button>
                </form>
              </section>

              {/* Calendar Open/Close Management */}
              <section className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-bold text-slate-900">
                      กำหนดวันเปิดจองคิว (เฉพาะแอดมิน)
                    </h2>
                    <p className="text-xs text-slate-600">
                      คลิกเลือกวันที่ในปฏิทินเพื่อเปิดหรือปิดรับจองคิว วันที่ไม่ถูกเปิดจะไม่สามารถจองได้
                    </p>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => changeAdminMonth(-1)}
                      aria-label="เดือนก่อนหน้า"
                      className="w-9 h-9 flex items-center justify-center rounded-lg border border-slate-200 hover:bg-slate-100"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <span className="text-sm font-semibold text-slate-900 min-w-[128px] text-center tabular-nums">
                      {THAI_MONTHS_FULL[adminCalMonth.month]} {adminCalMonth.year + 543}
                    </span>
                    <button
                      type="button"
                      onClick={() => changeAdminMonth(1)}
                      aria-label="เดือนถัดไป"
                      className="w-9 h-9 flex items-center justify-center rounded-lg border border-slate-200 hover:bg-slate-100"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-7 gap-1.5 text-center">
                  {THAI_DAYS_SHORT.map((day) => (
                    <div key={day} className="py-1 text-xs font-semibold text-slate-500">
                      {day}
                    </div>
                  ))}
                  {adminCalCells.map((cell) => {
                    if (cell.day === null) return <div key={cell.dateStr} className="h-10" />;
                    const info = scheduleDateMap.get(cell.dateStr);
                    const isOpen = Boolean(info?.isOpen);
                    const isPast = cell.dateStr < todayStr;
                    return (
                      <button
                        key={cell.dateStr}
                        type="button"
                        disabled={isPast}
                        onClick={() => handleToggleDateOpen(cell.dateStr, !isOpen)}
                        className={`h-10 rounded-lg flex flex-col items-center justify-center text-xs transition-colors tabular-nums ${
                          isPast
                            ? 'bg-slate-50 text-slate-300 cursor-not-allowed'
                            : isOpen
                              ? 'bg-emerald-600 text-white font-bold hover:bg-emerald-700'
                              : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100 font-medium'
                        }`}
                      >
                        <span>{cell.day}</span>
                        {!isPast && (
                          <span className={`text-[9px] leading-none ${isOpen ? 'text-emerald-100' : 'text-slate-400'}`}>
                            {isOpen ? 'เปิดจอง' : 'ปิด'}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>

                <div className="pt-2 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <input
                      type="date"
                      value={newOpenDate}
                      onChange={(e) => setNewOpenDate(e.target.value)}
                      className="min-h-[38px] px-3 py-1 border border-slate-300 rounded-xl text-sm tabular-nums"
                    />
                    <button
                      type="button"
                      onClick={() => handleToggleDateOpen(newOpenDate, true)}
                      className="min-h-[38px] px-3.5 py-1 bg-[#1E3A8A] text-white text-xs font-semibold rounded-xl"
                    >
                      เปิดวันจองนี้
                    </button>
                  </div>
                  <span className="text-xs text-slate-600 tabular-nums">
                    เปิดรับจองแล้ว {(dashboard?.config.dates || []).filter((d) => d.isOpen).length} วัน
                  </span>
                </div>
              </section>
            </div>
          )}

          {/* TAB 3: REPORTS & EXPORT (Super Admin Only) */}
          {activeTab === 'reports' && isSuperAdmin && (
            <div className="space-y-6">
              <div className="bg-white border border-slate-200 rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl">
                  {(
                    [
                      ['daily', 'รายงานรายวัน'],
                      ['monthly', 'รายงานรายเดือน'],
                      ['yearly', 'รายงานรายปี'],
                    ] as const
                  ).map(([p, label]) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setReportPeriod(p)}
                      className={`px-3.5 py-2 text-sm font-semibold rounded-lg transition-colors ${
                        reportPeriod === p
                          ? 'bg-white text-slate-900 shadow-sm'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {reportData && (
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => triggerPrint('report')}
                      className="min-h-[40px] px-3.5 py-2 bg-slate-800 hover:bg-slate-900 text-white text-xs font-semibold rounded-xl inline-flex items-center gap-1.5"
                    >
                      <Printer className="w-4 h-4" />
                      <span>ปริ้นใบรายงาน</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => exportReportExcel(reportData)}
                      className="min-h-[40px] px-3.5 py-2 bg-[#16A34A] hover:bg-[#15803D] text-white text-xs font-semibold rounded-xl inline-flex items-center gap-1.5"
                    >
                      <FileSpreadsheet className="w-4 h-4" />
                      <span>Export Excel (.xlsx)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => exportReportPdf(reportData)}
                      className="min-h-[40px] px-3.5 py-2 bg-[#1E3A8A] hover:bg-[#172554] text-white text-xs font-semibold rounded-xl inline-flex items-center gap-1.5"
                    >
                      <Download className="w-4 h-4" />
                      <span>Export PDF</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => exportReportCsv(reportData)}
                      className="min-h-[40px] px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold rounded-xl inline-flex items-center gap-1.5"
                    >
                      <Download className="w-4 h-4" />
                      <span>Export CSV</span>
                    </button>
                  </div>
                )}
              </div>

              {reportData && (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <div className="bg-white border border-slate-200 rounded-xl p-5">
                      <p className="text-xs text-slate-500">จำนวนผู้รับบริการ</p>
                      <p className="mt-1 text-2xl font-bold text-slate-900 tabular-nums">
                        {reportData.summary.activePatients} ราย
                      </p>
                    </div>
                    <div className="bg-white border border-slate-200 rounded-xl p-5">
                      <p className="text-xs text-slate-500">อายุเฉลี่ย</p>
                      <p className="mt-1 text-2xl font-bold text-[#1E3A8A] tabular-nums">
                        {reportData.summary.averageAge} ปี
                      </p>
                    </div>
                    <div className="bg-white border border-slate-200 rounded-xl p-5">
                      <p className="text-xs text-slate-500">เข้ารับบริการแล้ว</p>
                      <p className="mt-1 text-2xl font-bold text-emerald-700 tabular-nums">
                        {reportData.summary.completedCount} ราย
                      </p>
                    </div>
                    <div className="bg-white border border-slate-200 rounded-xl p-5">
                      <p className="text-xs text-slate-500">ช่วงเวลาที่มีผู้จองมากที่สุด</p>
                      <p className="mt-1 text-base font-bold text-slate-900 tabular-nums">
                        {reportData.summary.peakTimeSlot}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <section className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4">
                      <h2 className="text-base font-bold text-slate-900">โรคประจำตัว / อาการที่พบบ่อย</h2>
                      <div className="space-y-3">
                        {reportData.topDiseases.length === 0 ? (
                          <p className="text-sm text-slate-500">ไม่มีข้อมูลในช่วงเวลานี้</p>
                        ) : (
                          reportData.topDiseases.map((d) => {
                            const max = reportData.topDiseases[0]?.count || 1;
                            const pct = Math.round((d.count / max) * 100);
                            return (
                              <div key={d.name} className="space-y-1">
                                <div className="flex justify-between text-sm">
                                  <span className="text-slate-700 font-medium">{d.name}</span>
                                  <span className="font-bold text-slate-900 tabular-nums">{d.count} ราย</span>
                                </div>
                                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                                  <div
                                    className="h-full bg-[#1E3A8A] rounded-full"
                                    style={{ width: `${pct}%` }}
                                  />
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </section>

                    <section className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4">
                      <h2 className="text-base font-bold text-slate-900">สถิติผู้รับบริการตามช่วงเวลา</h2>
                      <div className="space-y-3">
                        {reportData.slotDistribution.map((s) => {
                          const max = Math.max(...reportData.slotDistribution.map((x) => x.count), 1);
                          const pct = Math.round((s.count / max) * 100);
                          return (
                            <div key={s.slot} className="space-y-1">
                              <div className="flex justify-between text-sm">
                                <span className="text-slate-700 font-medium tabular-nums">{s.slot}</span>
                                <span className="font-bold text-slate-900 tabular-nums">{s.count} คิว</span>
                              </div>
                              <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-[#16A34A] rounded-full"
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </section>
                  </div>
                </>
              )}
            </div>
          )}

          {/* TAB 4: STAFF ROLES & AUDIT LOG (Super Admin Only) */}
          {activeTab === 'staff' && isSuperAdmin && (
            <div className="space-y-6">
              <section className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4">
                <h2 className="text-lg font-bold text-slate-900">เพิ่ม / แก้ไขสิทธิ์เจ้าหน้าที่</h2>
                <form onSubmit={handleSaveStaff} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  <input
                    type="text"
                    required
                    value={newStaffUsername}
                    onChange={(e) => setNewStaffUsername(e.target.value)}
                    placeholder="ชื่อผู้ใช้ (Username)"
                    className="min-h-[44px] px-3.5 py-2 border border-slate-300 rounded-xl text-sm"
                  />
                  <input
                    type="text"
                    required
                    value={newStaffName}
                    onChange={(e) => setNewStaffName(e.target.value)}
                    placeholder="ชื่อ-นามสกุลเจ้าหน้าที่"
                    className="min-h-[44px] px-3.5 py-2 border border-slate-300 rounded-xl text-sm"
                  />
                  <input
                    type="email"
                    value={newStaffEmail}
                    onChange={(e) => setNewStaffEmail(e.target.value)}
                    placeholder="อีเมล Google (ถ้ามี)"
                    className="min-h-[44px] px-3.5 py-2 border border-slate-300 rounded-xl text-sm"
                  />
                  <input
                    type="password"
                    value={newStaffPassword}
                    onChange={(e) => setNewStaffPassword(e.target.value)}
                    placeholder="รหัสผ่าน (>= 6 ตัวอักษร)"
                    className="min-h-[44px] px-3.5 py-2 border border-slate-300 rounded-xl text-sm"
                  />
                  <select
                    value={newStaffRole}
                    onChange={(e) => setNewStaffRole(e.target.value as AdminRole)}
                    className="min-h-[44px] px-3.5 py-2 border border-slate-300 rounded-xl text-sm bg-white"
                  >
                    <option value="staff">เจ้าหน้าที่ (ดูคิว / แก้ไขข้อมูล)</option>
                    <option value="super_admin">ผู้ดูแลระบบ (ตั้งค่าระบบ / คิวพิเศษ / รายงาน)</option>
                  </select>
                  <button
                    type="submit"
                    className="min-h-[44px] px-4 py-2 bg-[#1E3A8A] hover:bg-[#172554] text-white text-sm font-semibold rounded-xl"
                  >
                    บันทึกบัญชีเจ้าหน้าที่
                  </button>
                </form>

                <div className="divide-y divide-slate-200 border border-slate-200 rounded-xl overflow-hidden">
                  {staffList.map((s) => (
                    <div key={s.id} className="px-4 py-3 flex items-center justify-between text-sm bg-white">
                      <div>
                        <p className="font-semibold text-slate-900">
                          {s.displayName} <span className="text-slate-500 font-mono-num">({s.username})</span>
                        </p>
                        <p className="text-xs text-slate-500">{s.email || 'เข้าสู่ระบบด้วย Username / Password'}</p>
                      </div>
                      <span className="text-xs font-semibold text-[#1E3A8A]">
                        {s.role === 'super_admin' ? 'ผู้ดูแลระบบ (Super Admin)' : 'เจ้าหน้าที่ (Staff)'}
                      </span>
                    </div>
                  ))}
                </div>
              </section>

              <section className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-200 flex items-center gap-2">
                  <ClipboardList className="w-5 h-5 text-[#1E3A8A]" />
                  <h2 className="text-lg font-bold text-slate-900">บันทึกการใช้งานระบบ (Audit Log)</h2>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs sm:text-sm">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                      <tr>
                        <th className="px-4 py-3 font-semibold">เวลา</th>
                        <th className="px-4 py-3 font-semibold">ผู้ดำเนินการ</th>
                        <th className="px-4 py-3 font-semibold">กิจกรรม</th>
                        <th className="px-4 py-3 font-semibold">รายละเอียด</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {auditLogs.map((log) => (
                        <tr key={log.id} className="hover:bg-slate-50">
                          <td className="px-4 py-2.5 text-slate-500 tabular-nums whitespace-nowrap">
                            {new Date(log.createdAt).toLocaleString('th-TH')}
                          </td>
                          <td className="px-4 py-2.5 font-semibold text-slate-900">
                            {log.actorUsername}
                          </td>
                          <td className="px-4 py-2.5 font-mono-num text-xs text-[#1E3A8A]">
                            {log.action}
                          </td>
                          <td className="px-4 py-2.5 text-slate-700">{log.details || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>
          )}
        </main>
      </div>

      {/* Modal: Complete & Log Treatment History */}
      {completeModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/50 backdrop-blur-sm flex items-center justify-center p-4">
          <form
            onSubmit={handleCompleteWithTreatment}
            className="bg-white border border-slate-200 rounded-2xl max-w-md w-full p-6 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-900">
                บันทึกผลการรักษา · คิว {completeModal.queueNo}
              </h3>
              <button type="button" onClick={() => setCompleteModal(null)}>
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>
            <p className="text-sm text-slate-600">ผู้รับบริการ: {completeModal.fullName}</p>
            <div>
              <label className="block text-sm font-semibold text-slate-800 mb-1">
                แพทย์ / ผู้ให้บริการ
              </label>
              <input
                type="text"
                required
                value={providerName}
                onChange={(e) => setProviderName(e.target.value)}
                className="w-full min-h-[42px] px-3.5 py-2 border border-slate-300 rounded-xl text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-800 mb-1">
                อาการ / การวินิจฉัย
              </label>
              <input
                type="text"
                required
                value={diagnosis}
                onChange={(e) => setDiagnosis(e.target.value)}
                className="w-full min-h-[42px] px-3.5 py-2 border border-slate-300 rounded-xl text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-800 mb-1">
                หมายเหตุการรักษา
              </label>
              <textarea
                rows={3}
                value={treatmentNote}
                onChange={(e) => setTreatmentNote(e.target.value)}
                placeholder="จุดฝังเข็ม คำแนะนำหลังรับบริการ..."
                className="w-full px-3.5 py-2 border border-slate-300 rounded-xl text-sm"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setCompleteModal(null)}
                className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl text-sm font-semibold"
              >
                ยกเลิก
              </button>
              <button
                type="submit"
                className="px-5 py-2 bg-[#16A34A] hover:bg-[#15803D] text-white rounded-xl text-sm font-semibold"
              >
                ยืนยันเสร็จสิ้นและบันทึก
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal: Edit Patient / Reschedule */}
      {editModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/50 backdrop-blur-sm flex items-center justify-center p-4">
          <form
            onSubmit={handleSaveEdit}
            className="bg-white border border-slate-200 rounded-2xl max-w-md w-full p-6 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-900">
                แก้ไขข้อมูล · คิว {editModal.queueNo}
              </h3>
              <button type="button" onClick={() => setEditModal(null)}>
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-800 mb-1">ชื่อ-นามสกุล</label>
              <input
                type="text"
                required
                value={editFullName}
                onChange={(e) => setEditFullName(e.target.value)}
                className="w-full min-h-[42px] px-3.5 py-2 border border-slate-300 rounded-xl text-sm"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-semibold text-slate-800 mb-1">อายุ</label>
                <input
                  type="number"
                  required
                  value={editAge}
                  onChange={(e) => setEditAge(e.target.value)}
                  className="w-full min-h-[42px] px-3.5 py-2 border border-slate-300 rounded-xl text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-800 mb-1">โทรศัพท์</label>
                <input
                  type="tel"
                  required
                  value={editPhone}
                  onChange={(e) => setEditPhone(e.target.value)}
                  className="w-full min-h-[42px] px-3.5 py-2 border border-slate-300 rounded-xl text-sm"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-800 mb-1">โรคประจำตัว</label>
              <input
                type="text"
                value={editDisease}
                onChange={(e) => setEditDisease(e.target.value)}
                className="w-full min-h-[42px] px-3.5 py-2 border border-slate-300 rounded-xl text-sm"
              />
            </div>

            {isSuperAdmin && (
              <div className="pt-2 border-t border-slate-200 grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[#1E3A8A] mb-1">
                    เลื่อนวันนัด (Super Admin)
                  </label>
                  <input
                    type="date"
                    value={editDate}
                    onChange={(e) => setEditDate(e.target.value)}
                    className="w-full min-h-[40px] px-3 py-1.5 border border-slate-300 rounded-xl text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#1E3A8A] mb-1">
                    ย้ายช่วงเวลา
                  </label>
                  <select
                    value={editTime}
                    onChange={(e) => setEditTime(e.target.value)}
                    className="w-full min-h-[40px] px-2.5 py-1.5 border border-slate-300 rounded-xl text-sm bg-white"
                  >
                    {TIME_SLOTS.map((s) => (
                      <option key={s.id} value={s.label}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditModal(null)}
                className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl text-sm font-semibold"
              >
                ยกเลิก
              </button>
              <button
                type="submit"
                className="px-5 py-2 bg-[#1E3A8A] hover:bg-[#172554] text-white rounded-xl text-sm font-semibold"
              >
                บันทึกการเปลี่ยนแปลง
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Printable Official Queue Booking Report (A4 Print Only) */}
      <section className="hidden print:block bg-white text-slate-900 space-y-5">
        <div className="flex items-center justify-between border-b-2 border-slate-900 pb-4">
          <div className="flex items-center gap-4">
            <img
              src={FOUNDATION_LOGO_PATH}
              alt="โลโก้มูลนิธิร่วมกุศลสมุทรปราการ"
              className="w-14 h-14 object-contain"
            />
            <div>
              <h1 className="text-xl font-bold">{FOUNDATION_NAME}</h1>
              <p className="text-sm font-semibold">
                ใบรายงานการจองคิวเข้ารับบริการฝังเข็ม
                {printMode === 'report' && reportData
                  ? ` (${reportPeriod === 'daily' ? 'รายวัน' : reportPeriod === 'monthly' ? 'รายเดือน' : 'รายปี'})`
                  : ` (ประจำวันที่ ${formatThaiDateFull(selectedDate)})`}
              </p>
            </div>
          </div>
          <div className="text-right text-xs text-slate-600 tabular-nums">
            <p>โทร. {FOUNDATION_PHONE}</p>
            <p>พิมพ์เมื่อ: {new Date().toLocaleString('th-TH')}</p>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-3 text-xs border border-slate-300 rounded-lg p-3">
          <div>
            <p className="text-slate-500">คิวทั้งหมด</p>
            <p className="text-base font-bold tabular-nums">
              {printMode === 'report' && reportData
                ? reportData.summary.totalBookings
                : dashboard?.stats.total ?? 0}{' '}
              รายการ
            </p>
          </div>
          <div>
            <p className="text-slate-500">เข้ารับบริการแล้ว</p>
            <p className="text-base font-bold tabular-nums">
              {printMode === 'report' && reportData
                ? reportData.summary.completedCount
                : dashboard?.stats.completed ?? 0}{' '}
              รายการ
            </p>
          </div>
          <div>
            <p className="text-slate-500">ยกเลิก</p>
            <p className="text-base font-bold tabular-nums">
              {printMode === 'report' && reportData
                ? reportData.summary.cancelledCount
                : dashboard?.stats.cancelled ?? 0}{' '}
              รายการ
            </p>
          </div>
          <div>
            <p className="text-slate-500">คิวพิเศษ</p>
            <p className="text-base font-bold tabular-nums">
              {printMode === 'report' && reportData
                ? reportData.summary.specialCount
                : dashboard?.stats.special ?? 0}{' '}
              รายการ
            </p>
          </div>
        </div>

        <table className="w-full text-left text-xs border-collapse border border-slate-300">
          <thead>
            <tr className="bg-slate-100">
              <th className="border border-slate-300 px-2.5 py-2 font-bold">เลขคิว</th>
              <th className="border border-slate-300 px-2.5 py-2 font-bold">วันที่นัด</th>
              <th className="border border-slate-300 px-2.5 py-2 font-bold">ช่วงเวลา</th>
              <th className="border border-slate-300 px-2.5 py-2 font-bold">ชื่อ-นามสกุล</th>
              <th className="border border-slate-300 px-2.5 py-2 font-bold">อายุ</th>
              <th className="border border-slate-300 px-2.5 py-2 font-bold">โรคประจำตัว</th>
              <th className="border border-slate-300 px-2.5 py-2 font-bold">โทรศัพท์</th>
              <th className="border border-slate-300 px-2.5 py-2 font-bold">สถานะ</th>
            </tr>
          </thead>
          <tbody>
            {printableRows.length === 0 ? (
              <tr>
                <td colSpan={8} className="border border-slate-300 px-3 py-6 text-center text-slate-500">
                  ไม่มีรายการจองคิว
                </td>
              </tr>
            ) : (
              printableRows.map((row, idx) => (
                <tr key={`${row.queueNo}-${idx}`}>
                  <td className="border border-slate-300 px-2.5 py-1.5 font-mono-num font-bold">
                    {row.queueNo}
                  </td>
                  <td className="border border-slate-300 px-2.5 py-1.5 tabular-nums">
                    {formatThaiDateNumeric(row.bookingDate)}
                  </td>
                  <td className="border border-slate-300 px-2.5 py-1.5 tabular-nums">
                    {row.bookingTime}
                  </td>
                  <td className="border border-slate-300 px-2.5 py-1.5">{row.fullName}</td>
                  <td className="border border-slate-300 px-2.5 py-1.5 tabular-nums">{row.age}</td>
                  <td className="border border-slate-300 px-2.5 py-1.5">{row.disease}</td>
                  <td className="border border-slate-300 px-2.5 py-1.5 tabular-nums">
                    {formatPhoneDisplay(row.phoneNumber)}
                  </td>
                  <td className="border border-slate-300 px-2.5 py-1.5">
                    {QUEUE_STATUS_LABELS[row.status] || row.status}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        <div className="pt-8 flex justify-end text-xs">
          <div className="text-center space-y-6 w-56">
            <p>ลงชื่อ ...................................................... ผู้จัดทำรายงาน</p>
            <p>({adminUser.displayName})</p>
          </div>
        </div>
      </section>
    </div>
  );
};
