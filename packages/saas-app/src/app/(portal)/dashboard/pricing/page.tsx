import { redirect } from 'next/navigation';

// Plans & Upgrades lives on the Billing page now (plan comparison table with
// Activated / Upgrade / Downgrade actions). Keep this route as a permanent
// redirect so old links and bookmarks never 404.
export default function PricingPage() {
  redirect('/dashboard/billing');
}
