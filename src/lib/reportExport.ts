import { jsPDF } from 'jspdf';
import * as XLSX from 'xlsx';
import {
  FOUNDATION_NAME,
  QUEUE_STATUS_LABELS,
  formatThaiDateNumeric,
  type QueueStatus,
} from './constants';

export interface ReportPayload {
  period: 'daily' | 'monthly' | 'yearly';
  referenceDate: string;
  summary: {
    totalBookings: number;
    activePatients: number;
    completedCount: number;
    cancelledCount: number;
    specialCount: number;
    averageAge: number;
    peakTimeSlot: string;
  };
  topDiseases: Array<{ name: string; count: number }>;
  slotDistribution: Array<{ slot: string; count: number }>;
  records: Array<{
    queueNo: string;
    bookingDate: string;
    bookingTime: string;
    fullName: string;
    age: number;
    disease: string;
    phoneNumber: string;
    queueType: string;
    status: string;
  }>;
}

const PERIOD_LABELS = {
  daily: 'รายวัน',
  monthly: 'รายเดือน',
  yearly: 'รายปี',
};

export function exportReportExcel(report: ReportPayload): void {
  const rows = report.records.map((r) => ({
    'เลขคิว': r.queueNo,
    'ประเภทคิว': r.queueType,
    'วันที่นัดหมาย': formatThaiDateNumeric(r.bookingDate),
    'ช่วงเวลา': r.bookingTime,
    'ชื่อ-นามสกุล': r.fullName,
    'อายุ (ปี)': r.age,
    'โรคประจำตัว': r.disease,
    'เบอร์โทรศัพท์': r.phoneNumber,
    'สถานะ': QUEUE_STATUS_LABELS[r.status as QueueStatus] || r.status,
  }));

  const summaryRows = [
    { 'หัวข้อ': 'หน่วยงาน', 'ค่า': FOUNDATION_NAME },
    { 'หัวข้อ': 'ประเภทรายงาน', 'ค่า': PERIOD_LABELS[report.period] },
    { 'หัวข้อ': 'วันที่อ้างอิง', 'ค่า': formatThaiDateNumeric(report.referenceDate) },
    { 'หัวข้อ': 'จำนวนผู้รับบริการทั้งหมด (ไม่รวมยกเลิก)', 'ค่า': report.summary.activePatients },
    { 'หัวข้อ': 'เข้ารับบริการแล้ว', 'ค่า': report.summary.completedCount },
    { 'หัวข้อ': 'ยกเลิกคิว', 'ค่า': report.summary.cancelledCount },
    { 'หัวข้อ': 'คิวพิเศษ', 'ค่า': report.summary.specialCount },
    { 'หัวข้อ': 'อายุเฉลี่ย (ปี)', 'ค่า': report.summary.averageAge },
    { 'หัวข้อ': 'ช่วงเวลาที่มีผู้จองมากที่สุด', 'ค่า': report.summary.peakTimeSlot },
  ];

  const wb = XLSX.utils.book_new();
  const wsSummary = XLSX.utils.json_to_sheet(summaryRows);
  const wsRecords = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, wsSummary, 'สรุปรายงาน');
  XLSX.utils.book_append_sheet(wb, wsRecords, 'รายชื่อผู้รับบริการ');
  XLSX.writeFile(wb, `รายงานฝังเข็ม-${report.period}-${report.referenceDate}.xlsx`);
}

