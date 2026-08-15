import type { NextConfig } from 'next';
import { initOpenNextCloudflareForDev } from '@opennextjs/cloudflare';

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: false,
  },
};

// Only initialize OpenNext local bindings during dev mode
if (process.env.NODE_ENV === 'development') {
  initOpenNextCloudflareForDev();
}

export default nextConfig;
