'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@clerk/nextjs';
import { useRouter, usePathname } from 'next/navigation';
import { DashboardProvider, useDashboard } from '@/context/DashboardContext';
import { Sidebar } from '@/components/Sidebar';
import { Topbar } from '@/components/Topbar';
import { CommandPalette } from '@/components/CommandPalette';
import { ToastContainer } from '@/components/ToastContainer';
import { AuthModal } from '@/components/auth/AuthModal';

function DashboardShell({ children }: { children: React.ReactNode }) {
  const { isLoaded, isSignedIn } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  const {
    sites,
    jobs,
    billingData,
    isLoading,
    isVerifyingPurchase,
    addToast,
    handleRunOptimization,
    handleOpenPortal,
  } = useDashboard();

  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isCmdkOpen, setIsCmdkOpen] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);

  // Determine current site from route if on /sites/[siteId]
  const currentSiteId = pathname?.startsWith('/sites/') ? pathname.split('/')[2] : null;
  const selectedSite = currentSiteId
    ? sites.find((s) => s.id === currentSiteId || s.domain === currentSiteId) || null
    : null;

  // Global Keyboard Listener for ⌘K / Ctrl+K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsCmdkOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Plan Gating: unsubscribed users land on /onboarding (which walks them through
  // purchase → connect). They may also visit /pricing & /billing freely.
  useEffect(() => {
    if (!isLoading && isSignedIn && billingData && !billingData.hasActivePlan) {
      if (pathname !== '/onboarding' && pathname !== '/pricing' && pathname !== '/billing') {
        router.replace('/onboarding');
      }
    }
  }, [isLoading, isSignedIn, billingData, pathname, router]);

  // Auth Loading Screen
  if (!isLoaded) {
    return (
      <div className="min-h-screen bg-[#f8f8f7] flex items-center justify-center">
        <div className="flex items-center gap-3 bg-white px-5 py-3 rounded-2xl border border-[#e4e4e7] shadow-sm">
          <div className="w-4 h-4 rounded-full border-2 border-[#171717] border-t-transparent animate-spin" />
          <span className="text-xs font-mono text-[#71717a]">Loading TurboPress Engine…</span>
        </div>
      </div>
    );
  }

  // Purchase Verification Overlay: returning from Polar checkout, waiting for webhook
  if (isVerifyingPurchase) {
    return (
      <div className="min-h-screen bg-[#f8f8f7] flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white px-8 py-10 rounded-3xl border border-[#e4e4e7] shadow-sm text-center">
          <div className="w-12 h-12 rounded-2xl bg-[#171717] flex items-center justify-center mx-auto mb-5">
            <div className="w-5 h-5 rounded-full border-2 border-white border-t-transparent animate-spin" />
          </div>
          <h2 className="text-lg font-semibold text-[#171717] mb-2">Confirming your purchase…</h2>
          <p className="text-sm text-[#71717a] leading-relaxed mb-6">
            We received your payment and are activating your TurboPress plan. This usually takes
            just a few seconds.
          </p>
          <div className="h-1.5 w-full bg-black/5 rounded-full overflow-hidden">
            <div className="h-full w-1/3 bg-[#171717] rounded-full animate-[loadingbar_1.4s_ease-in-out_infinite]" />
          </div>
        </div>
      </div>
    );
  }

  // Not Signed In -> Redirect to custom sign-in page
  if (!isSignedIn) {
    router.replace('/sign-in');
    return (
      <div className="min-h-screen bg-[#f8f8f7] flex items-center justify-center">
        <div className="flex items-center gap-3 bg-white px-5 py-3 rounded-2xl border border-[#e4e4e7] shadow-sm">
          <div className="w-4 h-4 rounded-full border-2 border-[#171717] border-t-transparent animate-spin" />
          <span className="text-xs font-mono text-[#71717a]">Redirecting to Sign In…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-[#f8f8f7]">
      {/* Sticky Sidebar Navigation */}
      <Sidebar
        selectedSite={selectedSite}
        siteCount={sites.length}
        jobCount={jobs.length}
        isOpen={isMobileMenuOpen}
        onClose={() => setIsMobileMenuOpen(false)}
        onOpenAuthModal={() => setIsAuthModalOpen(true)}
        planName={billingData?.hasActivePlan ? billingData?.plan?.name || 'Active Plan' : 'No active plan'}
        onOpenPortal={handleOpenPortal}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar
          onOpenCmdk={() => setIsCmdkOpen(true)}
          onOpenMobileMenu={() => setIsMobileMenuOpen(true)}
          onConnectClick={() => router.push('/connect')}
          onNotificationClick={() => addToast('No unread fleet notifications', 'info')}
          onOpenAuthModal={() => setIsAuthModalOpen(true)}
        />

        <main className="flex-1 p-4 sm:p-8 max-w-6xl w-full mx-auto pb-16">
          {isLoading ? (
            <div className="space-y-4 py-8">
              <div className="h-8 bg-black/5 rounded-lg w-48 animate-pulse" />
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="h-28 bg-white border border-[#e4e4e7] rounded-xl animate-pulse" />
                ))}
              </div>
              <div className="h-64 bg-white border border-[#e4e4e7] rounded-2xl animate-pulse" />
            </div>
          ) : (
            children
          )}
        </main>
      </div>

      {/* Global Command Palette (⌘K) */}
      <CommandPalette
        isOpen={isCmdkOpen}
        onClose={() => setIsCmdkOpen(false)}
        sites={sites}
        onNavigate={(view) => {
          if (view === 'overview') router.push('/');
          else if (view === 'sites') router.push('/sites');
          else if (view === 'jobs') router.push('/jobs');
          else if (view === 'billing') router.push('/billing');
          else if (view === 'pricing') router.push('/pricing');
          else if (view === 'connect') router.push('/connect');
          else if (view === 'onboarding') router.push('/onboarding');
        }}
        onSelectSite={(site) => {
          router.push(`/sites/${site.id}`);
        }}
        onTriggerPurgeAll={() => {
          addToast('Fleet-wide edge cache purge broadcasted', 'success');
        }}
        onDispatchJob={(domain) => handleRunOptimization(domain)}
      />

      {/* Global In-Place Auth Modal */}
      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        onSuccess={() => {
          setIsAuthModalOpen(false);
          addToast('Authenticated successfully', 'success');
        }}
      />
    </div>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <DashboardProvider>
      <DashboardShell>{children}</DashboardShell>
    </DashboardProvider>
  );
}
