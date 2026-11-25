import { jsPDF } from 'jspdf';
import QRCode from 'qrcode';
import {
  FOUNDATION_LOGO_PATH,
  FOUNDATION_NAME,
  FOUNDATION_PHONE,
  formatPhoneDisplay,
  formatThaiDateNumeric,
} from './constants';

export interface TicketData {
  bookingId?: number;
  queueNo: string;
  queueType?: string;
  fullName: string;
  bookingDate: string;
  bookingTime: string;
  phoneNumber: string;
  disease?: string;
  age?: number;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
): number {
  const chars = text.split('');
  let line = '';
  let currentY = y;

  for (let i = 0; i < chars.length; i++) {
    const testLine = line + chars[i];
    const metrics = ctx.measureText(testLine);
    if (metrics.width > maxWidth && i > 0) {
      ctx.fillText(line, x, currentY);
      line = chars[i];
      currentY += lineHeight;
    } else {
      line = testLine;
    }
  }
  if (line) {
    ctx.fillText(line, x, currentY);
    currentY += lineHeight;
  }
  return currentY;
}

export async function renderTicketCanvas(ticket: TicketData): Promise<HTMLCanvasElement> {
  const width = 900;
  const height = 1280;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable');

  // Background
  ctx.fillStyle = '#F8FAFC';
  ctx.fillRect(0, 0, width, height);

  // Outer Card
  ctx.fillStyle = '#FFFFFF';
  ctx.strokeStyle = '#CBD5E1';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.roundRect(40, 40, width - 80, height - 80, 28);
  ctx.fill();
  ctx.stroke();

  // Top Royal Navy Accent Header
  ctx.fillStyle = '#1E3A8A';
  ctx.beginPath();
  ctx.roundRect(40, 40, width - 80, 220, [28, 28, 0, 0]);
  ctx.fill();

  // Official Unmodified Logo
  try {
    const logoImg = await loadImage(FOUNDATION_LOGO_PATH);
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(width / 2, 118, 56, 0, Math.PI * 2);
    ctx.fill();
    ctx.drawImage(logoImg, width / 2 - 52, 66, 104, 104);
  } catch {
    // Fallback if offline
  }

  ctx.fillStyle = '#FFFFFF';
  ctx.textAlign = 'center';
  ctx.font = 'bold 30px "IBM Plex Sans Thai", sans-serif';
  ctx.fillText(FOUNDATION_NAME, width / 2, 212);

  ctx.fillStyle = '#DBEAFE';
  ctx.font = '500 20px "IBM Plex Sans Thai", sans-serif';
  ctx.fillText('บัตรคิวดิจิทัล · บริการฝังเข็มเพื่อสุขภาพ', width / 2, 244);

  // Queue Number Box
  ctx.fillStyle = '#F1F5F9';
  ctx.beginPath();
  ctx.roundRect(100, 295, width - 200, 175, 20);
  ctx.fill();

  ctx.fillStyle = '#475569';
  ctx.font = '600 24px "IBM Plex Sans Thai", sans-serif';
  ctx.fillText('คิวลำดับที่', width / 2, 345);

  ctx.fillStyle = ticket.queueType === 'special' ? '#B91C1C' : '#1E3A8A';
  ctx.font = 'bold 88px "JetBrains Mono", monospace';
  ctx.fillText(ticket.queueNo, width / 2, 438);

  // Patient Details Rows
  ctx.textAlign = 'left';
  const leftX = 100;
  const valX = 320;
  let rowY = 535;
  const rowGap = 62;

  const rows: Array<[string, string]> = [
    ['ชื่อผู้รับบริการ', ticket.fullName],
    ['วันที่นัดหมาย', formatThaiDateNumeric(ticket.bookingDate)],
    ['เวลานัดหมาย', ticket.bookingTime],
    ['โทรศัพท์', formatPhoneDisplay(ticket.phoneNumber)],
  ];

  for (const [label, value] of rows) {
    ctx.fillStyle = '#64748B';
    ctx.font = '500 24px "IBM Plex Sans Thai", sans-serif';
    ctx.fillText(label, leftX, rowY);

    ctx.fillStyle = '#0F172A';
    ctx.font = '600 26px "IBM Plex Sans Thai", sans-serif';
    ctx.fillText(value, valX, rowY);

    ctx.strokeStyle = '#E2E8F0';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(leftX, rowY + 20);
    ctx.lineTo(width - 100, rowY + 20);
    ctx.stroke();

    rowY += rowGap;
  }

  // QR Code for reception check-in
  const qrPayload = JSON.stringify({
    org: 'ruamkuson-samutprakan',
    queueNo: ticket.queueNo,
    date: ticket.bookingDate,
    time: ticket.bookingTime,
  });
  const qrDataUrl = await QRCode.toDataURL(qrPayload, {
    width: 220,
    margin: 1,
    color: { dark: '#0F172A', light: '#FFFFFF' },
  });
  const qrImg = await loadImage(qrDataUrl);
  ctx.drawImage(qrImg, width / 2 - 95, 790, 190, 190);

  ctx.textAlign = 'center';
  ctx.fillStyle = '#64748B';
  ctx.font = '500 18px "IBM Plex Sans Thai", sans-serif';
  ctx.fillText('สแกน QR Code เพื่อยืนยันคิวที่จุดคัดกรอง', width / 2, 1005);

  // Warning Box
  ctx.fillStyle = '#FEF3C7';
  ctx.strokeStyle = '#F59E0B';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(90, 1030, width - 180, 115, 16);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#92400E';
  ctx.font = 'bold 21px "IBM Plex Sans Thai", sans-serif';
  wrapText(
    ctx,
    'โปรดเข้ามารับบริการก่อนเวลานัดหมาย 15 นาที เพื่อซักประวัติและวัดความดันโลหิต',
    width / 2,
    1078,
    width - 240,
    34,
  );

  // Footer phone
  ctx.fillStyle = '#1E3A8A';
  ctx.font = 'bold 26px "IBM Plex Sans Thai", sans-serif';
  ctx.fillText(`ติดต่อสอบถาม โทร. ${FOUNDATION_PHONE}`, width / 2, 1198);

  return canvas;
}

