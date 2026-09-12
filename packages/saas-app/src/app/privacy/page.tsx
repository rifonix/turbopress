import type { Metadata } from 'next';
import { PlaceholderPage } from '@/components/marketing/PlaceholderPage';

export const metadata: Metadata = {
  title: 'Privacy',
  description: 'WP Instant privacy policy information for account data, WordPress telemetry, edge delivery, and support communications.',
  alternates: { canonical: '/privacy' },
};

export default function PrivacyPage() {
  return (
    <PlaceholderPage
      title="Privacy policy"
      description="This placeholder will describe account data, site telemetry, edge delivery logs, retention, processors, and user rights."
    />
  );
}
