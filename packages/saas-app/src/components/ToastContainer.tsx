'use client';

import React from 'react';
import { AlertCircle } from 'lucide-react';
import { ToastMessage } from '../types';

interface ToastContainerProps {
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}

export const ToastContainer: React.FC<ToastContainerProps> = ({ toasts, onDismiss }) => {
  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2 pointer-events-none">
      {toasts.map((t) => (
        <div
          key={t.id}
          onClick={() => onDismiss(t.id)}
          className="pointer-events-auto flex items-center gap-2.5 px-4 py-2.5 bg-[#171717] text-white rounded-lg text-[13px] font-medium shadow-2xl border border-white/10 animate-fade-in cursor-pointer"
        >
          {t.type === 'error' ? (
            <AlertCircle className="w-4 h-4 text-[#f87171] flex-none" />
          ) : (
            <svg className="w-3.5 h-3.5 text-[#4ade80] flex-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
              <path d="M20 6 9 17l-5-5" />
            </svg>
          )}
          <span>{t.text}</span>
        </div>
      ))}
    </div>
  );
};