export function exportReportCsv(report: ReportPayload): void {
  const headers = [
    'เลขคิว',
    'ประเภทคิว',
    'วันที่นัดหมาย',
    'ช่วงเวลา',
    'ชื่อ-นามสกุล',
    'อายุ',
    'โรคประจำตัว',
    'เบอร์โทรศัพท์',
    'สถานะ',
  ];

  const escapeCsv = (val: string | number) => {
    const str = String(val ?? '');
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const lines = [
    headers.map(escapeCsv).join(','),
    ...report.records.map((r) =>
      [
        r.queueNo,
        r.queueType,
        formatThaiDateNumeric(r.bookingDate),
        r.bookingTime,
        r.fullName,
        r.age,
        r.disease,
        r.phoneNumber,
        QUEUE_STATUS_LABELS[r.status as QueueStatus] || r.status,
      ]
        .map(escapeCsv)
        .join(','),
    ),
  ];

  const csvContent = '\uFEFF' + lines.join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `รายงานฝังเข็ม-${report.period}-${report.referenceDate}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function exportReportPdf(report: ReportPayload): void {
  const width = 1240;
  const rowCount = Math.min(report.records.length, 24);
  const height = 980 + rowCount * 42;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = '#1E3A8A';
  ctx.fillRect(0, 0, width, 120);

  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 30px "IBM Plex Sans Thai", sans-serif';
  ctx.fillText(`รายงานสถิติการให้บริการฝังเข็ม (${PERIOD_LABELS[report.period]})`, 48, 56);
  ctx.font = '500 20px "IBM Plex Sans Thai", sans-serif';
  ctx.fillStyle = '#DBEAFE';
  ctx.fillText(`${FOUNDATION_NAME} · ข้อมูล ณ วันที่ ${formatThaiDateNumeric(report.referenceDate)}`, 48, 92);

  // Summary strip
  const cards = [
    ['ผู้รับบริการรวม', `${report.summary.activePatients} ราย`],
    ['อายุเฉลี่ย', `${report.summary.averageAge} ปี`],
    ['คิวพิเศษ', `${report.summary.specialCount} คิว`],
    ['ช่วงเวลายอดนิยม', report.summary.peakTimeSlot],
  ];

  cards.forEach(([label, val], idx) => {
    const x = 48 + idx * 290;
    ctx.fillStyle = '#F8FAFC';
    ctx.strokeStyle = '#CBD5E1';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(x, 150, 270, 110, 14);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#64748B';
    ctx.font = '600 18px "IBM Plex Sans Thai", sans-serif';
    ctx.fillText(label, x + 20, 188);

    ctx.fillStyle = '#0F172A';
    ctx.font = 'bold 24px "IBM Plex Sans Thai", sans-serif';
    ctx.fillText(val, x + 20, 232);
  });

  // Top Diseases
  ctx.fillStyle = '#0F172A';
  ctx.font = 'bold 22px "IBM Plex Sans Thai", sans-serif';
  ctx.fillText('โรคประจำตัว / อาการที่พบบ่อย', 48, 316);

  report.topDiseases.slice(0, 5).forEach((d, idx) => {
    const y = 356 + idx * 42;
    ctx.fillStyle = '#334155';
    ctx.font = '500 19px "IBM Plex Sans Thai", sans-serif';
    ctx.fillText(`${idx + 1}. ${d.name}`, 60, y);
    ctx.fillStyle = '#1E3A8A';
    ctx.font = 'bold 19px "IBM Plex Sans Thai", sans-serif';
    ctx.fillText(`${d.count} ราย`, 520, y);
  });

  // Records Table
  let tableY = 600;
  ctx.fillStyle = '#0F172A';
  ctx.font = 'bold 22px "IBM Plex Sans Thai", sans-serif';
  ctx.fillText(`รายการผู้รับบริการ (${report.records.length} รายการ)`, 48, tableY);
  tableY += 28;

  ctx.fillStyle = '#F1F5F9';
  ctx.fillRect(48, tableY, width - 96, 42);
  ctx.fillStyle = '#334155';
  ctx.font = 'bold 18px "IBM Plex Sans Thai", sans-serif';
  ctx.fillText('คิว', 64, tableY + 28);
  ctx.fillText('วันที่', 150, tableY + 28);
  ctx.fillText('เวลา', 290, tableY + 28);
  ctx.fillText('ชื่อ-นามสกุล', 480, tableY + 28);
  ctx.fillText('อายุ', 770, tableY + 28);
  ctx.fillText('โรคประจำตัว', 850, tableY + 28);
  ctx.fillText('สถานะ', 1070, tableY + 28);
  tableY += 42;

  report.records.slice(0, 24).forEach((r) => {
    ctx.strokeStyle = '#E2E8F0';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(48, tableY + 38);
    ctx.lineTo(width - 48, tableY + 38);
    ctx.stroke();

    ctx.fillStyle = '#0F172A';
    ctx.font = 'bold 17px "JetBrains Mono", monospace';
    ctx.fillText(r.queueNo, 64, tableY + 26);

    ctx.font = '500 17px "IBM Plex Sans Thai", sans-serif';
    ctx.fillText(formatThaiDateNumeric(r.bookingDate), 150, tableY + 26);
    ctx.fillText(r.bookingTime, 290, tableY + 26);
    ctx.fillText(r.fullName.slice(0, 22), 480, tableY + 26);
    ctx.fillText(`${r.age}`, 770, tableY + 26);
    ctx.fillText(r.disease.slice(0, 18), 850, tableY + 26);
    ctx.fillText(QUEUE_STATUS_LABELS[r.status as QueueStatus] || r.status, 1070, tableY + 26);

    tableY += 40;
  });

  const imgData = canvas.toDataURL('image/png');
  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });
  const pdfWidth = pdf.internal.pageSize.getWidth();
  const imgWidth = pdfWidth - 16;
  const imgHeight = (canvas.height * imgWidth) / canvas.width;
  pdf.addImage(imgData, 'PNG', 8, 8, imgWidth, Math.min(imgHeight, 280));
  pdf.save(`รายงานฝังเข็ม-${report.period}-${report.referenceDate}.pdf`);
}
