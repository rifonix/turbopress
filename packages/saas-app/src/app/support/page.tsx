import type { Metadata } from 'next';
import { PlaceholderPage } from '@/components/marketing/PlaceholderPage';

export const metadata: Metadata = {
  title: 'Support',
  description: 'Get help with WP Instant setup, optimization jobs, cache behavior, WooCommerce compatibility, billing, and site health.',
  alternates: { canonical: '/support' },
};

export default function SupportPage() {
  return (
    <PlaceholderPage
      title="Support"
      description="This placeholder will connect self-serve documentation with account support and Scale/Agency escalation paths."
    />
  );
}
