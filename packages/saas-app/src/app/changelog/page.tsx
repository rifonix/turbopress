import type { Metadata } from 'next';
import { PlaceholderPage } from '@/components/marketing/PlaceholderPage';

export const metadata: Metadata = {
  title: 'Changelog',
  description: 'WP Instant platform and WordPress plugin release notes.',
  alternates: { canonical: '/changelog' },
};

export default function ChangelogPage() {
  return (
    <PlaceholderPage
      title="Changelog"
      description="This placeholder will track platform improvements, plugin releases, optimization engine changes, and behavior fixes."
    />
  );
}
