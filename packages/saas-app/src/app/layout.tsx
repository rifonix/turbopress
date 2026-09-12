import type { Metadata } from 'next';
import { ClerkProvider } from '@clerk/nextjs';
import { wpInstantClerkAppearance } from '@/components/auth/ClerkTheme';
import { site } from '@/lib/marketing';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(site.url),
  title: {
    default: 'WP Instant — Edge performance for WordPress',
    template: '%s · WP Instant',
  },
  description:
    'Automatic critical CSS, image transcoding, script delay, and full-page caching on the edge. Install the plugin and your WordPress site loads instantly.',
  icons: {
    icon: '/wp-instant-logo.svg',
    apple: '/wp-instant-logo.svg',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, 'max-image-preview': 'large', 'max-snippet': -1, 'max-video-preview': -1 },
  },
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#f8f8f7',
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
      appearance={wpInstantClerkAppearance}
      signInUrl="/sign-in"
      signUpUrl="/sign-up"
      signInFallbackRedirectUrl="/dashboard"
      signUpFallbackRedirectUrl="/dashboard"
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
