export const site = {
  name: 'WP Instant',
  domain: 'wpinstant.dev',
  url: 'https://wpinstant.dev',
  description:
    'WP Instant is a zero-DNS WordPress performance platform with full-page caching, critical CSS, modern image delivery, script controls, and real-user Core Web Vitals monitoring.',
  keywords: [
    'WordPress speed optimization',
    'Core Web Vitals',
    'critical CSS',
    'WordPress caching plugin',
    'WooCommerce speed optimization',
    'edge CDN for WordPress',
    'LCP optimization',
  ],
} as const;

export const marketingNav = [
  { href: '/features', label: 'Features' },
  { href: '/pricing', label: 'Pricing' },
  { href: '/docs', label: 'Documentation' },
  { href: '/blog', label: 'Blog' },
  { href: '/contact', label: 'Contact' },
] as const;

export const footerNav = [
  {
    title: 'Product',
    links: [
      { href: '/features', label: 'Features' },
      { href: '/pricing', label: 'Pricing' },
      { href: '/docs', label: 'Documentation' },
      { href: '/changelog', label: 'Changelog' },
      { href: '/status', label: 'Status' },
    ],
  },
  {
    title: 'Resources',
    links: [
      { href: '/blog', label: 'Speed guides' },
      { href: '/docs/api', label: 'API reference' },
      { href: '/security', label: 'Security' },
      { href: '/support', label: 'Support' },
    ],
  },
  {
    title: 'Company',
    links: [
      { href: '/about', label: 'About' },
      { href: '/contact', label: 'Contact' },
      { href: '/privacy', label: 'Privacy' },
      { href: '/terms', label: 'Terms' },
    ],
  },
] as const;

type Plan = {
  id: string;
  name: string;
  description: string;
  monthly: number | null;
  annual: number | null;
  featured?: boolean;
  cta: 'Create account' | 'Contact us';
  features: string[];
};

// Values mirror packages/shared/src/plans.ts; annual is 20% below monthly.
export const pricingPlans: Plan[] = [
  {
    id: 'starter',
    name: 'Starter',
    description: 'For one WordPress site that needs a safer, faster baseline.',
    monthly: 19,
    annual: 16,
    cta: 'Create account',
    features: [
      '1 connected site',
      '250 optimization credits / month',
      '60,000 pageviews & 25 GB edge transfer',
      'Core cache and Critical CSS engine',
      'WooCommerce-safe dynamic handling',
      '30-day real-user health history',
    ],
  },
  {
    id: 'growth',
    name: 'Growth',
    description: 'For growing brands, stores, and small site fleets.',
    monthly: 49,
    annual: 39,
    featured: true,
    cta: 'Create account',
    features: [
      '5 connected sites',
      '1,500 optimization credits / month',
      '250,000 pageviews & 100 GB edge transfer',
      'Manual and automated crawl optimization',
      '90-day real-user health history',
      'Priority queue access',
    ],
  },
  {
    id: 'agency',
    name: 'Agency',
    description: 'For agencies managing a larger client fleet from one workspace.',
    monthly: 129,
    annual: 103,
    cta: 'Create account',
    features: [
      '25 connected sites',
      '6,000 optimization credits / month',
      '1.2M pageviews & 400 GB edge transfer',
      'Fleet-level jobs and health views',
      '1,500-page crawl limit per seed',
      '180-day real-user health history',
    ],
  },
  {
    id: 'scale',
    name: 'Scale',
    description: 'Contracted capacity for large fleets and dedicated browser workloads.',
    monthly: null,
    annual: null,
    cta: 'Contact us',
    features: [
      'Up to 100 sites with contracted limits',
      '40,000 optimization credits / month',
      'Custom concurrency and crawl allowance',
      'Dedicated support and SLA options',
    ],
  },
];

type Faq = { question: string; answer: string };

export const homepageFaqs: Faq[] = [
  {
    question: 'How is WP Instant different from a normal caching plugin?',
    answer:
      'A conventional plugin usually ships a list of switches. WP Instant combines a WordPress-side drop-in cache with a real-browser optimization engine that audits mobile and desktop renderings, extracts Critical CSS, identifies LCP assets, creates modern image derivatives, and reports real-user vitals from the live site.',
  },
  {
    question: 'Will WP Instant work with WooCommerce?',
    answer:
      'Yes. WooCommerce-safe dynamic handling is included in every self-serve plan. Cache exclusion, nonce refresh, and cart micro-hydration are designed to keep cart and checkout behavior correct while static assets around the store remain optimized.',
  },
  {
    question: 'Do I have to change my host, DNS, or CDN provider?',
    answer:
      'No. The platform uses a zero-DNS connection model. You install the WordPress plugin and complete a signed one-click handshake; it works alongside your existing host without requiring a DNS migration.',
  },
  {
    question: 'Which optimization presets are available?',
    answer:
      'Safe Mode provides drop-in caching and prerendering foundations. Aggressive adds Critical CSS and LCP priority loading. Ludicrous adds the three-tier interaction-delayed JavaScript queue and dynamic nonce/cart hydration.',
  },
  {
    question: 'How much optimization capacity do I get?',
    answer:
      'Plans include monthly optimization credits: 250 for Starter, 1,500 for Growth, 6,000 for Agency, and 40,000 for Scale. A mobile and desktop dispatch consumes one credit, and unused credits follow the entitlement policy in your dashboard.',
  },
  {
    question: 'Can agencies manage multiple WordPress sites?',
    answer:
      'Yes. The Agency plan supports up to 25 sites, fleet-level jobs and health views, 1,500-page crawl seeds, and 180 days of real-user health history. Scale supports up to 100 sites with contracted capacity.',
  },
];
