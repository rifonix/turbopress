import type { Metadata } from 'next';
import { PlaceholderPage } from '@/components/marketing/PlaceholderPage';

export const metadata: Metadata = {
  title: 'Contact',
  description: 'Contact the WP Instant team about WordPress optimization, Scale capacity, onboarding, support, or partnership questions.',
  alternates: { canonical: '/contact' },
};

export default function ContactPage() {
  return (
    <PlaceholderPage
      title="Talk to WP Instant"
      description="This page will include a short qualification form for Scale capacity, agency onboarding, migration questions, and support escalation."
    />
  );
}
