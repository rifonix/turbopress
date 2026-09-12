import type { Metadata } from 'next';
import { PlaceholderPage } from '@/components/marketing/PlaceholderPage';

export const metadata: Metadata = {
  title: 'Documentation',
  description:
    'WP Instant documentation for installing the WordPress plugin, pairing a site, choosing a performance preset, running optimizations, and using real-user monitoring.',
  alternates: { canonical: '/docs' },
};

export default function DocsPage() {
  return (
    <PlaceholderPage
      title="Documentation is being organized"
      description="This area will contain installation, one-click pairing, optimization presets, cache behavior, WooCommerce controls, crawl jobs, telemetry, and troubleshooting guides."
    />
  );
}
