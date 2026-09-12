import type { MetadataRoute } from 'next';
import { site } from '@/lib/marketing';

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const routes: { path: string; priority: number; changeFrequency: 'weekly' | 'monthly' | 'yearly' }[] = [
    { path: '', priority: 1, changeFrequency: 'weekly' },
    { path: '/features', priority: 0.9, changeFrequency: 'monthly' },
    { path: '/pricing', priority: 0.9, changeFrequency: 'monthly' },
    { path: '/docs', priority: 0.8, changeFrequency: 'monthly' },
    { path: '/blog', priority: 0.8, changeFrequency: 'weekly' },
    { path: '/about', priority: 0.5, changeFrequency: 'monthly' },
    { path: '/contact', priority: 0.6, changeFrequency: 'monthly' },
    { path: '/security', priority: 0.5, changeFrequency: 'monthly' },
    { path: '/changelog', priority: 0.5, changeFrequency: 'weekly' },
    { path: '/status', priority: 0.4, changeFrequency: 'weekly' },
    { path: '/support', priority: 0.6, changeFrequency: 'monthly' },
    { path: '/privacy', priority: 0.3, changeFrequency: 'yearly' },
    { path: '/terms', priority: 0.3, changeFrequency: 'yearly' },
  ];

  return routes.map((route) => ({
    url: `${site.url}${route.path}`,
    lastModified: now,
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }));
}
