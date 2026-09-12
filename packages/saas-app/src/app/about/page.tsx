import type { Metadata } from 'next';
import { PlaceholderPage } from '@/components/marketing/PlaceholderPage';

export const metadata: Metadata = {
  title: 'About',
  description: 'WP Instant builds automated WordPress performance infrastructure for faster pages and measurable Core Web Vitals.',
  alternates: { canonical: '/about' },
};

export default function AboutPage() {
  return (
    <PlaceholderPage
      title="About WP Instant"
      description="This placeholder will explain the product thesis, zero-DNS design, optimization engine approach, and roadmap."
    />
  );
}
