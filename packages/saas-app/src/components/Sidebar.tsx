import React from 'react';
import { LayoutGrid, Globe, Activity, CreditCard, Link2, Tag, Sparkles } from 'lucide-react';
import { ExtendedSite } from '../types';
import { UserButton, SignedIn, SignedOut, SignInButton } from '@clerk/clerk-react';
import { Link, useLocation } from 'react-router-dom';

interface SidebarProps {
  selectedSite: ExtendedSite | null;
  siteCount: number;
  jobCount: number;
  isOpen: boolean;
  onClose: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  selectedSite,
  siteCount,
  jobCount,
  isOpen,
  onClose,
}) => {
  const location = useLocation();
  const pathname = location.pathname;

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpen && (
        <div
          onClick={onClose}
          className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40 lg:hidden transition-opacity"
        />
      )}

      {/* Fixed Sticky Sidebar */}
      <aside
        className={`fixed top-0 bottom-0 left-0 z-40 w-60 bg-white border-r border-[#e4e4e7] flex flex-col p-4 transition-transform duration-200 ease-out lg:translate-x-0 lg:sticky lg:top-0 lg:h-screen lg:flex-none ${
          isOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full'
        }`}
      >
        {/* Brand */}
        <Link
          to="/"
          onClick={onClose}
          className="flex items-center gap-2.5 px-2 py-3 mb-2 cursor-pointer group select-none"
        >
          <span className="w-7 h-7 rounded-lg bg-[#171717] text-white flex items-center justify-center flex-none shadow-sm group-hover:bg-[#f03e2f] transition-colors">
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
              <path d="M13 2 4.5 13.5H11L9.5 22 19 10h-6.5L13 2Z" strokeLinejoin="round" />
            </svg>
          </span>
          <span className="font-semibold text-[15px] tracking-tight text-[#171717]">
            TurboPress <em className="italic font-normal text-[#71717a] not-italic">Engine</em>
          </span>
        </Link>

        {/* Current Site Quick Pill (If on Site Detail Page) */}
        {pathname.startsWith('/sites/') && selectedSite && (
          <Link
            to={`/sites/${selectedSite.id}`}
            onClick={onClose}
            className="flex items-center gap-2 px-2.5 py-1.5 mb-3 bg-[#fff1ef] border border-red-200 rounded-lg text-xs cursor-pointer"
          >
            <span className="w-2 h-2 rounded-full bg-[#f03e2f] animate-pulse" />
            <span className="font-mono font-medium text-[#171717] truncate">{selectedSite.domain}</span>
          </Link>
        )}

        {/* Navigation Groups */}
        <div className="flex-1 overflow-y-auto space-y-6 pt-2">
          {/* Monitor Group */}
          <div>
            <p className="font-mono text-[10px] uppercase tracking-wider text-[#71717a] px-2.5 mb-1.5 font-medium">
              Monitor
            </p>
            <nav className="space-y-0.5">
              <Link
                to="/"
                onClick={onClose}
                className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-[13.5px] font-medium text-left transition-colors ${
                  pathname === '/' || pathname === '/overview'
                    ? 'bg-[#f4f4f5] text-[#171717] font-semibold'
                    : 'text-[#3f3f46] hover:bg-[#f8f8f7] hover:text-[#171717]'
                }`}
              >
                <LayoutGrid className={`w-4 h-4 ${pathname === '/' || pathname === '/overview' ? 'text-[#f03e2f]' : 'text-[#71717a]'}`} />
                <span>Overview</span>
              </Link>

              <Link
                to="/sites"
                onClick={onClose}
                className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-[13.5px] font-medium text-left transition-colors ${
                  pathname.startsWith('/sites')
                    ? 'bg-[#f4f4f5] text-[#171717] font-semibold'
                    : 'text-[#3f3f46] hover:bg-[#f8f8f7] hover:text-[#171717]'
                }`}
              >
                <Globe className={`w-4 h-4 ${pathname.startsWith('/sites') ? 'text-[#f03e2f]' : 'text-[#71717a]'}`} />
                <span>Sites</span>
                <span className="ml-auto font-mono text-[11px] text-[#71717a]">{siteCount}</span>
              </Link>

              <Link
                to="/jobs"
                onClick={onClose}
                className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-[13.5px] font-medium text-left transition-colors ${
                  pathname === '/jobs'
                    ? 'bg-[#f4f4f5] text-[#171717] font-semibold'
                    : 'text-[#3f3f46] hover:bg-[#f8f8f7] hover:text-[#171717]'
                }`}
              >
                <Activity className={`w-4 h-4 ${pathname === '/jobs' ? 'text-[#f03e2f]' : 'text-[#71717a]'}`} />
                <span>Jobs</span>
                <span className="ml-auto font-mono text-[11px] text-[#71717a]">{jobCount}</span>
              </Link>
            </nav>
          </div>

          {/* Account & Growth Group */}
          <div>
            <p className="font-mono text-[10px] uppercase tracking-wider text-[#71717a] px-2.5 mb-1.5 font-medium">
              Account & Plans
            </p>
            <nav className="space-y-0.5">
              <Link
                to="/billing"
                onClick={onClose}
                className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-[13.5px] font-medium text-left transition-colors ${
                  pathname === '/billing'
                    ? 'bg-[#f4f4f5] text-[#171717] font-semibold'
                    : 'text-[#3f3f46] hover:bg-[#f8f8f7] hover:text-[#171717]'
                }`}
              >
                <CreditCard className={`w-4 h-4 ${pathname === '/billing' ? 'text-[#f03e2f]' : 'text-[#71717a]'}`} />
                <span>Billing & Usage</span>
              </Link>

              <Link
                to="/pricing"
                onClick={onClose}
                className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-[13.5px] font-medium text-left transition-colors ${
                  pathname === '/pricing'
                    ? 'bg-[#f4f4f5] text-[#171717] font-semibold'
                    : 'text-[#3f3f46] hover:bg-[#f8f8f7] hover:text-[#171717]'
                }`}
              >
                <Tag className={`w-4 h-4 ${pathname === '/pricing' ? 'text-[#f03e2f]' : 'text-[#71717a]'}`} />
                <span>Plans & Pricing</span>
                <span className="ml-auto font-mono text-[10px] uppercase px-1.5 py-0.2 bg-[#fff1ef] text-[#f03e2f] rounded font-bold">
                  Starter
                </span>
              </Link>

              <Link
                to="/connect"
                onClick={onClose}
                className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-[13.5px] font-medium text-left transition-colors ${
                  pathname === '/connect'
                    ? 'bg-[#f4f4f5] text-[#171717] font-semibold'
                    : 'text-[#3f3f46] hover:bg-[#f8f8f7] hover:text-[#171717]'
                }`}
              >
                <Link2 className={`w-4 h-4 ${pathname === '/connect' ? 'text-[#f03e2f]' : 'text-[#71717a]'}`} />
                <span>Connect Site</span>
              </Link>

              <Link
                to="/onboarding"
                onClick={onClose}
                className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-[13.5px] font-medium text-left transition-colors ${
                  pathname === '/onboarding'
                    ? 'bg-[#f4f4f5] text-[#171717] font-semibold'
                    : 'text-[#3f3f46] hover:bg-[#f8f8f7] hover:text-[#171717]'
                }`}
              >
                <Sparkles className={`w-4 h-4 ${pathname === '/onboarding' ? 'text-[#f03e2f]' : 'text-[#71717a]'}`} />
                <span>Onboarding Flow</span>
              </Link>
            </nav>
          </div>
        </div>

        {/* Sidebar Footer */}
        <div className="pt-3 border-t border-[#f1f1f2] space-y-2">
          {/* Operational Status Pill */}
          <div className="flex items-center gap-2 px-2.5 py-1.5 border border-[#e4e4e7] rounded-full bg-white text-[11.5px] text-[#3f3f46]">
            <span className="w-2 h-2 rounded-full bg-[#16a34a] shadow-[0_0_0_2px_rgba(22,163,74,0.15)] flex-none" />
            <span className="truncate">TurboPress Edge: Active</span>
          </div>

          {/* User Profile Card / Clerk Profile */}
          <div className="flex items-center gap-2.5 p-1.5 rounded-lg hover:bg-[#f8f8f7] transition-colors">
            <SignedIn>
              <UserButton afterSignOutUrl="/sign-in" />
              <div className="min-w-0 flex-1 leading-tight text-left">
                <p className="text-[12.5px] font-semibold text-[#171717] truncate">Account Settings</p>
                <p className="text-[11px] text-[#71717a] truncate">Starter plan · {siteCount} site(s)</p>
              </div>
            </SignedIn>
            <SignedOut>
              <div className="w-7 h-7 rounded-full bg-[#171717] text-white text-[11px] font-semibold flex items-center justify-center flex-none">
                TP
              </div>
              <div className="min-w-0 flex-1 leading-tight text-left">
                <p className="text-[12.5px] font-semibold text-[#171717] truncate">Account</p>
                <p className="text-[11px] text-[#71717a] truncate">Signed Out</p>
              </div>
              <SignInButton mode="modal">
                <button className="text-[11.5px] font-medium text-[#f03e2f] hover:underline flex-none">
                  Sign in
                </button>
              </SignInButton>
            </SignedOut>
          </div>
        </div>
      </aside>
    </>
  );
};
