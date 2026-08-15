import type { Metadata } from 'next';
import { ClerkProvider } from '@clerk/nextjs';
import { turbopressClerkAppearance } from '@/components/auth/ClerkTheme';
import './globals.css';

export const metadata: Metadata = {
  title: 'TurboPress Engine · Zero-DNS WordPress Optimization SaaS',
  description:
    'High-Performance Zero-DNS WordPress Performance Platform. Automated Critical CSS, sub-15ms edge caching, 3-tier JavaScript deferral, and dynamic nonce micro-hydration on Cloudflare Workers.',
  icons: {
    icon: '/favicon.ico',
  },
};

const PUBLISHABLE_KEY =
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ||
  'pk_test_YnJpZWYtbWVlcmthdC0zMC5jbGVyay5hY2NvdW50cy5kZXYk';

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ClerkProvider
      publishableKey={PUBLISHABLE_KEY}
      appearance={turbopressClerkAppearance}
      signInUrl="/sign-in"
      signUpUrl="/sign-up"
      signInFallbackRedirectUrl="/"
      signUpFallbackRedirectUrl="/"
      signInForceRedirectUrl="/"
      signUpForceRedirectUrl="/"
    >
      <html lang="en">
        <head>
          <link rel="preconnect" href="https://fonts.googleapis.com" />
          <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
          <link
            href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Roboto+Mono:wght@400;500;600&display=swap"
            rel="stylesheet"
          />
        </head>
        <body className="min-h-screen bg-[#f8f8f7] text-[#171717] antialiased">
          {children}
        </body>
      </html>
    </ClerkProvider>
  );
}
