export interface TimeSlotDef {
  id: string;
  label: string;
  startTime: string;
  endTime: string;
  defaultCapacity: number;
}

export const FOUNDATION_LOGO_PATH = '/assets/aistudio/382492-Photoroom_4c9e02f3.png';
export const CLINIC_SHIELD_PATH = '/assets/aistudio/___________________________73e90aad.png';
export const CLINIC_HERO_IMAGE = '/src/assets/images/acupuncture_clinic_hero_1795592231882.jpg';
export const CLINIC_DETAIL_IMAGE = '/src/assets/images/acupuncture_care_detail_1795592232611.jpg';

export const FOUNDATION_NAME = 'มูลนิธิร่วมกุศลสมุทรปราการ';
export const SYSTEM_TITLE = 'ระบบนัดหมายเข้ารับบริการฝังเข็ม มูลนิธิร่วมกุศลสมุทรปราการ';
export const FOUNDATION_PHONE = '02-175-8668';

export const TIME_SLOTS: TimeSlotDef[] = [
  { id: 'slot-1', label: '09.00 - 09.30 น.', startTime: '09:00', endTime: '09:30', defaultCapacity: 5 },
  { id: 'slot-2', label: '09.31 - 10.00 น.', startTime: '09:31', endTime: '10:00', defaultCapacity: 5 },
  { id: 'slot-3', label: '10.01 - 10.30 น.', startTime: '10:01', endTime: '10:30', defaultCapacity: 5 },
  { id: 'slot-4', label: '10.31 - 11.00 น.', startTime: '10:31', endTime: '11:00', defaultCapacity: 5 },
  { id: 'slot-5', label: '11.01 - 11.30 น.', startTime: '11:01', endTime: '11:30', defaultCapacity: 5 },
];

export const COMMON_DISEASES = [
  'ไม่มีโรคประจำตัว',
  'ความดันโลหิตสูง',
  'เบาหวาน',
  'ออฟฟิศซินโดรม / ปวดคอ บ่า ไหล่',
  'ปวดหลัง / หมอนรองกระดูกทับเส้น',
  'ข้อเข่าเสื่อม',
  'อัมพฤกษ์ / อัมพาต ฟื้นฟู',
  'นอนไม่หลับ / ไมเกรน',
];

export type QueueStatus = 'waiting' | 'calling' | 'completed' | 'cancelled';
export type QueueType = 'regular' | 'special';
export type AdminRole = 'staff' | 'super_admin';

export const QUEUE_STATUS_LABELS: Record<QueueStatus, string> = {
  waiting: 'รอรับบริการ',
  calling: 'กำลังเรียกคิว',
  completed: 'เข้ารับบริการแล้ว',
  cancelled: 'ยกเลิก',
};

export const THAI_MONTHS_SHORT = [
  'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
  'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.',
];

export const THAI_MONTHS_FULL = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
];

export const THAI_DAYS_SHORT = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];

export function getBangkokDateStr(offsetDays = 0): string {
  const now = new Date();
  const bangkok = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Bangkok' }));
  bangkok.setDate(bangkok.getDate() + offsetDays);
  const y = bangkok.getFullYear();
  const m = String(bangkok.getMonth() + 1).padStart(2, '0');
  const d = String(bangkok.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function formatThaiDateNumeric(dateStr: string): string {
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  const year = Number(parts[0]) + 543;
  return `${parts[2]}/${parts[1]}/${year}`;
}

export function formatThaiDateFull(dateStr: string): string {
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  const year = Number(parts[0]) + 543;
  const monthIdx = Number(parts[1]) - 1;
  const day = Number(parts[2]);
  return `${day} ${THAI_MONTHS_FULL[monthIdx] || parts[1]} ${year}`;
}

export function maskPhoneNumber(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 7) return phone;
  return `${digits.slice(0, 3)}-XXX-${digits.slice(-4)}`;
}

export function formatPhoneDisplay(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  if (digits.length === 9) {
    return `${digits.slice(0, 2)}-${digits.slice(2, 5)}-${digits.slice(5)}`;
  }
  return phone;
}
