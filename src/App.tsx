/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useState } from 'react';
import { AdminPortal } from './components/AdminPortal';
import { BookingView } from './components/BookingView';
import { ContactView } from './components/ContactView';
import { DigitalTicketView } from './components/DigitalTicketView';
import { HistoryView } from './components/HistoryView';
import { LandingView } from './components/LandingView';
import { Navbar, type AppView } from './components/Navbar';
import { QueueStatusView } from './components/QueueStatusView';
import {
  FOUNDATION_LOGO_PATH,
  FOUNDATION_NAME,
  FOUNDATION_PHONE,
  getBangkokDateStr,
} from './lib/constants';
import {
  subscribeClinicConfig,
  subscribeScheduleDates,
} from './lib/firestoreSync';
import type { TicketData } from './lib/ticketExport';

interface ClinicConfigState {
  bookingPaused: boolean;
  pauseReason: string;
  dates: Array<{ dateStr: string; isOpen: boolean; maxPerSlot: number; note?: string | null }>;
}

export default function App() {
  const [activeView, setActiveView] = useState<AppView>('landing');
  const [config, setConfig] = useState<ClinicConfigState>({
    bookingPaused: false,
    pauseReason: '',
    dates: [],
  });
  const [callingQueueNo, setCallingQueueNo] = useState<string | null>(null);
  const [todayTotal, setTodayTotal] = useState<number>(0);
  const [todayWaiting, setTodayWaiting] = useState<number>(0);
  const [statusSearchQuery, setStatusSearchQuery] = useState<string>('');
  const [currentTicket, setCurrentTicket] = useState<TicketData | null>(() => {
    try {
      const saved = sessionStorage.getItem('rk_last_ticket');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const loadClinicSummary = useCallback(async () => {
    try {
      const today = getBangkokDateStr(0);
      const [cfgRes, liveRes] = await Promise.all([
        fetch('/api/clinic/config'),
        fetch(`/api/queue/live?date=${encodeURIComponent(today)}`),
      ]);
      if (cfgRes.ok) {
        const cfg = await cfgRes.json();
        setConfig({
          bookingPaused: Boolean(cfg.bookingPaused),
          pauseReason: cfg.pauseReason || '',
          dates: cfg.dates || [],
        });
      }
      if (liveRes.ok) {
        const live = await liveRes.json();
        setCallingQueueNo(live.callingQueue ? live.callingQueue.queueNo : null);
        setTodayTotal(live.stats?.total ?? 0);
        setTodayWaiting(live.stats?.waiting ?? 0);
      }
    } catch {
      // Silently ignore background summary refresh errors
    }
  }, []);

  useEffect(() => {
    loadClinicSummary();
    const unsubConfig = subscribeClinicConfig((fsCfg) => {
      setConfig((prev) => ({
        ...prev,
        bookingPaused: fsCfg.bookingPaused,
        pauseReason: fsCfg.pauseReason,
      }));
    });
    const unsubDates = subscribeScheduleDates((fsDates) => {
      setConfig((prev) => {
        const merged = new Map<
          string,
          { dateStr: string; isOpen: boolean; maxPerSlot: number; note?: string | null }
        >();
        for (const d of prev.dates) merged.set(d.dateStr, d);
        for (const d of fsDates) merged.set(d.dateStr, d);
        return {
          ...prev,
          dates: Array.from(merged.values()).sort((a, b) => a.dateStr.localeCompare(b.dateStr)),
        };
      });
    });
    return () => {
      unsubConfig();
      unsubDates();
    };
  }, [loadClinicSummary]);

  const handleNavigate = (view: AppView) => {
    setActiveView(view);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleBookingSuccess = (ticket: TicketData) => {
    setCurrentTicket(ticket);
    try {
      sessionStorage.setItem('rk_last_ticket', JSON.stringify(ticket));
    } catch {
      // Ignore storage quota errors
    }
    loadClinicSummary();
    handleNavigate('ticket');
  };

  const handleTrackQueue = (queueNo: string) => {
    setStatusSearchQuery(queueNo);
    handleNavigate('status');
  };

  const handleOpenTicket = (ticket: TicketData) => {
    setCurrentTicket(ticket);
    handleNavigate('ticket');
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#F8FAFC] text-slate-900">
      <div className="print:hidden">
        <Navbar activeView={activeView} onNavigate={handleNavigate} />
      </div>

      <main className="flex-1 w-full px-4 sm:px-6 lg:px-8 pt-4 sm:pt-5 pb-16 md:pb-6 print:p-0 print:max-w-none">
        {activeView === 'landing' && (
          <LandingView
            callingQueueNo={callingQueueNo}
            todayTotal={todayTotal}
            todayWaiting={todayWaiting}
            bookingPaused={config.bookingPaused}
            pauseReason={config.pauseReason}
            onNavigate={handleNavigate}
          />
        )}

        {activeView === 'booking' && (
          <BookingView
            bookingPaused={config.bookingPaused}
            pauseReason={config.pauseReason}
            scheduleDates={config.dates}
            onBookingSuccess={handleBookingSuccess}
          />
        )}

        {activeView === 'ticket' && (
          <DigitalTicketView
            ticket={currentTicket}
            onBookAnother={() => handleNavigate('booking')}
            onTrackQueue={handleTrackQueue}
          />
        )}

        {activeView === 'status' && (
          <QueueStatusView
            initialQuery={statusSearchQuery}
            onOpenTicket={handleOpenTicket}
          />
        )}

        {activeView === 'history' && <HistoryView />}

        {activeView === 'contact' && (
          <ContactView onBookNow={() => handleNavigate('booking')} />
        )}

        {activeView === 'admin' && (
          <AdminPortal onConfigChanged={loadClinicSummary} />
        )}
      </main>

      <footer className="hidden md:block print:hidden bg-white border-t border-slate-200">
        <div className="w-full px-4 sm:px-6 lg:px-8 py-4 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-slate-600">
          <div className="flex items-center gap-3">
            <img
              src={FOUNDATION_LOGO_PATH}
              alt="โลโก้มูลนิธิร่วมกุศลสมุทรปราการ"
              className="w-8 h-8 object-contain shrink-0"
              referrerPolicy="no-referrer"
            />
            <span className="font-semibold text-slate-800">{FOUNDATION_NAME}</span>
            <span aria-hidden="true">·</span>
            <span>ระบบนัดหมายเข้ารับบริการฝังเข็ม</span>
          </div>

          <div className="flex items-center gap-6">
            <a
              href={`tel:${FOUNDATION_PHONE.replace(/-/g, '')}`}
              className="font-semibold text-[#1E3A8A] hover:underline tabular-nums"
            >
              โทร. {FOUNDATION_PHONE}
            </a>
            <button
              type="button"
              onClick={() => handleNavigate('booking')}
              className="hover:text-slate-900"
            >
              จองคิวออนไลน์
            </button>
            <button
              type="button"
              onClick={() => handleNavigate('status')}
              className="hover:text-slate-900"
            >
              ตรวจสอบสถานะคิว
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
