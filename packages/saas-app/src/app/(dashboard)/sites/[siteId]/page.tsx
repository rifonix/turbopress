'use client';

import React from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useDashboard } from '@/context/DashboardContext';
import { SiteDetailPage as SiteDetailView } from '@/components/SiteDetailPage';
import { ArrowLeft, Globe } from 'lucide-react';
import Link from 'next/link';

export default function SiteDetailPage() {
  const router = useRouter();
  const params = useParams<{ siteId: string }>();
  const siteId = params?.siteId;
  const ctx = useDashboard();

  const site = ctx.sites.find((s) => s.id === siteId || s.domain === siteId);

  if (!site) {
    return (
      <div className="bg-white border border-[#e4e4e7] rounded-2xl p-12 text-center max-w-lg mx-auto shadow-sm space-y-4 animate-fade-in">
        <div className="w-12 h-12 rounded-xl bg-[#fff1ef] text-[#f03e2f] grid place-items-center mx-auto">
          <Globe className="w-6 h-6" />
        </div>
        <h2 className="text-lg font-semibold text-[#171717]">Site Not Found</h2>
        <p className="text-xs text-[#71717a]">
          The site with ID <code className="font-mono">{siteId}</code> could not be found in your connected fleet.
        </p>
        <Link href="/sites" className="btn btn-primary text-xs inline-flex items-center gap-1.5">
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to all sites</span>
        </Link>
      </div>
    );
  }

  return (
    <SiteDetailView
      site={site}
      jobs={ctx.jobs}
      onBack={() => router.push('/sites')}
      onUpdatePreset={ctx.handleUpdatePreset}
      onUpdateConfig={ctx.handleUpdateConfig}
      onPurgeCache={ctx.handlePurgeSite}
      onRunOptimization={ctx.handleRunOptimization}
      onToast={ctx.addToast}
    />
  );
}
