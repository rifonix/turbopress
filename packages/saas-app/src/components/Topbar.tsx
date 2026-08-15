'use client';

import React from 'react';
import { Menu, Search, Bell, Plus, LogIn } from 'lucide-react';
import { SignedIn, SignedOut } from '@clerk/nextjs';
import Link from 'next/link';
import { CustomUserButton } from './auth/CustomUserButton';

interface TopbarProps {
  onOpenCmdk: () => void;
  onOpenMobileMenu: () => void;
  onConnectClick: () => void;
  onNotificationClick: () => void;
  onOpenAuthModal?: () => void;
}

export const Topbar: React.FC<TopbarProps> = ({
  onOpenCmdk,
  onOpenMobileMenu,
  onConnectClick,
  onNotificationClick,
  onOpenAuthModal,
}) => {
  return (
    <header className="sticky top-0 z-30 flex items-center gap-3 px-4 sm:px-8 py-2.5 bg-[#f8f8f7]/90 backdrop-blur-md border-b border-[#e4e4e7]">
      {/* Mobile Hamburger Toggle */}
      <button
        type="button"
        onClick={onOpenMobileMenu}
        aria-label="Toggle menu"
        className="w-8 h-8 grid place-items-center border border-[#e4e4e7] rounded-md bg-white text-[#3f3f46] hover:bg-[#f4f4f5] lg:hidden"
      >
        <Menu className="w-4 h-4" />
      </button>

      {/* Global Command Palette Trigger */}
      <button
        type="button"
        onClick={onOpenCmdk}
        className="flex items-center gap-2 min-w-[200px] sm:min-w-[260px] px-3 py-1.5 border border-[#e4e4e7] rounded-md bg-white text-[#71717a] text-[13px] hover:border-[#a1a1aa] transition-colors"
      >
        <Search className="w-3.5 h-3.5 flex-none" />
        <span className="truncate">Search sites, jobs, actions…</span>
        <kbd className="ml-auto font-mono text-[10.5px] border border-[#e4e4e7] rounded px-1.5 py-0.5 bg-[#f8f8f7] text-[#71717a]">
          ⌘K
        </kbd>
      </button>

      {/* Topbar Right Actions */}
      <div className="ml-auto flex items-center gap-2.5">
        <button
          type="button"
          onClick={onNotificationClick}
          aria-label="Notifications"
          className="relative w-8 h-8 grid place-items-center border border-[#e4e4e7] rounded-md bg-white text-[#3f3f46] hover:bg-[#f4f4f5] transition-colors"
        >
          <Bell className="w-3.5 h-3.5" />
          <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-[#f03e2f] border border-white" />
        </button>

        <button
          type="button"
          onClick={onConnectClick}
          className="btn btn-secondary text-xs sm:text-[13px] hidden sm:inline-flex"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Connect site</span>
        </button>

        {/* User Auth in Topbar */}
        <SignedIn>
          <div className="lg:hidden">
            <CustomUserButton compact={true} />
          </div>
        </SignedIn>

        <SignedOut>
          {onOpenAuthModal ? (
            <button
              type="button"
              onClick={onOpenAuthModal}
              className="btn btn-primary text-xs sm:text-[13px] py-1.5 px-3 flex items-center gap-1.5"
            >
              <LogIn className="w-3.5 h-3.5" />
              <span>Sign in</span>
            </button>
          ) : (
            <Link
              href="/sign-in"
              className="btn btn-primary text-xs sm:text-[13px] py-1.5 px-3 flex items-center gap-1.5"
            >
              <LogIn className="w-3.5 h-3.5" />
              <span>Sign in</span>
            </Link>
          )}
        </SignedOut>
      </div>
    </header>
  );
};
