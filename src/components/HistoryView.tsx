import React, { useState } from 'react';
import { FileText, Loader2, Search, Stethoscope } from 'lucide-react';
import { formatThaiDateNumeric } from '../lib/constants';

interface HistoryRecord {
  id: number;
  visitDate: string;
  queueNo: string;
  patientName: string;
  phoneMasked: string;
  providerName: string;
  diagnosis: string;
  note: string;
}

export const HistoryView: React.FC = () => {
  const [query, setQuery] = useState('');
  const [records, setRecords] = useState<HistoryRecord[]>([]);
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const runSearch = async (searchText: string) => {
    const clean = searchText.trim();
    if (clean.length < 3) {
      setError('กรุณากรอกเบอร์โทรศัพท์ เลขคิว หรือชื่อ-นามสกุลอย่างน้อย 3 ตัวอักษร');
      return;
    }
    setLoading(true);
    setError('');
    setSearched(true);
    try {
      const res = await fetch(`/api/history?q=${encodeURIComponent(clean)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'ไม่สามารถค้นหาประวัติได้');
      setRecords(data.records || []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการค้นหา');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    runSearch(query);
  };

  return (
    <div className="w-full space-y-5 pb-6">
      <div className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 space-y-4">
        <div className="space-y-1">
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">
            ประวัติการรับบริการฝังเข็ม
          </h1>
          <p className="text-sm sm:text-base text-slate-600">
            ค้นหาประวัติย้อนหลัง วันที่เข้ารับบริการ แพทย์ผู้ให้บริการ อาการ และหมายเหตุการรักษาได้ทันที
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3 pt-2">
          <div className="relative flex-1">
            <Search className="w-5 h-5 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="กรอกเบอร์โทรศัพท์ (เช่น 0812345678) เลขคิว (A001) หรือชื่อ-นามสกุล"
              className="w-full min-h-[48px] pl-11 pr-4 py-2.5 text-base bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1E3A8A]"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="min-h-[46px] px-6 py-2.5 bg-[#1E3A8A] hover:bg-[#172554] text-white text-sm font-semibold rounded-xl whitespace-nowrap shrink-0 flex items-center justify-center gap-2"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            <span>ค้นหาประวัติ</span>
          </button>
        </form>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
          {error}
        </div>
      )}

      {!searched ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center space-y-3">
          <FileText className="w-10 h-10 text-slate-400 mx-auto" />
          <p className="text-base font-semibold text-slate-800">
            กรุณากรอกเบอร์โทรศัพท์หรือเลขคิวเพื่อค้นหาประวัติการรักษา
          </p>
          <p className="text-sm text-slate-500">
            เพื่อคุ้มครองข้อมูลส่วนบุคคล ระบบจะแสดงเฉพาะรายการที่ตรงกับคำค้นหาของท่านเท่านั้น
          </p>
        </div>
      ) : loading ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-10 flex items-center justify-center gap-2 text-slate-500 text-sm">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span>กำลังค้นหาประวัติการรับบริการ...</span>
        </div>
      ) : records.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center space-y-2">
          <p className="text-base font-semibold text-slate-800">ไม่พบประวัติการรับบริการ</p>
          <p className="text-sm text-slate-500">
            ไม่พบข้อมูลสำหรับ “{query}” กรุณาตรวจสอบเบอร์โทรศัพท์หรือเลขคิวอีกครั้ง
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {records.map((rec) => (
            <article
              key={rec.id}
              className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-4 pb-3 border-b border-slate-200">
                <div className="flex items-center gap-3">
                  <span className="font-mono-num text-lg font-bold text-[#1E3A8A]">
                    {rec.queueNo}
                  </span>
                  <span aria-hidden="true" className="text-slate-300">/</span>
                  <span className="font-semibold text-slate-900">{rec.patientName}</span>
                  <span aria-hidden="true" className="text-slate-300">·</span>
                  <span className="text-sm text-slate-500 tabular-nums">{rec.phoneMasked}</span>
                </div>
                <span className="text-sm font-medium text-slate-600 tabular-nums">
                  วันที่รับบริการ {formatThaiDateNumeric(rec.visitDate)}
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                <div>
                  <p className="text-slate-500 mb-1 flex items-center gap-1.5">
                    <Stethoscope className="w-4 h-4 text-[#1E3A8A]" />
                    <span>แพทย์ / ผู้ให้บริการ</span>
                  </p>
                  <p className="font-semibold text-slate-900">{rec.providerName}</p>
                </div>
                <div>
                  <p className="text-slate-500 mb-1">อาการ / การวินิจฉัย</p>
                  <p className="font-medium text-slate-900">{rec.diagnosis}</p>
                </div>
                <div>
                  <p className="text-slate-500 mb-1">หมายเหตุและคำแนะนำ</p>
                  <p className="text-slate-700">{rec.note}</p>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
};
