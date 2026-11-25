import React, { useCallback, useEffect, useState } from 'react';
import {
  CheckCircle2,
  Clock,
  Loader2,
  RefreshCw,
  Search,
  Ticket,
  Volume2,
  XCircle,
} from 'lucide-react';
import {
  QUEUE_STATUS_LABELS,
  formatThaiDateFull,
  getBangkokDateStr,
  type QueueStatus,
} from '../lib/constants';
import type { TicketData } from '../lib/ticketExport';

interface LiveQueueResponse {
  dateStr: string;
  callingQueue: {
    queueNo: string;
    bookingTime: string;
    queueType: string;
  } | null;
  stats: {
    total: number;
    completed: number;
    waiting: number;
    cancelled: number;
    special: number;
  };
  publicFeed: Array<{
    queueNo: string;
    queueType: string;
    bookingTime: string;
    status: QueueStatus;
    maskedName: string;
  }>;
  matchedTicket: (TicketData & {
    status: QueueStatus;
    queuesAhead: number;
    rawPhone: string;
  }) | null;
}

interface QueueStatusViewProps {
  initialQuery?: string;
  onOpenTicket: (ticket: TicketData) => void;
}

export const QueueStatusView: React.FC<QueueStatusViewProps> = ({
  initialQuery = '',
  onOpenTicket,
}) => {
  const [queryInput, setQueryInput] = useState(initialQuery);
  const [activeQuery, setActiveQuery] = useState(initialQuery);
  const [data, setData] = useState<LiveQueueResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [lastUpdated, setLastUpdated] = useState<string>('');

  const today = getBangkokDateStr(0);

  const fetchLive = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      setError('');
      try {
        const params = new URLSearchParams({ date: today });
        if (activeQuery.trim()) params.set('query', activeQuery.trim());
        const res = await fetch(`/api/queue/live?${params.toString()}`);
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'ไม่สามารถโหลดสถานะคิวได้');
        setData(json);
        setLastUpdated(
          new Date().toLocaleTimeString('th-TH', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
          }),
        );
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการโหลดสถานะคิว');
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [activeQuery, today],
  );

  useEffect(() => {
    fetchLive(false);
    const timer = setInterval(() => {
      fetchLive(true);
    }, 5000);
    return () => clearInterval(timer);
  }, [fetchLive]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setActiveQuery(queryInput.trim());
  };

  const renderStatusLabel = (status: QueueStatus) => {
    if (status === 'calling') {
      return (
        <span className="inline-flex items-center gap-1.5 font-bold text-[#1E3A8A]">
          <Volume2 className="w-4 h-4 shrink-0" />
          <span>{QUEUE_STATUS_LABELS[status]}</span>
        </span>
      );
    }
    if (status === 'completed') {
      return (
        <span className="inline-flex items-center gap-1.5 font-semibold text-emerald-700">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{QUEUE_STATUS_LABELS[status]}</span>
        </span>
      );
    }
    if (status === 'cancelled') {
      return (
        <span className="inline-flex items-center gap-1.5 font-semibold text-red-700">
          <XCircle className="w-4 h-4 shrink-0" />
          <span>{QUEUE_STATUS_LABELS[status]}</span>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 font-medium text-amber-800">
        <Clock className="w-4 h-4 shrink-0" />
        <span>{QUEUE_STATUS_LABELS[status]}</span>
      </span>
    );
  };

  return (
    <div className="w-full space-y-5 pb-6">
      <div className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">
            ตรวจสอบสถานะคิวแบบ Real-Time
          </h1>
          <p className="text-sm text-slate-600 tabular-nums">
            ประจำวันที่ {formatThaiDateFull(today)} · อัปเดตอัตโนมัติทุก 5 วินาที
            {lastUpdated ? ` (ล่าสุด ${lastUpdated} น.)` : ''}
          </p>
        </div>

        <button
          type="button"
          onClick={() => fetchLive(false)}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 min-h-[44px] bg-slate-100 hover:bg-slate-200 text-slate-800 text-sm font-semibold rounded-xl whitespace-nowrap shrink-0"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          <span>รีเฟรช</span>
        </button>
      </div>

      {/* Calling Queue Focal Anchor + Search Box */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        <section className="lg:col-span-5 bg-[#1E3A8A] text-white rounded-2xl p-6 sm:p-8 flex flex-col justify-between">
          <div className="space-y-2">
            <p className="text-sm font-medium text-blue-100">สถานะหน้าห้องตรวจปัจจุบัน</p>
            <h2 className="text-xl font-bold">กำลังเรียกคิว</h2>
          </div>

          <div className="py-6">
            <p className="text-5xl sm:text-6xl font-bold font-mono-num tracking-tight">
              {data?.callingQueue ? data.callingQueue.queueNo : 'รอเรียก'}
            </p>
            {data?.callingQueue && (
              <p className="mt-2 text-sm text-blue-100 tabular-nums">
                รอบเวลา {data.callingQueue.bookingTime}
              </p>
            )}
          </div>

          <div className="pt-4 border-t border-white/15 grid grid-cols-3 gap-4 text-sm tabular-nums">
            <div>
              <p className="text-blue-200 text-xs">คิวทั้งหมด</p>
              <p className="text-xl font-bold">{data?.stats.total ?? 0}</p>
            </div>
            <div>
              <p className="text-blue-200 text-xs">รับบริการแล้ว</p>
              <p className="text-xl font-bold">{data?.stats.completed ?? 0}</p>
            </div>
            <div>
              <p className="text-blue-200 text-xs">รอรับบริการ</p>
              <p className="text-xl font-bold">{data?.stats.waiting ?? 0}</p>
            </div>
          </div>
        </section>

        <section className="lg:col-span-7 bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 flex flex-col justify-between space-y-6">
          <div className="space-y-2">
            <h2 className="text-lg font-bold text-slate-900">ค้นหาคิวของท่าน</h2>
            <p className="text-sm text-slate-600">
              กรอกเลขคิว (เช่น A006, S001) หรือเบอร์โทรศัพท์ที่ใช้จอง เพื่อตรวจสอบจำนวนคิวที่รออยู่
            </p>
          </div>

          <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="w-5 h-5 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={queryInput}
                onChange={(e) => setQueryInput(e.target.value)}
                placeholder="กรอกเลขคิว เช่น A006 หรือเบอร์โทรศัพท์"
                className="w-full min-h-[48px] pl-11 pr-4 py-2.5 text-base bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1E3A8A]"
              />
            </div>
            <button
              type="submit"
              className="min-h-[48px] px-6 py-2.5 bg-[#1E3A8A] hover:bg-[#172554] text-white text-sm font-semibold rounded-xl whitespace-nowrap shrink-0"
            >
              ตรวจสอบคิว
            </button>
          </form>

          {activeQuery && !loading && (
            data?.matchedTicket ? (
              <div className="p-5 bg-slate-50 border border-slate-200 rounded-xl space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <p className="text-xs text-slate-500">คิวของท่าน</p>
                    <p className="text-3xl font-bold font-mono-num text-[#1E3A8A]">
                      {data.matchedTicket.queueNo}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-slate-500">สถานะ</p>
                    <div className="mt-0.5 text-base">
                      {renderStatusLabel(data.matchedTicket.status)}
                    </div>
                  </div>
                </div>

                {data.matchedTicket.status === 'waiting' && (
                  <div className="p-3.5 bg-white border border-slate-200 rounded-lg flex items-center justify-between">
                    <span className="text-sm text-slate-700">จำนวนคิวก่อนหน้า</span>
                    <span className="text-lg font-bold text-[#1E3A8A] tabular-nums">
                      เหลืออีก {data.matchedTicket.queuesAhead} คิว
                    </span>
                  </div>
                )}

                <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-700">
                  <span>
                    ผู้รับบริการ: <strong>{data.matchedTicket.fullName}</strong> · เวลา{' '}
                    <span className="tabular-nums">{data.matchedTicket.bookingTime}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      onOpenTicket({
                        ...data.matchedTicket!,
                        phoneNumber: data.matchedTicket!.rawPhone,
                      })
                    }
                    className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#1E3A8A] hover:underline"
                  >
                    <Ticket className="w-4 h-4" />
                    <span>เปิดบัตรคิวดิจิทัล</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-900">
                ไม่พบข้อมูลคิวสำหรับ “{activeQuery}” กรุณาตรวจสอบเลขคิวหรือเบอร์โทรศัพท์อีกครั้ง
              </div>
            )
          )}
        </section>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Today's Public Queue Table */}
      <section className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900">ตารางลำดับคิววันนี้</h2>
          <span className="text-xs text-slate-500">แสดงเฉพาะข้อมูลที่ไม่ระบุตัวตนเพื่อความเป็นส่วนตัว</span>
        </div>

        {loading && !data ? (
          <div className="p-10 flex items-center justify-center gap-2 text-slate-500 text-sm">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span>กำลังโหลดรายการคิว...</span>
          </div>
        ) : data && data.publicFeed.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                <tr>
                  <th className="px-6 py-3 font-semibold">เลขคิว</th>
                  <th className="px-6 py-3 font-semibold">ช่วงเวลานัดหมาย</th>
                  <th className="px-6 py-3 font-semibold">ประเภท</th>
                  <th className="px-6 py-3 font-semibold">สถานะ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {data.publicFeed.map((row) => (
                  <tr
                    key={row.queueNo}
                    className={row.status === 'calling' ? 'bg-blue-50/70' : 'hover:bg-slate-50'}
                  >
                    <td className="px-6 py-3.5 font-mono-num font-bold text-slate-900">
                      {row.queueNo}
                    </td>
                    <td className="px-6 py-3.5 text-slate-700 tabular-nums">
                      {row.bookingTime}
                    </td>
                    <td className="px-6 py-3.5 text-slate-600">
                      {row.queueType === 'special' ? 'คิวพิเศษ' : 'คิวปกติ'}
                    </td>
                    <td className="px-6 py-3.5">{renderStatusLabel(row.status)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-10 text-center text-sm text-slate-500">
            ยังไม่มีรายการจองคิวสำหรับวันนี้
          </div>
        )}
      </section>
    </div>
  );
};
