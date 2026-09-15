import { NextResponse, type NextRequest, type NextFetchEvent } from 'next/server';
import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';

const isEmbedRoute = createRouteMatcher(['/embed(.*)']);

const isPublicRoute = createRouteMatcher([
  '/',
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/sso-callback(.*)',
  '/connect(.*)',
  '/embed(.*)',
  '/api/(.*)',
  '/health',
  '/robots.txt',
  '/favicon.ico',
  '/icon',
  // Marketing site — public, no auth protection. Without these every
  // logged-out visit (and the SPA's RSC prefetch) redirects to Clerk's
  // hosted sign-in, which dies as a cross-origin fetch (the CORS errors).
  '/features(.*)',
  '/pricing(.*)',
  '/about(.*)',
  '/contact(.*)',
  '/support(.*)',
  '/status(.*)',
  '/changelog(.*)',
  '/blog(.*)',
  '/docs(.*)',
  '/security(.*)',
  '/privacy(.*)',
  '/terms(.*)',
  '/sitemap(.*)',
  '/opengraph-image(.*)',
]);

const clerkHandler = clerkMiddleware(async (auth, request) => {
  if (!isPublicRoute(request)) {
    await auth.protect();
  }
});

export default async function middleware(request: NextRequest, event: NextFetchEvent) {
  // The embed panel is only ever rendered inside the plugin's iframe.
  // Top-level browser navigation (sec-fetch-dest: document) is rejected —
  // iframe/fetch navigations carry different dest values and pass through,
  // with the HMAC token still gating all data access.
  if (isEmbedRoute(request) && request.headers.get('sec-fetch-dest') === 'document') {
    return NextResponse.json(
      { error: 'Embed panel is only available inside the WordPress dashboard.' },
      { status: 403 }
    );
  }
  return clerkHandler(request, event);
}

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Always run for API routes
    '/(api|trpc)(.*)',
  ],
};
