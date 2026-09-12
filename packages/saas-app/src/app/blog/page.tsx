import type { Metadata } from 'next';
import { PlaceholderPage } from '@/components/marketing/PlaceholderPage';

export const metadata: Metadata = {
  title: 'Blog & Speed Guides',
  description: 'WordPress Core Web Vitals guides, performance case studies, caching techniques, and product updates from WP Instant.',
  alternates: { canonical: '/blog' },
};

export default function BlogPage() {
  return (
    <PlaceholderPage
      title="Speed guides and product notes"
      description="This placeholder will host practical WordPress performance guides, LCP and CLS teardowns, WooCommerce caching explainers, and release updates."
    />
  );
}
