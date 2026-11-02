import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  /** Abilita output standalone per il Dockerfile self-host. */
  output: 'standalone',
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      '*.css': {
        loaders: ['@tailwindcss/turbopack'],
        as: '*.css',
      },
    },
  },
};

export default nextConfig;
