'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useUser, useClerk } from '@clerk/nextjs';
import { LogOut, CreditCard, Shield, ChevronRight, User as UserIcon, ExternalLink, Sparkles } from 'lucide-react';
import Link from 'next/link';

interface CustomUserButtonProps {
  planName?: string;
  siteCount?: number;
  onOpenPortal?: () => void;
  compact?: boolean;
}

export const CustomUserButton: React.FC<CustomUserButtonProps> = ({
  planName = 'Starter Plan',
  siteCount = 1,
  onOpenPortal,
  compact = false,
}) => {
  const { user, isLoaded, isSignedIn } = useUser();
  const { signOut, openUserProfile } = useClerk();
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  if (!isLoaded) {
    return (
      <div className="flex items-center gap-2 p-1.5 rounded-lg animate-pulse">
        <div className="w-8 h-8 rounded-full bg-[#f1f1f2]" />
        {!compact && (
          <div className="space-y-1">
            <div className="h-3 w-20 bg-[#f1f1f2] rounded" />
            <div className="h-2.5 w-28 bg-[#f1f1f2] rounded" />
          </div>
        )}
      </div>
    );
  }

  if (!isSignedIn || !user) {
    return null;
  }

  const displayName = user.fullName || user.primaryEmailAddress?.emailAddress?.split('@')[0] || 'User';
  const email = user.primaryEmailAddress?.emailAddress || '';
  const avatarUrl = user.imageUrl;
  const initials = (displayName[0] || 'U').toUpperCase();

  const handleSignOut = async () => {
    setIsOpen(false);
    await signOut();
    window.location.href = '/sign-in';
  };

  return (
    <div className="relative" ref={menuRef}>
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className={`w-full flex items-center gap-2.5 p-1.5 rounded-xl hover:bg-[#f8f8f7] border border-transparent hover:border-[#e4e4e7] transition-all text-left group ${
          isOpen ? 'bg-[#f8f8f7] border-[#e4e4e7]' : ''
        }`}
        aria-expanded={isOpen}
        aria-haspopup="true"
      >
        {/* Avatar */}
        <div className="relative flex-none">
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt={displayName}
              className="w-8 h-8 rounded-full object-cover border border-[#e4e4e7] shadow-sm"
            />
          ) : (
            <div className="w-8 h-8 rounded-full bg-[#171717] text-white text-xs font-bold grid place-items-center shadow-sm">
              {initials}
            </div>
          )}
          <span className="absolute bottom-0 right-0 w-2 h-2 rounded-full bg-[#16a34a] border-2 border-white" />
        </div>

        {/* Text details (hidden in compact topbar mode) */}
        {!compact && (
          <div className="min-w-0 flex-1 leading-tight">
            <div className="flex items-center gap-1.5">
              <p className="text-[12.5px] font-semibold text-[#171717] truncate">{displayName}</p>
            </div>
            <p className="text-[11px] text-[#71717a] truncate font-mono">
              {planName} · {siteCount} site{siteCount !== 1 ? 's' : ''}
            </p>
          </div>
        )}
      </button>

      {/* Popover Dropdown Menu */}
      {isOpen && (
        <div className="absolute bottom-full mb-2 left-0 w-64 bg-white border border-[#e4e4e7] rounded-2xl shadow-xl p-2 z-50 animate-fade-in text-[#171717]">
          {/* User Header */}
          <div className="px-3 py-2.5 border-b border-[#f1f1f2] mb-1">
            <div className="flex items-center gap-2.5">
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt={displayName}
                  className="w-9 h-9 rounded-full object-cover border border-[#e4e4e7]"
                />
              ) : (
                <div className="w-9 h-9 rounded-full bg-[#171717] text-white text-xs font-bold grid place-items-center">
                  {initials}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-[#171717] truncate">{displayName}</p>
                <p className="text-[11px] text-[#71717a] truncate font-mono">{email}</p>
              </div>
            </div>

            <div className="mt-2.5 flex items-center justify-between pt-2 border-t border-[#f8f8f7]">
              <span className="text-[10.5px] font-mono uppercase tracking-wider text-[#71717a]">
                Active Tier
              </span>
              <span className="text-[11px] font-semibold px-2 py-0.5 bg-[#fff1ef] text-[#f03e2f] rounded-full border border-red-100 flex items-center gap-1">
                <Sparkles className="w-2.5 h-2.5 fill-current" />
                {planName}
              </span>
            </div>
          </div>

          {/* Action Links */}
          <div className="space-y-0.5">
            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                openUserProfile();
              }}
              className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium text-[#3f3f46] hover:bg-[#f8f8f7] hover:text-[#171717] transition-colors"
            >
              <div className="flex items-center gap-2">
                <UserIcon className="w-3.5 h-3.5 text-[#71717a]" />
                <span>Account Profile</span>
              </div>
              <ChevronRight className="w-3 h-3 text-[#a1a1aa]" />
            </button>

            <Link
              href="/billing"
              onClick={() => setIsOpen(false)}
              className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium text-[#3f3f46] hover:bg-[#f8f8f7] hover:text-[#171717] transition-colors"
            >
              <div className="flex items-center gap-2">
                <CreditCard className="w-3.5 h-3.5 text-[#71717a]" />
                <span>Subscription & Billing</span>
              </div>
              <ChevronRight className="w-3 h-3 text-[#a1a1aa]" />
            </Link>

            {onOpenPortal && (
              <button
                type="button"
                onClick={() => {
                  setIsOpen(false);
                  onOpenPortal();
                }}
                className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium text-[#3f3f46] hover:bg-[#f8f8f7] hover:text-[#171717] transition-colors"
              >
                <div className="flex items-center gap-2">
                  <ExternalLink className="w-3.5 h-3.5 text-[#71717a]" />
                  <span>Polar Customer Portal</span>
                </div>
                <ChevronRight className="w-3 h-3 text-[#a1a1aa]" />
              </button>
            )}

            <div className="pt-1 mt-1 border-t border-[#f1f1f2]">
              <button
                type="button"
                onClick={handleSignOut}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium text-red-600 hover:bg-[#fef2f2] transition-colors"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Sign out</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
