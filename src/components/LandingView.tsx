import React from 'react';
import {
  ArrowRight,
  CalendarCheck,
  Clock,
  FileSearch,
  Phone,
  PhoneCall,
  ShieldCheck,
} from 'lucide-react';
import {
  CLINIC_DETAIL_IMAGE,
  CLINIC_HERO_IMAGE,
  FOUNDATION_LOGO_PATH,
  FOUNDATION_NAME,
  FOUNDATION_PHONE,
  SYSTEM_TITLE,
  TIME_SLOTS,
} from '../lib/constants';
import type { AppView } from './Navbar';

interface LandingViewProps {
  callingQueueNo: string | null;
  todayTotal: number;
  todayWaiting: number;
  bookingPaused: boolean;
  pauseReason: string;
  onNavigate: (view: AppView) => void;
}

export const LandingView: React.FC<LandingViewProps> = ({
  callingQueueNo,
  todayTotal,
  todayWaiting,
  bookingPaused,
  pauseReason,
  onNavigate,
}) => {
  const actions: Array<{
    view: AppView;
    title: string;
    subtitle: string;
    icon: React.ReactNode;
    accentText: string;
  }> = [
    {
      view: 'booking',
      title: 'จองคิวเข้ารับบริการ',
      subtitle: 'เลือกวัน-เวลาและกรอกข้อมูลได้ทันที ไม่ต้องเข้าสู่ระบบ',
      icon: <CalendarCheck className="w-6 h-6" />,
      accentText: 'เปิดจองวันละ 25 คิว (5 ช่วงเวลา)',
    },
    {
      view: 'status',
      title: 'ตรวจสอบสถานะคิว',
      subtitle: 'ติดตามลำดับคิวที่กำลังเรียกและคิวที่รอแบบเรียลไทม์',
      icon: <Clock className="w-6 h-6" />,
      accentText: callingQueueNo ? `กำลังเรียกคิว ${callingQueueNo}` : 'อัปเดตสถานะอัตโนมัติ',
    },
    {
      view: 'history',
      title: 'ประวัติการรับบริการ',
      subtitle: 'ค้นหาประวัติการฝังเข็ม อาการ และคำแนะนำจากแพทย์',
      icon: <FileSearch className="w-6 h-6" />,
      accentText: 'ค้นหาด้วยเบอร์โทรหรือเลขคิว',
    },
    {
      view: 'contact',
      title: 'ติดต่อเจ้าหน้าที่',
      subtitle: 'สอบถามข้อมูลคลินิก การเตรียมตัว และเวลาเปิดให้บริการ',
      icon: <PhoneCall className="w-6 h-6" />,
      accentText: `โทร. ${FOUNDATION_PHONE}`,
    },
  ];

  return (
    <div className="space-y-8 pb-8">
      {bookingPaused && (
        <div
          role="alert"
          className="bg-red-50 border border-red-200 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
        >
          <div className="space-y-1">
            <p className="text-base font-semibold text-red-900">
              ประกาศปิดรับจองคิวออนไลน์ชั่วคราว
            </p>
            <p className="text-sm text-red-700">
              {pauseReason || 'ขณะนี้เจ้าหน้าที่ปิดรับการจองคิวชั่วคราว กรุณาติดต่อสอบถามเจ้าหน้าที่โดยตรง'}
            </p>
          </div>
          <a
            href={`tel:${FOUNDATION_PHONE.replace(/-/g, '')}`}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 min-h-[42px] text-sm font-semibold text-white bg-red-700 hover:bg-red-800 rounded-xl whitespace-nowrap shrink-0"
          >
            <Phone className="w-4 h-4" />
            <span>โทร {FOUNDATION_PHONE}</span>
          </a>
        </div>
      )}

      {/* Hero Split Section */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-2xl p-5 sm:p-7 flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <img
                src={FOUNDATION_LOGO_PATH}
                alt="โลโก้มูลนิธิร่วมกุศลสมุทรปราการ"
                className="w-14 h-14 sm:w-16 sm:h-16 object-contain shrink-0"
                referrerPolicy="no-referrer"
              />
              <div>
                <p className="text-xs sm:text-sm font-medium text-[#1E3A8A]">
                  คลินิกบริการประชาชน · จังหวัดสมุทรปราการ
                </p>
                <p className="text-base sm:text-lg font-semibold text-slate-900">
                  {FOUNDATION_NAME}
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <h1
                className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 leading-snug"
                style={{ textWrap: 'balance' }}
              >
                {SYSTEM_TITLE}
              </h1>
              <p className="text-sm sm:text-base text-slate-600 leading-relaxed max-w-2xl">
                อำนวยความสะดวกให้ผู้รับบริการทุกช่วงวัย สามารถเลือกวันนัดหมาย จองคิวฝังเข็ม
                รับบัตรคิวดิจิทัล และติดตามสถานะคิวได้แบบเรียลไทม์โดยไม่จำเป็นต้องเข้าสู่ระบบ
              </p>
            </div>
          </div>

          <div className="pt-5 mt-5 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => onNavigate('booking')}
                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 min-h-[44px] text-sm sm:text-base font-semibold text-white bg-[#16A34A] hover:bg-[#15803D] rounded-xl transition-colors whitespace-nowrap shrink-0"
              >
                <span>จองคิวเข้ารับบริการ</span>
                <ArrowRight className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => onNavigate('status')}
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 min-h-[44px] text-sm sm:text-base font-medium text-[#1E3A8A] bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors whitespace-nowrap shrink-0"
              >
                <span>ตรวจสอบสถานะคิว</span>
              </button>
            </div>

            <a
              href={`tel:${FOUNDATION_PHONE.replace(/-/g, '')}`}
              className="inline-flex items-center gap-2 text-sm sm:text-base font-semibold text-slate-800 hover:text-[#1E3A8A] whitespace-nowrap shrink-0"
            >
              <Phone className="w-4 h-4 text-[#1E3A8A]" />
              <span className="tabular-nums">{FOUNDATION_PHONE}</span>
            </a>
          </div>
        </div>

        {/* Hero Visual Anchor */}
        <div className="lg:col-span-5 relative rounded-2xl overflow-hidden border border-slate-200 bg-slate-100 min-h-[240px]">
          <img
            src={CLINIC_HERO_IMAGE}
            alt="ห้องบริการฝังเข็ม มูลนิธิร่วมกุศลสมุทรปราการ"
            className="w-full h-full lg:h-full object-cover"
            referrerPolicy="no-referrer"
          />
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-950/90 via-slate-950/55 to-transparent p-5 text-white">
            <p className="text-xs font-medium text-blue-200">
              สถานะห้องตรวจวันนี้
            </p>
            <div className="mt-1 flex items-baseline justify-between gap-4">
              <p className="text-lg sm:text-xl font-bold tabular-nums">
                {callingQueueNo ? `กำลังเรียกคิว ${callingQueueNo}` : 'พร้อมเปิดให้บริการ'}
              </p>
              <p className="text-xs sm:text-sm text-slate-200 tabular-nums whitespace-nowrap">
                คิวรอรับบริการ {todayWaiting} จาก {todayTotal} คิว
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 4 Core Action Pathways Strip */}
      <section aria-label="บริการหลัก">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {actions.map((item) => (
            <button
              key={item.view}
              type="button"
              onClick={() => onNavigate(item.view)}
              className="group text-left bg-white hover:bg-slate-50 border border-slate-200 hover:border-[#1E3A8A]/40 rounded-2xl p-5 transition-colors flex flex-col justify-between min-h-[148px]"
            >
              <div className="space-y-2.5">
                <div className="w-10 h-10 rounded-xl bg-slate-100 text-[#1E3A8A] flex items-center justify-center group-hover:bg-[#1E3A8A] group-hover:text-white transition-colors">
                  {item.icon}
                </div>
                <h2 className="text-base sm:text-lg font-bold text-slate-900">{item.title}</h2>
                <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">{item.subtitle}</p>
              </div>
              <div className="pt-3 mt-3 border-t border-slate-100 flex items-center justify-between text-xs font-medium text-[#1E3A8A]">
                <span className="tabular-nums">{item.accentText}</span>
                <ArrowRight className="w-4 h-4 shrink-0 transition-transform group-hover:translate-x-0.5" />
              </div>
            </button>
          ))}
        </div>
      </section>

      {/* Service Hours & Preparation Section */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 space-y-6">
          <div className="space-y-1">
            <h2 className="text-xl sm:text-2xl font-bold text-slate-900">
              รอบเวลาเปิดรับบริการฝังเข็ม (วันละ 25 คิว)
            </h2>
            <p className="text-sm text-slate-600">
              แบ่งการเข้ารับบริการเป็น 5 ช่วงเวลา ช่วงเวลาละ 5 คิว เพื่อลดความแออัดและความปลอดภัยของผู้รับบริการ
            </p>
          </div>

          <div className="divide-y divide-slate-200 border border-slate-200 rounded-xl overflow-hidden">
            {TIME_SLOTS.map((slot, idx) => (
              <div
                key={slot.id}
                className="px-4 py-3.5 bg-white flex items-center justify-between gap-4 text-sm sm:text-base"
              >
                <div className="flex items-center gap-3">
                  <span className="font-mono-num text-xs font-semibold text-slate-500">
                    0{idx + 1}.
                  </span>
                  <span className="font-semibold text-slate-900 tabular-nums">{slot.label}</span>
                </div>
                <span className="text-slate-600 font-medium tabular-nums">
                  รอบละ {slot.defaultCapacity} คิว
                </span>
              </div>
            ))}
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
            <ShieldCheck className="w-5 h-5 text-amber-800 shrink-0 mt-0.5" />
            <div className="text-sm text-amber-900 space-y-1">
              <p className="font-semibold">คำแนะนำก่อนเข้ารับบริการ</p>
              <p>
                โปรดเดินทางมาถึงคลินิกก่อนเวลานัดหมาย 15 นาที เพื่อซักประวัติ วัดความดันโลหิต
                และเตรียมความพร้อมก่อนเข้ารับบริการฝังเข็ม
              </p>
            </div>
          </div>
        </div>

        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-2xl overflow-hidden flex flex-col">
          <div className="aspect-[4/3] bg-slate-100 overflow-hidden">
            <img
              src={CLINIC_DETAIL_IMAGE}
              alt="อุปกรณ์ฝังเข็มปลอดเชื้อและมาตรฐานความสะอาด"
              className="w-full h-full object-cover"
              referrerPolicy="no-referrer"
            />
          </div>
          <div className="p-6 space-y-3 flex-1 flex flex-col justify-between">
            <div className="space-y-2">
              <h3 className="text-lg font-bold text-slate-900">
                มาตรฐานความปลอดภัยและความเป็นส่วนตัว
              </h3>
              <p className="text-sm text-slate-600 leading-relaxed">
                ข้อมูลการนัดหมายและประวัติการรักษาถูกจัดเก็บบน Cloud Database ที่เข้ารหัส
                พร้อมระบบสำรองข้อมูลอัตโนมัติทุกวันเพื่อความต่อเนื่องในการดูแลผู้รับบริการ
              </p>
            </div>
            <div className="pt-3 text-xs text-slate-500 flex items-center gap-2">
              <span>เข็มปลอดเชื้อใช้ครั้งเดียวทิ้ง</span>
              <span aria-hidden="true">·</span>
              <span>ตรวจคัดกรองความดันทุกครั้ง</span>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};
