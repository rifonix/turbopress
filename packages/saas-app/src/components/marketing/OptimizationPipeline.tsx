const stages = [
  {
    step: 'Input',
    title: 'Render and audit',
    body: 'Each URL is reviewed from mobile and desktop viewports so above-the-fold CSS and LCP assets reflect real device behavior.',
  },
  {
    step: 'Engine',
    title: 'Extract and transform',
    body: 'The engine extracts Critical CSS, preserves responsive rules and fonts, identifies the LCP candidate, and prepares WebP/AVIF derivatives.',
  },
  {
    step: 'Delivery',
    title: 'Cache at the edge',
    body: 'Optimized assets and cacheable pages are delivered through an edge CDN with instant purge signals when content changes.',
  },
];

export function OptimizationPipeline() {
  return (
    <div className="mt-14 overflow-hidden rounded-3xl border border-[#e4e4e7] bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-[#e4e4e7] bg-[#fbfbfa] px-5 py-3.5">
        <p className="text-sm font-semibold">Optimization pipeline</p>
        <p className="meta">Mobile + desktop audit</p>
      </div>
      <div className="grid lg:grid-cols-[1fr_auto_1fr_auto_1fr]">
        {stages.map((stage, index) => (
          <div key={stage.title} className="contents">
            <article className="border-b border-[#e4e4e7] p-6 lg:border-b-0">
              <div className="flex items-center justify-between gap-4">
                <span className="rounded-full bg-[#fff1ef] px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-[#dc2e20]">
                  {stage.step}
                </span>
                <span className="num text-sm text-[#a1a1aa]">{String(index + 1).padStart(2, '0')}</span>
              </div>
              <h3 className="mt-5 text-base font-semibold tracking-[-0.01em]">{stage.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-[#71717a]">{stage.body}</p>
            </article>
            {index < stages.length - 1 && (
              <div aria-hidden="true" className="hidden items-center border-[#e4e4e7] px-3 lg:flex">
                <svg width="32" height="16" viewBox="0 0 32 16" fill="none">
                  <path d="M1 8h24m0 0-5-5m5 5-5 5" stroke="#f03e2f" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
