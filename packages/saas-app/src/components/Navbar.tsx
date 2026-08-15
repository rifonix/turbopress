'use client';

import React from 'react';
import { Zap, Globe, BarChart3, CreditCard, ExternalLink } from 'lucide-react';
import { SignedIn, SignedOut, SignInButton, UserButton } from '@clerk/nextjs';

interface NavbarProps {
  activeTab: 'overview' | 'sites' | 'billing';
  setActiveTab: (tab: 'overview' | 'sites' | 'billing') => void;
  siteCount: number;
  maxSites: number;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  setActiveTab,
  siteCount,
  maxSites,
}) => {
  return (
    <header className="sticky top-0 z-40 bg-white border-b border-slate-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Logo & Brand */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-sky-600 to-cyan-500 flex items-center justify-center text-white shadow-md shadow-sky-500/20">
              <Zap className="w-5 h-5 fill-current" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-xl tracking-tight text-slate-900">Turbopress</span>
                <span className="text-[10px] font-bold uppercase tracking-wider bg-sky-50 text-sky-700 border border-sky-200 px-2 py-0.5 rounded-full">
                  Edge Engine
                </span>
              </div>
              <p className="text-xs text-slate-500 hidden sm:block">Zero-DNS WordPress Optimization</p>
            </div>
          </div>

          {/* Navigation Tabs */}
          <nav className="flex space-x-1 sm:space-x-2">
            <button
              onClick={() => setActiveTab('overview')}
              className={`flex items-center gap-2 px-3 sm:px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                activeTab === 'overview'
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <BarChart3 className="w-4 h-4" />
              <span>Overview</span>
            </button>

            <button
              onClick={() => setActiveTab('sites')}
              className={`flex items-center gap-2 px-3 sm:px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                activeTab === 'sites'
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <Globe className="w-4 h-4" />
              <span>Sites</span>
              <span className="ml-1 text-xs bg-slate-200 text-slate-800 px-1.5 py-0.5 rounded-full font-bold">
                {siteCount}/{maxSites}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('billing')}
              className={`flex items-center gap-2 px-3 sm:px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                activeTab === 'billing'
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <CreditCard className="w-4 h-4" />
              <span>Plan & Billing</span>
            </button>
          </nav>

          {/* User Profile & Documentation Link with Clerk Auth */}
          <div className="flex items-center gap-3">
            <a
              href="https://github.com"
              target="_blank"
              rel="noreferrer"
              className="text-xs font-semibold text-slate-500 hover:text-slate-800 hidden md:flex items-center gap-1"
            >
              <span>Docs</span>
              <ExternalLink className="w-3 h-3" />
            </a>

            <SignedIn>
              <UserButton />
            </SignedIn>
            <SignedOut>
              <SignInButton mode="modal">
                <button className="px-3 py-1.5 bg-slate-900 text-white text-xs font-bold rounded-lg hover:bg-slate-800">
                  Sign In
                </button>
              </SignInButton>
            </SignedOut>
          </div>
        </div>
      </div>
    </header>
  );
};
