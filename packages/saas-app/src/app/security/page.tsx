import type { Metadata } from 'next';
import { PlaceholderPage } from '@/components/marketing/PlaceholderPage';

export const metadata: Metadata = {
  title: 'Security',
  description: 'Security practices for WP Instant site pairing, signed delivery, tenant isolation, API access, and data handling.',
  alternates: { canonical: '/security' },
};

export default function SecurityPage() {
  return (
    <PlaceholderPage
      title="Security"
      description="This placeholder will document signed pairing, tenant isolation, credential handling, webhook verification, incident reporting, and operational safeguards."
    />
  );
}
