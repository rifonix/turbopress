import type { Metadata } from 'next';
import { PlaceholderPage } from '@/components/marketing/PlaceholderPage';

export const metadata: Metadata = {
  title: 'Terms',
  description: 'WP Instant terms of service for WordPress optimization plans, usage limits, billing, and platform availability.',
  alternates: { canonical: '/terms' },
};

export default function TermsPage() {
  return (
    <PlaceholderPage
      title="Terms of service"
      description="This placeholder will cover acceptable use, service entitlements, billing, credits, availability, support, and termination."
    />
  );
}
