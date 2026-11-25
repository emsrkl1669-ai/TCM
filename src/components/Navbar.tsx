import React from 'react';
import { CalendarPlus, Clock, FileText, Home, Phone, ShieldCheck } from 'lucide-react';
import { FOUNDATION_LOGO_PATH, FOUNDATION_NAME } from '../lib/constants';

export type AppView = 'landing' | 'booking' | 'ticket' | 'status' | 'history' | 'contact' | 'admin';

interface NavbarProps {
  activeView: AppView;
  onNavigate: (view: AppView) => void;
}

export const Navbar: React.FC<NavbarProps> = ({ activeView, onNavigate }) => {
  const navItems: Array<{ id: AppView; label: string; icon: React.ReactNode }> = [
    { id: 'landing', label: 'หน้าแรก', icon: <Home className="w-5 h-5" /> },
    { id: 'booking', label: 'จองคิว', icon: <CalendarPlus className="w-5 h-5" /> },
    { id: 'status', label: 'สถานะคิว', icon: <Clock className="w-5 h-5" /> },
    { id: 'history', label: 'ประวัติ', icon: <FileText className="w-5 h-5" /> },
    { id: 'contact', label: 'ติดต่อ', icon: <Phone className="w-5 h-5" /> },
  ];

  return (
    <>
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-8">
          {/* Zone 1: Single-line Official Logo + Brand Wordmark */}
          <button
            type="button"
            onClick={() => onNavigate('landing')}
            className="flex items-center gap-3 text-left whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1E3A8A] rounded-lg"
          >
            <img
              src={FOUNDATION_LOGO_PATH}
              alt="โลโก้มูลนิธิร่วมกุศลสมุทรปราการ"
              className="w-10 h-10 object-contain shrink-0"
              referrerPolicy="no-referrer"
            />
            <span className="text-base sm:text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0">
              {FOUNDATION_NAME}
            </span>
          </button>

          {/* Zone 2: Concise single-line navigation links */}
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600">
            {navItems.map((item) => {
              const isActive = activeView === item.id || (item.id === 'booking' && activeView === 'ticket');
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onNavigate(item.id)}
                  className={`py-2 whitespace-nowrap shrink-0 transition-colors border-b-2 ${
                    isActive
                      ? 'text-[#1E3A8A] border-[#1E3A8A] font-semibold'
                      : 'text-slate-600 border-transparent hover:text-slate-900 hover:border-slate-300'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </nav>

          {/* Zone 3: Single Primary Action */}
          <div className="flex items-center shrink-0">
            {activeView === 'admin' ? (
              <button
                type="button"
                onClick={() => onNavigate('landing')}
                className="px-4 py-2 min-h-[40px] text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0"
              >
                กลับหน้าผู้รับบริการ
              </button>
            ) : (
              <button
                type="button"
                onClick={() => onNavigate('admin')}
                className="inline-flex items-center gap-2 px-4 py-2 min-h-[40px] text-sm font-medium text-white bg-[#1E3A8A] hover:bg-[#172554] rounded-lg transition-colors whitespace-nowrap shrink-0"
              >
                <ShieldCheck className="w-4 h-4 shrink-0" />
                <span>สำหรับเจ้าหน้าที่</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Mobile Bottom Navigation Bar (Natural Thumb Zone, compact <= 60px) */}
      <nav
        aria-label="เมนูหลักมือถือ"
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200"
      >
        <div className="grid grid-cols-5 h-15">
          {navItems.map((item) => {
            const isActive = activeView === item.id || (item.id === 'booking' && activeView === 'ticket');
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onNavigate(item.id)}
                className={`flex flex-col items-center justify-center min-h-[44px] transition-colors ${
                  isActive ? 'text-[#1E3A8A] font-semibold' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                {item.icon}
                <span className="text-[11px] mt-0.5 whitespace-nowrap">{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </>
  );
};
