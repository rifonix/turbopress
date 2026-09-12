import { Gauge, Globe, Timer, Zap } from 'lucide-react';

const metrics = [
  { label: 'Avg mobile score', value: '97', suffix: '', status: '90+ target', width: '97%', color: '#16a34a' },
  { label: 'Median LCP', value: '1.2', suffix: 's', status: 'Good', width: '30%', color: '#16a34a' },
  { label: 'Edge cache hit rate', value: '92', suffix: '%', status: 'Active', width: '92%', color: '#f03e2f' },
  { label: 'Connected sites', value: '3', suffix: '', status: 'Online', width: '100%', color: '#171717' },
];

const siteRows = [
  { domain: 'store.example.com', status: 'Optimized', score: 98, tone: 'success' },
  { domain: 'news.example.com', status: 'Optimized', score: 96, tone: 'success' },
  { domain: 'portfolio.example.com', status: 'Optimizing', score: 94, tone: 'warning' },
];

function ScoreRing({ score }: { score: number }) {
  const radius = 15.5;
  const circumference = 2 * Math.PI * radius;

  return (
    <span className="relative inline-grid h-9 w-9 place-items-center" role="img" aria-label={`Score ${score}`}>
      <svg className="-rotate-90" width="36" height="36" viewBox="0 0 38 38" aria-hidden="true">
        <circle cx="19" cy="19" r={radius} fill="none" stroke="#f1f1f2" strokeWidth="3" />
        <circle
          cx="19"
          cy="19"
          r={radius}
          fill="none"
          stroke="#16a34a"
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - score / 100)}
        />
      </svg>
      <span className="num absolute inset-0 grid place-items-center text-[11px] font-semibold">{score}</span>
    </span>
  );
}

export function HeroDashboard() {
  return (
    <div className="overflow-hidden rounded-3xl border border-[#e4e4e7] bg-white shadow-[0_2px_6px_rgba(23,23,23,0.06),0_32px_80px_rgba(23,23,23,0.12)]">
      <div className="flex h-11 items-center gap-2 border-b border-[#e4e4e7] bg-[#fbfbfa] px-4">
        <span className="h-2.5 w-2.5 rounded-full bg-[#f03e2f]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#f59e0b]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#16a34a]" />
        <span className="ml-3 rounded-md border border-[#e4e4e7] bg-white px-3 py-1 font-mono text-[10px] text-[#71717a]">
          app.wpinstant.dev/dashboard
        </span>
      </div>

      <div className="grid min-h-[25rem] lg:grid-cols-[180px_1fr]">
        <aside className="hidden border-r border-[#e4e4e7] bg-[#fbfbfa] p-4 lg:block" aria-hidden="true">
          <div className="flex items-center gap-2 px-1 pb-4">
            <span className="grid h-6 w-6 place-items-center rounded-lg bg-[#171717] text-white">
              <Zap className="h-3 w-3" />
            </span>
            <span className="text-xs font-semibold">Engine</span>
          </div>
          {[
            { icon: Gauge, label: 'Overview', active: true },
            { icon: Globe, label: 'Sites' },
            { icon: Timer, label: 'Jobs' },
          ].map((item) => (
            <div
              key={item.label}
              className={`mb-1 flex items-center gap-2 rounded-md px-2.5 py-2 text-[12px] font-medium ${
                item.active ? 'bg-[#f4f4f5] text-[#171717]' : 'text-[#71717a]'
              }`}
            >
              <item.icon className={`h-3.5 w-3.5 ${item.active ? 'text-[#f03e2f]' : ''}`} />
              {item.label}
            </div>
          ))}
        </aside>

        <section aria-label="Example WP Instant dashboard preview" className="p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-base font-semibold tracking-[-0.02em]">Fleet Overview</p>
              <p className="meta mt-0.5">Product preview · example data</p>
            </div>
            <div className="flex items-center gap-2 rounded-lg border border-[#e4e4e7] bg-[#f8f8f7] px-3 py-2">
              <span className="font-mono text-[10px] text-[#71717a]">Ludicrous preset</span>
              <span className="h-1.5 w-1.5 rounded-full bg-[#16a34a]" />
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 xl:grid-cols-4">
            {metrics.map((metric) => (
              <div key={metric.label} className="rounded-xl border border-[#e4e4e7] bg-white p-3.5 shadow-sm">
                <p className="text-[10px] font-medium uppercase tracking-wider text-[#71717a]">{metric.label}</p>
                <p className="mt-1 flex items-baseline justify-between text-2xl font-semibold text-[#171717]">
                  <span className="num">
                    {metric.value}
                    {metric.suffix && <span className="text-sm font-normal text-[#71717a]">{metric.suffix}</span>}
                  </span>
                  <span className="font-mono text-[9px] font-medium text-[#16a34a]">{metric.status}</span>
                </p>
                <div className="mt-2 h-1 rounded-full bg-[#f1f1f2]">
                  <div className="h-full rounded-full" style={{ width: metric.width, backgroundColor: metric.color }} />
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 grid gap-3 xl:grid-cols-[1.1fr_0.9fr]">
            <div className="overflow-hidden rounded-xl border border-[#e4e4e7]">
              <div className="flex items-center justify-between border-b border-[#e4e4e7] bg-[#fafafa] px-3 py-2">
                <p className="text-xs font-semibold">All sites</p>
                <p className="meta">3 managed</p>
              </div>
              <table className="w-full text-left">
                <thead>
                  <tr className="font-mono text-[8px] uppercase tracking-wider text-[#71717a]">
                    <th className="px-3 py-2 font-medium">Site</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                    <th className="px-3 py-2 text-right font-medium">Score</th>
                  </tr>
                </thead>
                <tbody>
                  {siteRows.map((row) => (
                    <tr key={row.domain} className="border-t border-[#f1f1f2]">
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <span className="grid h-5 w-5 place-items-center rounded-md bg-[#171717] text-[9px] font-bold text-white">
                            {row.domain[0].toUpperCase()}
                          </span>
                          <span className="font-mono text-[10px]">{row.domain}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[8px] font-medium ${
                            row.tone === 'success'
                              ? 'border-[#dcfce7] bg-[#f0fdf4] text-[#15803d]'
                              : 'border-[#fef3c7] bg-[#fffbeb] text-[#b45309]'
                          }`}
                        >
                          <span className="h-1 w-1 rounded-full bg-current" />
                          {row.status}
                        </span>
                      </td>
                      <td className="px-3 py-1.5 text-right">
                        <ScoreRing score={row.score} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="rounded-xl border border-[#e4e4e7] bg-white p-3.5">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold">Optimization throughput</p>
                <p className="meta">7 days</p>
              </div>
              <div className="mt-4 flex h-24 items-end gap-1.5">
                {[43, 65, 52, 78, 88, 70, 94].map((height, index) => (
                  <div key={`${height}-${index}`} className="flex-1">
                    <div
                      className={`w-full rounded-t-[3px] ${index === 6 ? 'bg-[#f03e2f]' : 'bg-[#fff1ef]'}`}
                      style={{ height: `${height}%` }}
                    />
                  </div>
                ))}
              </div>
              <div className="mt-2 flex items-center justify-between text-[8px] font-medium text-[#71717a]">
                <span>Mon</span>
                <span>Sun</span>
              </div>
              <div className="mt-3 flex items-center justify-between border-t border-[#f1f1f2] pt-3">
                <span className="meta">Mobile + desktop dispatches</span>
                <span className="num text-xs font-semibold text-[#f03e2f]">2,480</span>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
