import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import {
  AlertTriangle,
  Bell,
  CalendarPlus,
  CheckCircle2,
  Download,
  ImageDown,
  Phone,
  Smartphone,
  Wallet,
} from 'lucide-react';
import {
  FOUNDATION_LOGO_PATH,
  FOUNDATION_NAME,
  FOUNDATION_PHONE,
  formatPhoneDisplay,
  formatThaiDateNumeric,
} from '../lib/constants';
import {
  downloadCalendarIcs,
  downloadTicketImage,
  downloadTicketPdf,
  getGoogleCalendarUrl,
  type TicketData,
} from '../lib/ticketExport';

interface DigitalTicketViewProps {
  ticket: TicketData | null;
  onBookAnother: () => void;
  onTrackQueue: (queueNo: string) => void;
}

export const DigitalTicketView: React.FC<DigitalTicketViewProps> = ({
  ticket,
  onBookAnother,
  onTrackQueue,
}) => {
  const [qrUrl, setQrUrl] = useState<string>('');
  const [busyAction, setBusyAction] = useState<string>('');
  const [feedbackMsg, setFeedbackMsg] = useState<string>('');
  const [walletGuide, setWalletGuide] = useState<'google' | 'apple' | null>(null);
  const [notifStatus, setNotifStatus] = useState<'default' | 'granted' | 'denied'>(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      return Notification.permission;
    }
    return 'default';
  });

  useEffect(() => {
    if (!ticket) return;
    const payload = JSON.stringify({
      org: 'ruamkuson-samutprakan',
      queueNo: ticket.queueNo,
      date: ticket.bookingDate,
      time: ticket.bookingTime,
    });
    QRCode.toDataURL(payload, {
      width: 220,
      margin: 1,
      color: { dark: '#0F172A', light: '#FFFFFF' },
    })
      .then(setQrUrl)
      .catch(() => setQrUrl(''));
  }, [ticket]);

  if (!ticket) {
    return (
      <div className="max-w-2xl mx-auto bg-white border border-slate-200 rounded-2xl p-8 text-center space-y-4">
        <p className="text-lg font-bold text-slate-900">ยังไม่มีบัตรคิวดิจิทัลที่เลือก</p>
        <p className="text-sm text-slate-600">
          ท่านสามารถจองคิวใหม่หรือค้นหาบัตรคิวเดิมจากหน้าตรวจสอบสถานะคิวได้ทันที
        </p>
        <button
          type="button"
          onClick={onBookAnother}
          className="px-6 py-3 min-h-[44px] bg-[#16A34A] text-white font-semibold rounded-xl hover:bg-[#15803D]"
        >
          ไปหน้าจองคิว
        </button>
      </div>
    );
  }

  const handleDownloadPdf = async () => {
    setBusyAction('pdf');
    setFeedbackMsg('');
    try {
      await downloadTicketPdf(ticket);
      setFeedbackMsg('ดาวน์โหลดไฟล์ PDF ใบนัดเรียบร้อยแล้ว');
    } catch {
      setFeedbackMsg('ไม่สามารถสร้างไฟล์ PDF ได้ กรุณาลองใหม่อีกครั้ง');
    } finally {
      setBusyAction('');
    }
  };

  const handleDownloadImage = async () => {
    setBusyAction('img');
    setFeedbackMsg('');
    try {
      await downloadTicketImage(ticket);
      setFeedbackMsg('บันทึกรูปภาพบัตรคิวเรียบร้อยแล้ว');
    } catch {
      setFeedbackMsg('ไม่สามารถบันทึกรูปภาพได้ กรุณาลองใหม่อีกครั้ง');
    } finally {
      setBusyAction('');
    }
  };

  const handleCalendarDownload = () => {
    downloadCalendarIcs(ticket);
    setFeedbackMsg('ดาวน์โหลดไฟล์ปฏิทิน (.ics) พร้อมตั้งเตือนล่วงหน้า 1 วัน, 1 ชั่วโมง และ 15 นาทีเรียบร้อยแล้ว');
  };

  const handleEnableNotifications = async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      setFeedbackMsg('เบราว์เซอร์นี้ไม่รองรับการแจ้งเตือน กรุณาใช้ปุ่มเพิ่มลงปฏิทินมือถือแทน');
      return;
    }
    const perm = await Notification.requestPermission();
    setNotifStatus(perm);
    if (perm === 'granted') {
      new Notification(`ตั้งเตือนนัดฝังเข็มสำเร็จ · คิว ${ticket.queueNo}`, {
        body: 'ท่านมีนัดเข้ารับบริการฝังเข็ม โปรดเดินทางมาถึงก่อนเวลานัด 15 นาที',
      });
      setFeedbackMsg('เปิดรับการแจ้งเตือนล่วงหน้า (1 วัน / 1 ชั่วโมง / 15 นาที) เรียบร้อยแล้ว');
    } else {
      setFeedbackMsg('การแจ้งเตือนถูกปิดไว้ในเบราว์เซอร์ ท่านสามารถเพิ่มนัดลงปฏิทินมือถือเพื่อรับการแจ้งเตือนแทนได้');
    }
  };

  const handleTestReminder = () => {
    setFeedbackMsg('ท่านมีนัดเข้ารับบริการฝังเข็ม โปรดเดินทางมาถึงก่อนเวลานัด 15 นาที');
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
      new Notification(`แจ้งเตือนคิว ${ticket.queueNo} (${FOUNDATION_NAME})`, {
        body: 'ท่านมีนัดเข้ารับบริการฝังเข็ม โปรดเดินทางมาถึงก่อนเวลานัด 15 นาที',
      });
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-16">
      <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3 text-emerald-900">
          <CheckCircle2 className="w-6 h-6 text-emerald-700 shrink-0" />
          <div>
            <p className="font-bold text-base">บันทึกการจองและออกบัตรคิวดิจิทัลสำเร็จ</p>
            <p className="text-sm text-emerald-800">
              กรุณาบันทึกบัตรคิวลงมือถือหรือเพิ่มลงปฏิทินเพื่อความสะดวกในวันเข้ารับบริการ
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => onTrackQueue(ticket.queueNo)}
          className="px-4 py-2.5 min-h-[44px] text-sm font-semibold text-white bg-[#1E3A8A] hover:bg-[#172554] rounded-xl whitespace-nowrap shrink-0"
        >
          ติดตามสถานะคิวแบบ Real-Time
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Official Digital Queue Ticket Card */}
        <section className="lg:col-span-6 bg-white border border-slate-200 rounded-2xl overflow-hidden">
          <div className="bg-[#1E3A8A] text-white px-6 py-6 flex flex-col items-center text-center gap-3">
            <div className="bg-white rounded-full p-1.5">
              <img
                src={FOUNDATION_LOGO_PATH}
                alt="โลโก้มูลนิธิร่วมกุศลสมุทรปราการ"
                className="w-16 h-16 object-contain"
                referrerPolicy="no-referrer"
              />
            </div>
            <div>
              <h1 className="text-lg font-bold">{FOUNDATION_NAME}</h1>
              <p className="text-xs text-blue-100">บัตรคิวดิจิทัล · บริการฝังเข็ม</p>
            </div>
          </div>

          <div className="p-6 space-y-6">
            <div className="bg-slate-50 border border-slate-200 rounded-xl py-5 px-4 text-center">
              <p className="text-sm font-semibold text-slate-600">คิวลำดับที่</p>
              <p
                className={`mt-1 text-5xl font-bold font-mono-num tracking-tight ${
                  ticket.queueType === 'special' ? 'text-red-700' : 'text-[#1E3A8A]'
                }`}
              >
                {ticket.queueNo}
              </p>
              {ticket.queueType === 'special' && (
                <p className="mt-1 text-xs font-semibold text-red-700">คิวพิเศษเร่งด่วน</p>
              )}
            </div>

            <dl className="divide-y divide-slate-200 text-sm sm:text-base">
              <div className="py-3 flex justify-between gap-4">
                <dt className="text-slate-500">ชื่อผู้รับบริการ</dt>
                <dd className="font-semibold text-slate-900 text-right">{ticket.fullName}</dd>
              </div>
              <div className="py-3 flex justify-between gap-4">
                <dt className="text-slate-500">วันที่นัดหมาย</dt>
                <dd className="font-semibold text-slate-900 tabular-nums text-right">
                  {formatThaiDateNumeric(ticket.bookingDate)}
                </dd>
              </div>
              <div className="py-3 flex justify-between gap-4">
                <dt className="text-slate-500">เวลานัดหมาย</dt>
                <dd className="font-semibold text-slate-900 tabular-nums text-right">
                  {ticket.bookingTime}
                </dd>
              </div>
              <div className="py-3 flex justify-between gap-4">
                <dt className="text-slate-500">เบอร์โทรศัพท์</dt>
                <dd className="font-semibold text-slate-900 tabular-nums text-right">
                  {formatPhoneDisplay(ticket.phoneNumber)}
                </dd>
              </div>
            </dl>

            {qrUrl && (
              <div className="flex flex-col items-center gap-2 pt-2">
                <img
                  src={qrUrl}
                  alt={`QR Code สำหรับคิว ${ticket.queueNo}`}
                  className="w-36 h-36 border border-slate-200 rounded-xl p-1 bg-white"
                />
                <p className="text-xs text-slate-500">แสดง QR Code นี้ที่จุดคัดกรอง</p>
              </div>
            )}

            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-800 shrink-0 mt-0.5" />
              <p className="text-sm font-medium text-amber-950 leading-relaxed">
                โปรดเข้ามารับบริการก่อนเวลานัดหมาย 15 นาที เพื่อซักประวัติและวัดความดันโลหิต
              </p>
            </div>

            <div className="text-center pt-2 border-t border-slate-200">
              <a
                href={`tel:${FOUNDATION_PHONE.replace(/-/g, '')}`}
                className="inline-flex items-center gap-2 text-base font-bold text-[#1E3A8A] tabular-nums"
              >
                <Phone className="w-4 h-4" />
                <span>{FOUNDATION_PHONE}</span>
              </a>
            </div>
          </div>
        </section>

        {/* Save to Mobile, Wallets, Calendar & Automated Alerts */}
        <div className="lg:col-span-6 space-y-6">
          <section className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4">
            <h2 className="text-lg font-bold text-slate-900">
              บันทึกบัตรคิวลงมือถือและปฏิทิน
            </h2>
            <p className="text-sm text-slate-600">
              เลือกบันทึกรูปภาพหรือเอกสาร PDF ไว้ในเครื่อง หรือเพิ่มลงปฏิทินมือถือเพื่อรับการแจ้งเตือนอัตโนมัติ
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                disabled={busyAction === 'pdf'}
                onClick={handleDownloadPdf}
                className="min-h-[48px] px-4 py-2.5 bg-[#1E3A8A] hover:bg-[#172554] text-white text-sm font-semibold rounded-xl flex items-center justify-center gap-2 transition-colors"
              >
                <Download className="w-4 h-4 shrink-0" />
                <span>Download PDF ใบนัด</span>
              </button>

              <button
                type="button"
                disabled={busyAction === 'img'}
                onClick={handleDownloadImage}
                className="min-h-[48px] px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold rounded-xl flex items-center justify-center gap-2 transition-colors"
              >
                <ImageDown className="w-4 h-4 shrink-0" />
                <span>Save Image Ticket</span>
              </button>

              <button
                type="button"
                onClick={() => setWalletGuide(walletGuide === 'google' ? null : 'google')}
                className="min-h-[48px] px-4 py-2.5 bg-white hover:bg-slate-50 text-slate-900 border border-slate-300 text-sm font-semibold rounded-xl flex items-center justify-center gap-2 transition-colors"
              >
                <Wallet className="w-4 h-4 text-[#1E3A8A] shrink-0" />
                <span>Add to Google Wallet</span>
              </button>

              <button
                type="button"
                onClick={() => setWalletGuide(walletGuide === 'apple' ? null : 'apple')}
                className="min-h-[48px] px-4 py-2.5 bg-white hover:bg-slate-50 text-slate-900 border border-slate-300 text-sm font-semibold rounded-xl flex items-center justify-center gap-2 transition-colors"
              >
                <Smartphone className="w-4 h-4 text-slate-800 shrink-0" />
                <span>Add to Apple Wallet</span>
              </button>
            </div>

            {walletGuide && (
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3 text-sm">
                <p className="font-semibold text-slate-900">
                  {walletGuide === 'google'
                    ? 'บันทึกบัตรคิวลง Google Wallet / Google Calendar'
                    : 'บันทึกบัตรคิวลง Apple Wallet / ปฏิทิน iOS'}
                </p>
                <p className="text-slate-600">
                  สามารถบันทึกรูปภาพบัตรคิวพร้อม QR Code ไว้ในเครื่อง และเพิ่มนัดหมายลงปฏิทินมือถือเพื่อรับการแจ้งเตือนได้ทันที
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={handleDownloadImage}
                    className="px-3.5 py-2 bg-[#1E3A8A] text-white text-xs font-semibold rounded-lg"
                  >
                    บันทึกรูปบัตรคิว (QR Pass)
                  </button>
                  {walletGuide === 'google' ? (
                    <a
                      href={getGoogleCalendarUrl(ticket)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3.5 py-2 bg-white border border-slate-300 text-slate-900 text-xs font-semibold rounded-lg inline-flex items-center"
                    >
                      เปิด Google Calendar
                    </a>
                  ) : (
                    <button
                      type="button"
                      onClick={handleCalendarDownload}
                      className="px-3.5 py-2 bg-white border border-slate-300 text-slate-900 text-xs font-semibold rounded-lg"
                    >
                      เพิ่มลง Apple Calendar (.ics)
                    </button>
                  )}
                </div>
              </div>
            )}

            <div className="pt-2 flex flex-col sm:flex-row gap-3">
              <button
                type="button"
                onClick={handleCalendarDownload}
                className="flex-1 min-h-[48px] px-4 py-2.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-200 text-sm font-semibold rounded-xl flex items-center justify-center gap-2 transition-colors"
              >
                <CalendarPlus className="w-4 h-4 shrink-0" />
                <span>เพิ่มลงปฏิทินมือถืออัตโนมัติ (.ics)</span>
              </button>
              <a
                href={getGoogleCalendarUrl(ticket)}
                target="_blank"
                rel="noopener noreferrer"
                className="min-h-[48px] px-4 py-2.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 text-sm font-semibold rounded-xl flex items-center justify-center gap-2 transition-colors"
              >
                <span>Google Calendar</span>
              </a>
            </div>
          </section>

          <section className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4">
            <div className="flex items-center gap-2.5">
              <Bell className="w-5 h-5 text-[#1E3A8A]" />
              <h2 className="text-lg font-bold text-slate-900">ระบบแจ้งเตือนอัตโนมัติ</h2>
            </div>

            <div className="divide-y divide-slate-200 border border-slate-200 rounded-xl text-sm">
              <div className="px-4 py-3 flex items-center justify-between">
                <span className="text-slate-700">1 วันก่อนนัดหมาย</span>
                <span className="font-semibold text-emerald-700">ตั้งค่าเตือนใน .ics</span>
              </div>
              <div className="px-4 py-3 flex items-center justify-between">
                <span className="text-slate-700">1 ชั่วโมงก่อนนัดหมาย</span>
                <span className="font-semibold text-emerald-700">ตั้งค่าเตือนใน .ics</span>
              </div>
              <div className="px-4 py-3 flex items-center justify-between">
                <span className="text-slate-700">15 นาทีก่อนนัดหมาย</span>
                <span className="font-semibold text-emerald-700">ตั้งค่าเตือนใน .ics</span>
              </div>
            </div>

            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-700">
              ข้อความแจ้งเตือน: “ท่านมีนัดเข้ารับบริการฝังเข็ม โปรดเดินทางมาถึงก่อนเวลานัด 15 นาที”
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={handleEnableNotifications}
                className="min-h-[44px] px-4 py-2 bg-[#1E3A8A] hover:bg-[#172554] text-white text-sm font-semibold rounded-xl transition-colors"
              >
                {notifStatus === 'granted' ? 'เปิดรับแจ้งเตือนแล้ว' : 'เปิดแจ้งเตือนผ่านเบราว์เซอร์'}
              </button>
              <button
                type="button"
                onClick={handleTestReminder}
                className="min-h-[44px] px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 text-sm font-medium rounded-xl transition-colors"
              >
                ทดสอบข้อความแจ้งเตือน
              </button>
            </div>
          </section>

          {feedbackMsg && (
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl text-sm font-medium text-blue-950">
              {feedbackMsg}
            </div>
          )}

          <div className="flex justify-end">
            <button
              type="button"
              onClick={onBookAnother}
              className="text-sm font-semibold text-[#1E3A8A] hover:underline"
            >
              จองคิวเพิ่มเติมสำหรับผู้รับบริการท่านอื่น
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