export async function downloadTicketImage(ticket: TicketData): Promise<void> {
  const canvas = await renderTicketCanvas(ticket);
  const dataUrl = canvas.toDataURL('image/png');
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = `บัตรคิว-${ticket.queueNo}-${ticket.bookingDate}.png`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export async function downloadTicketPdf(ticket: TicketData): Promise<void> {
  const canvas = await renderTicketCanvas(ticket);
  const imgData = canvas.toDataURL('image/png');
  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });
  const pdfWidth = pdf.internal.pageSize.getWidth();
  const imgWidth = 150;
  const imgHeight = (canvas.height * imgWidth) / canvas.width;
  const x = (pdfWidth - imgWidth) / 2;
  pdf.addImage(imgData, 'PNG', x, 14, imgWidth, imgHeight);
  pdf.save(`ใบนัดฝังเข็ม-${ticket.queueNo}-${ticket.bookingDate}.pdf`);
}

function parseSlotTimes(dateStr: string, slotLabel: string): { start: Date; end: Date } {
  // e.g. "09.00 - 09.30 น."
  const match = slotLabel.match(/(\d{2})\.(\d{2})\s*-\s*(\d{2})\.(\d{2})/);
  const sh = match ? match[1] : '09';
  const sm = match ? match[2] : '00';
  const eh = match ? match[3] : '09';
  const em = match ? match[4] : '30';
  const start = new Date(`${dateStr}T${sh}:${sm}:00+07:00`);
  const end = new Date(`${dateStr}T${eh}:${em}:00+07:00`);
  return { start, end };
}

function toIcsUtc(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

export function downloadCalendarIcs(ticket: TicketData): void {
  const { start, end } = parseSlotTimes(ticket.bookingDate, ticket.bookingTime);
  const uid = `ruamkuson-${ticket.queueNo}-${ticket.bookingDate}@samutprakan.org`;
  const summary = `นัดฝังเข็ม คิว ${ticket.queueNo} - ${FOUNDATION_NAME}`;
  const description = `คิวลำดับที่ ${ticket.queueNo}\\nชื่อ: ${ticket.fullName}\\nโปรดเข้ามารับบริการก่อนเวลานัดหมาย 15 นาที เพื่อซักประวัติและวัดความดันโลหิต\\nโทร: ${FOUNDATION_PHONE}`;

  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Ruamkuson Samutprakan//Acupuncture Queue//TH',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${toIcsUtc(new Date())}`,
    `DTSTART:${toIcsUtc(start)}`,
    `DTEND:${toIcsUtc(end)}`,
    `SUMMARY:${summary}`,
    `LOCATION:${FOUNDATION_NAME}`,
    `DESCRIPTION:${description}`,
    'BEGIN:VALARM',
    'TRIGGER:-P1D',
    'ACTION:DISPLAY',
    'DESCRIPTION:ท่านมีนัดเข้ารับบริการฝังเข็มในวันพรุ่งนี้ โปรดเดินทางมาถึงก่อนเวลานัด 15 นาที',
    'END:VALARM',
    'BEGIN:VALARM',
    'TRIGGER:-PT1H',
    'ACTION:DISPLAY',
    'DESCRIPTION:อีก 1 ชั่วโมงจะถึงเวลานัดฝังเข็ม โปรดเตรียมตัวเดินทาง',
    'END:VALARM',
    'BEGIN:VALARM',
    'TRIGGER:-PT15M',
    'ACTION:DISPLAY',
    'DESCRIPTION:ท่านมีนัดเข้ารับบริการฝังเข็ม โปรดเดินทางมาถึงก่อนเวลานัด 15 นาที',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');

  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `นัดฝังเข็ม-${ticket.queueNo}.ics`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function getGoogleCalendarUrl(ticket: TicketData): string {
  const { start, end } = parseSlotTimes(ticket.bookingDate, ticket.bookingTime);
  const dates = `${toIcsUtc(start)}/${toIcsUtc(end)}`;
  const text = encodeURIComponent(`นัดฝังเข็ม คิว ${ticket.queueNo} (${FOUNDATION_NAME})`);
  const details = encodeURIComponent(
    `คิวลำดับที่: ${ticket.queueNo}\nผู้รับบริการ: ${ticket.fullName}\nโปรดเข้ามารับบริการก่อนเวลานัดหมาย 15 นาที เพื่อซักประวัติและวัดความดันโลหิต\nโทร: ${FOUNDATION_PHONE}`,
  );
  const location = encodeURIComponent(FOUNDATION_NAME);
  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${text}&dates=${dates}&details=${details}&location=${location}`;
}
