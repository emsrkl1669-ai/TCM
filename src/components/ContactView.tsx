import React from 'react';
import { Clock, MapPin, Phone, ShieldAlert } from 'lucide-react';
import {
  CLINIC_DETAIL_IMAGE,
  FOUNDATION_LOGO_PATH,
  FOUNDATION_NAME,
  FOUNDATION_PHONE,
} from '../lib/constants';

interface ContactViewProps {
  onBookNow: () => void;
}

export const ContactView: React.FC<ContactViewProps> = ({ onBookNow }) => {
  return (
    <div className="w-full space-y-6 pb-6">
      <div className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <img
            src={FOUNDATION_LOGO_PATH}
            alt="โลโก้มูลนิธิร่วมกุศลสมุทรปราการ"
            className="w-16 h-16 object-contain shrink-0"
            referrerPolicy="no-referrer"
          />
          <div className="space-y-1">
            <h1 className="text-2xl font-bold text-slate-900">ติดต่อเจ้าหน้าที่คลินิกฝังเข็ม</h1>
            <p className="text-sm text-slate-600">{FOUNDATION_NAME}</p>
          </div>
        </div>

        <a
          href={`tel:${FOUNDATION_PHONE.replace(/-/g, '')}`}
          className="inline-flex items-center justify-center gap-2 px-6 py-3 min-h-[48px] text-base font-semibold text-white bg-[#1E3A8A] hover:bg-[#172554] rounded-xl transition-colors whitespace-nowrap shrink-0"
        >
          <Phone className="w-5 h-5" />
          <span className="tabular-nums">โทร {FOUNDATION_PHONE}</span>
        </a>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-5">
          <h2 className="text-lg font-bold text-slate-900">ข้อมูลติดต่อและเวลาทำการ</h2>

          <div className="space-y-4 text-sm text-slate-700">
            <div className="flex items-start gap-3">
              <Phone className="w-5 h-5 text-[#1E3A8A] shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-slate-900">โทรศัพท์ประสานงาน</p>
                <p className="tabular-nums">{FOUNDATION_PHONE} (ในเวลาทำการ)</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <Clock className="w-5 h-5 text-[#1E3A8A] shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-slate-900">เวลาให้บริการฝังเข็ม</p>
                <p>09.00 - 11.30 น. (วันละ 5 รอบ · รวม 25 คิว/วัน)</p>
                <p className="text-xs text-slate-500 mt-0.5">
                  วันที่เปิดรับจองเป็นไปตามประกาศในปฏิทินจองคิวของเจ้าหน้าที่
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <MapPin className="w-5 h-5 text-[#1E3A8A] shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-slate-900">สถานที่เข้ารับบริการ</p>
                <p>{FOUNDATION_NAME} จังหวัดสมุทรปราการ</p>
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-200">
            <button
              type="button"
              onClick={onBookNow}
              className="w-full min-h-[46px] px-5 py-2.5 text-sm font-semibold text-white bg-[#16A34A] hover:bg-[#15803D] rounded-xl transition-colors"
            >
              จองคิวเข้ารับบริการออนไลน์
            </button>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden flex flex-col">
          <div className="aspect-[16/9] bg-slate-100">
            <img
              src={CLINIC_DETAIL_IMAGE}
              alt="การเตรียมความพร้อมเข้ารับบริการฝังเข็ม"
              className="w-full h-full object-cover"
              referrerPolicy="no-referrer"
            />
          </div>
          <div className="p-6 space-y-3">
            <div className="flex items-center gap-2 text-amber-800 font-semibold text-base">
              <ShieldAlert className="w-5 h-5 shrink-0" />
              <span>ข้อปฏิบัติสำหรับผู้เข้ารับบริการ</span>
            </div>
            <ul className="space-y-2 text-sm text-slate-700 list-disc list-inside">
              <li>มาถึงจุดคัดกรองก่อนเวลานัดหมาย 15 นาที เพื่อซักประวัติและวัดความดันโลหิต</li>
              <li>รับประทานอาหารมาก่อนเข้ารับบริการประมาณ 1 ชั่วโมง (ไม่ควรอดอาหารมาฝังเข็ม)</li>
              <li>สวมใส่เสื้อผ้าที่หลวมสบาย พับแขนและขากางเกงได้สะดวก</li>
              <li>นำบัตรคิวดิจิทัลหรือแจ้งเลขคิว/เบอร์โทรศัพท์แก่เจ้าหน้าที่หน้าห้องตรวจ</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};
