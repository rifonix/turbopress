import type { Metadata } from 'next';
import { PlaceholderPage } from '@/components/marketing/PlaceholderPage';

export const metadata: Metadata = {
  title: 'Features',
  description:
    'Explore WP Instant features for WordPress: full-page caching, Critical CSS, WebP/AVIF delivery, script delay, WooCommerce-safe dynamic handling, and real-user Core Web Vitals.',
  alternates: { canonical: '/features' },
};

export default function FeaturesPage() {
  return (
    <PlaceholderPage
      title="WP Instant feature deep dives"
      description="This page will organize caching, Critical CSS, media, JavaScript, WooCommerce, and telemetry capabilities into detailed, comparison-ready sections."
    />
  );
}
