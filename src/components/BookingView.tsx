import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Loader2,
  UserCheck,
  XCircle,
} from 'lucide-react';
import {
  COMMON_DISEASES,
  FOUNDATION_PHONE,
  THAI_DAYS_SHORT,
  THAI_MONTHS_FULL,
  formatThaiDateFull,
  getBangkokDateStr,
} from '../lib/constants';
import { safeParseJson } from '../lib/http';
import type { TicketData } from '../lib/ticketExport';

interface ScheduleDate {
  dateStr: string;
  isOpen: boolean;
  maxPerSlot: number;
  note?: string | null;
}

interface SlotInfo {
  id: string;
  label: string;
  maxPerSlot: number;
  bookedCount: number;
  remaining: number;
  isFull: boolean;
}

interface BookingViewProps {
  bookingPaused: boolean;
  pauseReason: string;
  scheduleDates: ScheduleDate[];
  onBookingSuccess: (ticket: TicketData) => void;
}

export const BookingView: React.FC<BookingViewProps> = ({
  bookingPaused,
  pauseReason,
  scheduleDates,
  onBookingSuccess,
}) => {
  const todayStr = getBangkokDateStr(0);

  const openDatesMap = useMemo(() => {
    const map = new Map<string, ScheduleDate>();
    for (const d of scheduleDates) {
      map.set(d.dateStr, d);
    }
    return map;
  }, [scheduleDates]);

  const firstOpenDate = useMemo(() => {
    const found = scheduleDates.find((d) => d.isOpen && d.dateStr >= todayStr);
    return found ? found.dateStr : '';
  }, [scheduleDates, todayStr]);

  const [selectedDate, setSelectedDate] = useState<string>(firstOpenDate);
  const [calendarMonth, setCalendarMonth] = useState<{ year: number; month: number }>(() => {
    const ref = firstOpenDate || todayStr;
    const [y, m] = ref.split('-').map(Number);
    return { year: y, month: m - 1 };
  });

  const [slots, setSlots] = useState<SlotInfo[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [slotsError, setSlotsError] = useState('');
  const [selectedSlot, setSelectedSlot] = useState<string>('');

  const [fullName, setFullName] = useState('');
  const [age, setAge] = useState('');
  const [disease, setDisease] = useState('ไม่มีโรคประจำตัว');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  useEffect(() => {
    if (!selectedDate && firstOpenDate) {
      setSelectedDate(firstOpenDate);
    } else if (selectedDate && !openDatesMap.get(selectedDate)?.isOpen) {
      setSelectedDate(firstOpenDate);
    }
  }, [firstOpenDate, openDatesMap, selectedDate]);

  useEffect(() => {
    if (!selectedDate) {
      setSlots([]);
      setSelectedSlot('');
      return;
    }
    let active = true;
    setLoadingSlots(true);
    setSlotsError('');
    fetch(`/api/slots?date=${encodeURIComponent(selectedDate)}`)
      .then(async (res) => {
        const data = await safeParseJson<{ slots?: SlotInfo[] }>(res);
        if (!res.ok) throw new Error(data.error || 'ไม่สามารถโหลดช่วงเวลาได้');
        return data;
      })
      .then((data) => {
        if (!active) return;
        const list: SlotInfo[] = data.slots || [];
        setSlots(list);
        const stillAvailable = list.find((s) => s.label === selectedSlot && !s.isFull);
        if (!stillAvailable) {
          const firstAvail = list.find((s) => !s.isFull);
          setSelectedSlot(firstAvail ? firstAvail.label : '');
        }
      })
      .catch((err: unknown) => {
        if (!active) return;
        setSlotsError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการโหลดเวลาว่าง');
      })
      .finally(() => {
        if (active) setLoadingSlots(false);
      });

    return () => {
      active = false;
    };
  }, [selectedDate]);

  const calendarDays = useMemo(() => {
    const firstDay = new Date(calendarMonth.year, calendarMonth.month, 1);
    const startWeekday = firstDay.getDay();
    const daysInMonth = new Date(calendarMonth.year, calendarMonth.month + 1, 0).getDate();
    const cells: Array<{ day: number | null; dateStr: string }> = [];

    for (let i = 0; i < startWeekday; i++) {
      cells.push({ day: null, dateStr: `empty-${i}` });
    }
    for (let d = 1; d <= daysInMonth; d++) {
      const mStr = String(calendarMonth.month + 1).padStart(2, '0');
      const dStr = String(d).padStart(2, '0');
      cells.push({
        day: d,
        dateStr: `${calendarMonth.year}-${mStr}-${dStr}`,
      });
    }
    return cells;
  }, [calendarMonth]);

  const changeMonth = (delta: number) => {
    setCalendarMonth((prev) => {
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError('');

    if (bookingPaused) {
      setSubmitError('ขณะนี้ระบบปิดรับจองชั่วคราว กรุณาติดต่อเจ้าหน้าที่');
      return;
    }
    if (!selectedDate || !openDatesMap.get(selectedDate)?.isOpen) {
      setSubmitError('กรุณาเลือกวันนัดหมายที่แอดมินเปิดให้บริการ');
      return;
    }
    if (!selectedSlot) {
      setSubmitError('กรุณาเลือกช่วงเวลานัดหมายที่ยังมีคิวว่าง');
      return;
    }
    if (fullName.trim().length < 2) {
      setSubmitError('กรุณากรอกชื่อ-นามสกุลผู้เข้ารับบริการ');
      return;
    }
    const parsedAge = Number(age);
    if (!Number.isInteger(parsedAge) || parsedAge < 1 || parsedAge > 120) {
      setSubmitError('กรุณากรอกอายุให้ถูกต้อง (1 - 120 ปี)');
      return;
    }
    const digits = phoneNumber.replace(/\D/g, '');
    if (digits.length < 9 || digits.length > 10) {
      setSubmitError('กรุณากรอกเบอร์โทรศัพท์ 9-10 หลักให้ถูกต้อง');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: fullName.trim(),
          age: parsedAge,
          disease: disease.trim() || 'ไม่มีโรคประจำตัว',
          phoneNumber: digits,
          bookingDate: selectedDate,
          bookingTime: selectedSlot,
        }),
      });
      const data = await safeParseJson<TicketData>(res);
      if (!res.ok) {
        throw new Error(data.error || 'ไม่สามารถบันทึกการจองได้');
      }

      if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
        new Notification(`จองคิวสำเร็จ: ${data.queueNo}`, {
          body: `นัดฝังเข็มวันที่ ${formatThaiDateFull(data.bookingDate)} เวลา ${data.bookingTime} โปรดมาถึงก่อนเวลานัด 15 นาที`,
        });
      }

      onBookingSuccess(data);
    } catch (err: unknown) {
      setSubmitError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการบันทึกการจอง');
    } finally {
      setSubmitting(false);
    }
  };

  const hasAnyOpenDate = Boolean(firstOpenDate);

  return (
    <div className="w-full space-y-4 pb-6">
      <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900">
            จองคิวเข้ารับบริการฝังเข็ม
          </h1>
          <p className="text-xs sm:text-sm text-slate-600">
            เลือกวันที่แอดมินเปิดให้บริการ ช่วงเวลาว่าง และกรอกข้อมูลผู้รับบริการ (ไม่ต้องเข้าสู่ระบบ)
          </p>
        </div>
        <p className="text-xs sm:text-sm text-slate-600 tabular-nums shrink-0">
          เปิดรับวันละ 25 คิว · โทร {FOUNDATION_PHONE}
        </p>
      </div>

      {bookingPaused && (
        <div
          role="alert"
          className="bg-red-50 border border-red-200 rounded-2xl p-4 flex items-start gap-3 text-red-900"
        >
          <AlertCircle className="w-5 h-5 text-red-700 shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <p className="font-bold text-sm">ขณะนี้ระบบปิดรับจองคิวชั่วคราว</p>
            <p className="text-xs text-red-700">
              {pauseReason || 'เจ้าหน้าที่กำลังปรับปรุงตารางบริการ กรุณาติดต่อ ' + FOUNDATION_PHONE}
            </p>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Left Column: Date Calendar & Time Slots */}
        <div className="lg:col-span-7 space-y-4">
          {/* Step 1: Calendar (Admin-Defined Open Dates Only) */}
          <section className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-[#1E3A8A]" />
                <h2 className="text-base font-bold text-slate-900">1. เลือกวันนัดหมาย</h2>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => changeMonth(-1)}
                  aria-label="เดือนก่อนหน้า"
                  className="w-9 h-9 flex items-center justify-center rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-700"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-sm font-semibold text-slate-900 min-w-[128px] text-center tabular-nums">
                  {THAI_MONTHS_FULL[calendarMonth.month]} {calendarMonth.year + 543}
                </span>
                <button
                  type="button"
                  onClick={() => changeMonth(1)}
                  aria-label="เดือนถัดไป"
                  className="w-9 h-9 flex items-center justify-center rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-700"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            {!hasAnyOpenDate && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs sm:text-sm text-amber-900 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                <span>
                  ยังไม่มีวันเปิดรับจองคิวในขณะนี้ (แอดมินเป็นผู้กำหนดวันเปิดจองคิวเท่านั้น กรุณาติดต่อ {FOUNDATION_PHONE})
                </span>
              </div>
            )}

            <div className="grid grid-cols-7 gap-1 text-center">
              {THAI_DAYS_SHORT.map((day) => (
                <div key={day} className="py-1 text-[11px] font-semibold text-slate-500">
                  {day}
                </div>
              ))}

              {calendarDays.map((cell) => {
                if (cell.day === null) {
                  return <div key={cell.dateStr} className="h-9 sm:h-10" />;
                }
                const info = openDatesMap.get(cell.dateStr);
                const isOpen = Boolean(info?.isOpen) && cell.dateStr >= todayStr;
                const isSelected = selectedDate === cell.dateStr;

                return (
                  <button
                    key={cell.dateStr}
                    type="button"
                    disabled={!isOpen}
                    onClick={() => setSelectedDate(cell.dateStr)}
                    className={`h-9 sm:h-10 rounded-lg flex flex-col items-center justify-center text-xs sm:text-sm transition-colors tabular-nums ${
                      isSelected
                        ? 'bg-[#1E3A8A] text-white font-bold'
                        : isOpen
                          ? 'bg-emerald-50 text-emerald-950 border border-emerald-200 hover:bg-emerald-100 font-semibold'
                          : 'bg-slate-50 text-slate-300 cursor-not-allowed'
                    }`}
                  >
                    <span className="leading-tight">{cell.day}</span>
                    {isOpen && !isSelected && (
                      <span className="text-[9px] leading-none text-emerald-700">เปิด</span>
                    )}
                  </button>
                );
              })}
            </div>

            <div className="pt-1 flex flex-wrap items-center gap-4 text-[11px] text-slate-600">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded bg-emerald-100 border border-emerald-300 inline-block" />
                วันที่แอดมินเปิดให้จอง
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded bg-slate-100 border border-slate-200 inline-block" />
                ไม่เปิดรับจอง
              </span>
            </div>
          </section>

          {/* Step 2: Time Slots */}
          <section className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-[#1E3A8A]" />
                <h2 className="text-base font-bold text-slate-900">2. เลือกช่วงเวลา</h2>
              </div>
              <span className="text-xs sm:text-sm font-medium text-[#1E3A8A] tabular-nums">
                {selectedDate ? formatThaiDateFull(selectedDate) : 'กรุณาเลือกวันเปิดจอง'}
              </span>
            </div>

            {!selectedDate ? (
              <div className="py-5 text-center text-xs sm:text-sm text-slate-500 border border-dashed border-slate-200 rounded-xl">
                กรุณาเลือกวันที่แอดมินเปิดให้บริการจากปฏิทินด้านบนก่อนเลือกช่วงเวลา
              </div>
            ) : loadingSlots ? (
              <div className="py-5 flex items-center justify-center gap-2 text-slate-500 text-sm">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>กำลังตรวจสอบจำนวนคิวว่าง...</span>
              </div>
            ) : slotsError ? (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700">
                {slotsError}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {slots.map((slot) => {
                  const isSelected = selectedSlot === slot.label && !slot.isFull;
                  return (
                    <button
                      key={slot.id}
                      type="button"
                      disabled={slot.isFull || bookingPaused}
                      onClick={() => setSelectedSlot(slot.label)}
                      className={`min-h-[44px] px-3.5 py-2 rounded-xl border text-left flex items-center justify-between gap-2 transition-colors ${
                        slot.isFull
                          ? 'bg-red-50/60 border-red-200 text-slate-500 cursor-not-allowed'
                          : isSelected
                            ? 'bg-[#1E3A8A] border-[#1E3A8A] text-white'
                            : 'bg-white border-slate-200 hover:border-[#1E3A8A]/50 hover:bg-slate-50 text-slate-900'
                      }`}
                    >
                      <span className="text-sm font-bold tabular-nums">{slot.label}</span>

                      {slot.isFull ? (
                        <span className="inline-flex items-center gap-1 text-xs font-bold text-red-700 whitespace-nowrap shrink-0">
                          <XCircle className="w-3.5 h-3.5 shrink-0" />
                          <span>คิวเต็มแล้ว</span>
                        </span>
                      ) : (
                        <span
                          className={`inline-flex items-center gap-1 text-xs font-semibold tabular-nums whitespace-nowrap shrink-0 ${
                            isSelected ? 'text-blue-100' : 'text-emerald-700'
                          }`}
                        >
                          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                          <span>ว่าง {slot.remaining}/{slot.maxPerSlot}</span>
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </section>
        </div>

        {/* Right Column: Patient Information Form */}
        <section className="lg:col-span-5 bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 space-y-3.5">
          <div className="flex items-center gap-2">
            <UserCheck className="w-4 h-4 text-[#1E3A8A]" />
            <h2 className="text-base font-bold text-slate-900">3. ข้อมูลผู้เข้ารับบริการ</h2>
          </div>

          <div className="space-y-3">
            <div>
              <label htmlFor="fullName" className="block text-xs sm:text-sm font-semibold text-slate-800 mb-1">
                ชื่อ-นามสกุล <span className="text-red-600">*</span>
              </label>
              <input
                id="fullName"
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="กรอกชื่อและนามสกุล"
                className="w-full min-h-[42px] px-3.5 py-2 text-sm bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1E3A8A]"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="age" className="block text-xs sm:text-sm font-semibold text-slate-800 mb-1">
                  อายุ (ปี) <span className="text-red-600">*</span>
                </label>
                <input
                  id="age"
                  type="number"
                  min={1}
                  max={120}
                  required
                  value={age}
                  onChange={(e) => setAge(e.target.value)}
                  placeholder="อายุ"
                  className="w-full min-h-[42px] px-3.5 py-2 text-sm tabular-nums bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1E3A8A]"
                />
              </div>

              <div>
                <label htmlFor="phoneNumber" className="block text-xs sm:text-sm font-semibold text-slate-800 mb-1">
                  เบอร์โทรศัพท์ <span className="text-red-600">*</span>
                </label>
                <input
                  id="phoneNumber"
                  type="tel"
                  required
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  placeholder="08XXXXXXXX"
                  className="w-full min-h-[42px] px-3.5 py-2 text-sm tabular-nums bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1E3A8A]"
                />
              </div>
            </div>

            <div>
              <label htmlFor="disease" className="block text-xs sm:text-sm font-semibold text-slate-800 mb-1">
                โรคประจำตัว / อาการเบื้องต้น
              </label>
              <input
                id="disease"
                type="text"
                value={disease}
                onChange={(e) => setDisease(e.target.value)}
                placeholder="ระบุโรคประจำตัว หรือเลือกด้านล่าง"
                className="w-full min-h-[42px] px-3.5 py-2 text-sm bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1E3A8A]"
              />
              <div className="mt-2 flex flex-wrap gap-1.5">
                {COMMON_DISEASES.map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setDisease(item)}
                    className={`px-2 py-1 text-[11px] font-medium rounded-lg border transition-colors ${
                      disease === item
                        ? 'bg-[#1E3A8A] text-white border-[#1E3A8A]'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm space-y-1">
            <p className="font-semibold text-slate-900">สรุปนัดหมายที่เลือก</p>
            <p className="text-slate-700 tabular-nums">
              วันที่:{' '}
              <span className="font-semibold">
                {selectedDate ? formatThaiDateFull(selectedDate) : 'ยังไม่ได้เลือกวัน'}
              </span>
            </p>
            <p className="text-slate-700 tabular-nums">
              ช่วงเวลา:{' '}
              <span className="font-semibold">
                {selectedSlot || 'กรุณาเลือกช่วงเวลาว่าง'}
              </span>
            </p>
          </div>

          {submitError && (
            <div
              role="alert"
              className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs sm:text-sm text-red-800 flex items-start gap-2"
            >
              <AlertCircle className="w-4 h-4 text-red-700 shrink-0 mt-0.5" />
              <span>{submitError}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={submitting || bookingPaused || !selectedDate || !selectedSlot}
            className="w-full min-h-[46px] px-6 py-2.5 text-sm sm:text-base font-bold text-white bg-[#16A34A] hover:bg-[#15803D] disabled:bg-slate-300 disabled:cursor-not-allowed rounded-xl transition-colors flex items-center justify-center gap-2"
          >
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>กำลังบันทึกและออกบัตรคิว...</span>
              </>
            ) : (
              <span>บันทึกการจอง</span>
            )}
          </button>
        </section>
      </form>
    </div>
  );
};
