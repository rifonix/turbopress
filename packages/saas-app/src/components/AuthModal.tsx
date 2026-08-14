import React from 'react';
import { X, Shield } from 'lucide-react';
import { CustomAuth } from './CustomAuth';

interface AuthModalProps {
  isOpen: boolean;
  initialMode?: 'signin' | 'signup';
  onClose: () => void;
  onSuccess?: () => void;
  onToast: (msg: string, type?: 'success' | 'info' | 'error') => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  initialMode = 'signin',
  onClose,
  onSuccess,
  onToast,
}) => {
  if (!isOpen) return null;

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md bg-white rounded-2xl border border-[#e4e4e7] shadow-2xl p-6 sm:p-8 relative overflow-hidden"
      >
        {/* Close button */}
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute top-4 right-4 w-7 h-7 rounded-full grid place-items-center text-[#71717a] hover:text-[#171717] hover:bg-[#f4f4f5] transition-colors z-10"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Custom Auth Form */}
        <div className="pt-2">
          <CustomAuth
            initialMode={initialMode}
            onSuccess={() => {
              if (onSuccess) onSuccess();
              onClose();
            }}
            onToast={onToast}
          />
        </div>

        {/* Footer Security Badge */}
        <div className="flex items-center justify-center gap-1.5 mt-4 pt-3 border-t border-[#f1f1f2] text-[11px] text-[#71717a]">
          <Shield className="w-3.5 h-3.5 text-[#16a34a]" />
          <span>Secured by Clerk & Cloudflare Edge</span>
        </div>
      </div>
    </div>
  );
};
