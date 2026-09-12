import type { Metadata } from 'next';
import { PlaceholderPage } from '@/components/marketing/PlaceholderPage';

export const metadata: Metadata = {
  title: 'Status',
  description: 'Operational status for the WP Instant edge delivery, optimization pipeline, and dashboard services.',
  alternates: { canonical: '/status' },
};

export default function StatusPage() {
  return (
    <PlaceholderPage
      title="Service status"
      description="This placeholder will report current operational status, incident history, and scheduled maintenance for edge delivery and optimization jobs."
    />
  );
}
