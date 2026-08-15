'use client';

import React, { useState } from 'react';
import { Play, RotateCw, Terminal } from 'lucide-react';
import { OptimizationJobItem } from '../types';

interface JobsTabProps {
  jobs: OptimizationJobItem[];
  onDispatchNewJob: (url: string, viewport: 'mobile' | 'desktop') => void;
  onRerunJob: (jobId: string) => void;
  onToast: (msg: string) => void;
}

export const JobsTab: React.FC<JobsTabProps> = ({
  jobs,
  onDispatchNewJob,
  onRerunJob,
  onToast,
}) => {
  const [filter, setFilter] = useState<'all' | 'completed' | 'processing' | 'failed'>('all');
  const [isDispatchModalOpen, setIsDispatchModalOpen] = useState(false);
  const [dispatchUrl, setDispatchUrl] = useState('');
  const [dispatchViewport, setDispatchViewport] = useState<'mobile' | 'desktop'>('mobile');

  const filteredJobs = jobs.filter((j) => {
    if (filter === 'all') return true;
    if (filter === 'completed') return j.status === 'completed';
    if (filter === 'processing') return j.status === 'processing' || j.status === 'queued';
    if (filter === 'failed') return j.status === 'failed';
    return true;
  });

  const handleDispatch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!dispatchUrl) return;
    onDispatchNewJob(dispatchUrl, dispatchViewport);
    setIsDispatchModalOpen(false);
    onToast(`Optimization job queued for ${dispatchUrl} (${dispatchViewport})`);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[#171717]">
            Optimization Jobs
          </h1>
          <p className="text-[13.5px] text-[#71717a] mt-0.5">
            Cloudflare Browser Rendering (Puppeteer) Critical CSS & LCP Extraction Queue
          </p>
        </div>

        <button
          onClick={() => setIsDispatchModalOpen(true)}
          className="btn btn-primary text-xs sm:text-[13px] self-start sm:self-auto"
        >
          <Play className="w-3.5 h-3.5 fill-current" />
          <span>Dispatch New Run</span>
        </button>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2 border-b border-[#e4e4e7] pb-1">
        {(['all', 'completed', 'processing', 'failed'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setFilter(tab)}
            className={`px-3 py-1.5 rounded-md text-xs font-medium capitalize transition-colors ${
              filter === tab
                ? 'bg-[#171717] text-white'
                : 'text-[#71717a] hover:text-[#171717] hover:bg-[#f4f4f5]'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Jobs Table */}
      <div className="bg-white border border-[#e4e4e7] rounded-2xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="ds-table">
            <thead>
              <tr>
                <th>Job ID</th>
                <th>Site URL</th>
                <th>Viewport</th>
                <th>Status</th>
                <th className="text-right">Critical CSS</th>
                <th>LCP Candidate</th>
                <th className="text-right">Time</th>
                <th>Created</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredJobs.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-xs text-[#71717a] font-mono">
                    No optimization jobs in this view
                  </td>
                </tr>
              ) : (
                filteredJobs.map((job) => (
                  <tr key={job.id} className="hover:bg-[#fafafa]">
                    <td className="font-mono text-xs font-medium text-[#171717]">{job.id}</td>
                    <td>
                      <span className="font-mono text-xs text-[#3f3f46]">{job.url}</span>
                    </td>
                    <td>
                      <span className="font-mono text-[11px] uppercase bg-[#f4f4f5] px-2 py-0.5 rounded text-[#71717a]">
                        {job.viewport}
                      </span>
                    </td>
                    <td>
                      <span
                        className={`chip ${
                          job.status === 'completed'
                            ? 'chip-success'
                            : job.status === 'processing' || job.status === 'queued'
                            ? 'chip-warn'
                            : 'chip-danger'
                        }`}
                      >
                        <span className="chip-dot" />
                        {job.status === 'completed'
                          ? 'Completed'
                          : job.status === 'processing'
                          ? 'Extracting'
                          : job.status === 'queued'
                          ? 'Queued'
                          : 'Failed'}
                      </span>
                    </td>
                    <td className="text-right font-mono text-xs">
                      {job.criticalCssSizeKb ? `${job.criticalCssSizeKb} KB` : '—'}
                    </td>
                    <td>
                      {job.lcpSelector ? (
                        <code className="text-[11px] bg-[#f8f8f7] border border-[#e4e4e7] px-1.5 py-0.5 rounded text-[#3f3f46]">
                          {job.lcpSelector}
                        </code>
                      ) : (
                        <span className="text-[#a1a1aa] text-xs">—</span>
                      )}
                    </td>
                    <td className="text-right font-mono text-xs">
                      {job.durationMs ? `${(job.durationMs / 1000).toFixed(1)}s` : '—'}
                    </td>
                    <td>
                      <span className="meta">{job.createdAt}</span>
                    </td>
                    <td className="text-right">
                      <button
                        onClick={() => {
                          onRerunJob(job.id);
                          onToast(`Job ${job.id} re-dispatched to Cloudflare Queue`);
                        }}
                        className="btn btn-ghost text-xs py-1 px-2 text-[#71717a] hover:text-[#f03e2f]"
                        title="Re-run job"
                      >
                        <RotateCw className="w-3.5 h-3.5 mr-1" />
                        Re-run
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Manual Dispatch Modal */}
      {isDispatchModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
          <form
            onSubmit={handleDispatch}
            className="bg-white rounded-2xl border border-[#e4e4e7] p-6 max-w-md w-full shadow-2xl space-y-4"
          >
            <div className="flex items-center gap-3">
              <span className="w-8 h-8 rounded-lg bg-[#171717] text-white grid place-items-center">
                <Terminal className="w-4 h-4" />
              </span>
              <div>
                <h3 className="text-base font-semibold text-[#171717]">Dispatch Optimization Run</h3>
                <p className="text-xs text-[#71717a]">Runs Cloudflare Puppeteer AST Critical CSS Pipeline</p>
              </div>
            </div>

            <div className="space-y-3 pt-2">
              <div>
                <label className="block text-xs font-medium text-[#3f3f46] mb-1">Target Page URL</label>
                <input
                  type="url"
                  required
                  value={dispatchUrl}
                  onChange={(e) => setDispatchUrl(e.target.value)}
                  placeholder="https://example.com/shop"
                  className="w-full px-3 py-2 bg-white border border-[#e4e4e7] rounded-lg text-xs font-mono text-[#171717] focus:outline-none focus:border-[#f03e2f]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#3f3f46] mb-1">Viewport Matrix</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setDispatchViewport('mobile')}
                    className={`py-2 text-xs font-medium rounded-lg border transition-colors ${
                      dispatchViewport === 'mobile'
                        ? 'border-[#171717] bg-[#171717] text-white'
                        : 'border-[#e4e4e7] bg-white text-[#3f3f46]'
                    }`}
                  >
                    Mobile (393x852)
                  </button>
                  <button
                    type="button"
                    onClick={() => setDispatchViewport('desktop')}
                    className={`py-2 text-xs font-medium rounded-lg border transition-colors ${
                      dispatchViewport === 'desktop'
                        ? 'border-[#171717] bg-[#171717] text-white'
                        : 'border-[#e4e4e7] bg-white text-[#3f3f46]'
                    }`}
                  >
                    Desktop (1920x1080)
                  </button>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t border-[#f1f1f2]">
              <button
                type="button"
                onClick={() => setIsDispatchModalOpen(false)}
                className="btn btn-ghost text-xs"
              >
                Cancel
              </button>
              <button type="submit" className="btn btn-primary text-xs">
                Queue Run
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
