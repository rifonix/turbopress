import type { Metadata } from 'next';
import { PlaceholderPage } from '@/components/marketing/PlaceholderPage';

export const metadata: Metadata = {
  title: 'API Reference',
  description: 'API reference for authenticated WP Instant site, optimization job, cache, asset, and telemetry operations.',
  alternates: { canonical: '/docs/api' },
};

export default function ApiDocsPage() {
  return (
    <PlaceholderPage
      title="API reference"
      description="This placeholder will document endpoints, authentication, request contracts, job status, entitlements, cache operations, and webhook verification."
    />
  );
}
