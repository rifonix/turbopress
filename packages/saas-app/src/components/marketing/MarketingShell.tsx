import { MarketingFooter } from './MarketingFooter';
import { MarketingHeader } from './MarketingHeader';

export function MarketingShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-[#f8f8f7] text-[#171717]">
      <a
        href="#main-content"
        className="sr-only z-50 rounded-lg bg-[#f03e2f] px-4 py-3 text-sm font-semibold text-white focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        Skip to main content
      </a>
      <MarketingHeader />
      <main id="main-content" className="flex-1">
        {children}
      </main>
      <MarketingFooter />
    </div>
  );
}
