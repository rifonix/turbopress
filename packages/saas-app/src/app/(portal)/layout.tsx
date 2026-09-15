import type { ReactNode } from 'react';
import { ClerkProvider } from '@clerk/nextjs';
import { wpInstantClerkAppearance } from '@/components/auth/ClerkTheme';

const PUBLISHABLE_KEY =
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ||
  'pk_test_YnJpZWYtbWVlcmthdC0zMC5jbGVyay5hY2NvdW50cy5kZXYk';

/**
 * Portal routes (dashboard, sign-in/up, sso-callback, connect, embed) are
 * the ONLY Clerk consumers. Marketing pages live at the root with a
 * Clerk-free layout — no Clerk SDK, keys, or auth redirects there.
 */
export default function PortalLayout({ children }: { children: ReactNode }) {
  return (
    <ClerkProvider
      publishableKey={PUBLISHABLE_KEY}
      appearance={wpInstantClerkAppearance}
      signInUrl="/sign-in"
      signUpUrl="/sign-up"
      signInFallbackRedirectUrl="/dashboard"
      signUpFallbackRedirectUrl="/dashboard"
    >
      {children}
    </ClerkProvider>
  );
}
