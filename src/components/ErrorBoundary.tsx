import React from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { FOUNDATION_NAME, FOUNDATION_PHONE } from '../lib/constants';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    let friendly = 'ระบบไม่สามารถประมวลผลคำขอได้ชั่วคราว กรุณารีเฟรชหน้าเว็บแล้วลองใหม่อีกครั้ง';
    if (error?.message) {
      try {
        const parsed = JSON.parse(error.message) as { error?: string };
        if (parsed?.error && typeof parsed.error === 'string') {
          if (parsed.error.toLowerCase().includes('permission')) {
            friendly = 'ไม่มีสิทธิ์เข้าถึงข้อมูลในส่วนนี้ หรือเซสชันผู้ดูแลระบบหมดอายุ';
          }
        }
      } catch {
        // Non-JSON error; keep safe generic Thai fallback
      }
    }
    return { hasError: true, message: friendly };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('Application ErrorBoundary caught:', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-white border border-slate-200 rounded-2xl p-6 space-y-4 text-center">
            <div className="w-12 h-12 rounded-full bg-red-50 text-red-700 flex items-center justify-center mx-auto">
              <AlertCircle className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h1 className="text-lg font-bold text-slate-900">{FOUNDATION_NAME}</h1>
              <p className="text-sm text-slate-600">{this.state.message}</p>
              <p className="text-xs text-slate-500">ติดต่อสอบถาม โทร. {FOUNDATION_PHONE}</p>
            </div>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="w-full min-h-[44px] px-4 py-2.5 bg-[#1E3A8A] hover:bg-[#172554] text-white text-sm font-semibold rounded-xl inline-flex items-center justify-center gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              <span>โหลดหน้าใหม่</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
